import { faceSafetyAiLimitAt } from './image-enhancer-face-safety.js';
import {
  resolveRegionRestorationPlan,
  resolveRegionProcessedWeight,
  resolveRegionEdgeBoost
} from './image-enhancer-region-restoration.js';

const cancelled = new Set();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const byte = value => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));

function adjustedRgb(r, g, b, local, analysis) {
  if (!local) return [r, g, b];
  const softness = Number(analysis?.softness) || 0;
  const lowDetail = Number(analysis?.lowDetail) || 0;
  const noise = Number(analysis?.noise) || 0;
  const contrast = clamp(1.045 + softness * 0.025 + lowDetail * 0.02 - noise * 0.01, 1.04, 1.09);
  const saturation = clamp(1.025 + lowDetail * 0.02, 1.02, 1.05);
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const lifted = clamp((y - 128) * contrast + 128, 0, 255);
  return [
    byte(lifted + (r - y) * saturation),
    byte(lifted + (g - y) * saturation),
    byte(lifted + (b - y) * saturation)
  ];
}

function luma(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

async function packTile(bitmap, width, height, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Worker tile canvas is unavailable.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    tensor[i] = rgba[p] / 255;
    tensor[plane + i] = rgba[p + 1] / 255;
    tensor[plane * 2 + i] = rgba[p + 2] / 255;
  }
  return { buffer: tensor.buffer, width, height };
}

async function tensorToBitmap(buffer, width, height, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  const values = new Float32Array(buffer);
  const plane = width * height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Worker output canvas is unavailable.');
  const image = ctx.createImageData(width, height);
  let maxProbe = 0;
  const probeStep = Math.max(1, Math.floor(plane / 1024));
  for (let i = 0; i < plane; i += probeStep) {
    maxProbe = Math.max(maxProbe, Math.abs(values[i]), Math.abs(values[plane + i]), Math.abs(values[plane * 2 + i]));
  }
  const multiplier = maxProbe > 2 ? 1 : 255;
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    image.data[p] = byte(values[i] * multiplier);
    image.data[p + 1] = byte(values[plane + i] * multiplier);
    image.data[p + 2] = byte(values[plane * 2 + i] * multiplier);
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.transferToImageBitmap();
}

async function adaptiveDeblurBlend(sourceBitmap, deblurBitmap, analysis, faces, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  const width = sourceBitmap.width;
  const height = sourceBitmap.height;
  if (deblurBitmap.width !== width || deblurBitmap.height !== height) {
    sourceBitmap.close?.();
    deblurBitmap.close?.();
    throw new Error('Deblur fidelity blend requires matching image dimensions.');
  }

  const output = new OffscreenCanvas(width, height);
  const outputCtx = output.getContext('2d', { alpha: false });
  if (!outputCtx) throw new Error('Deblur fidelity output canvas is unavailable.');

  const TILE = 256;
  const sourceScratch = new OffscreenCanvas(TILE + 2, TILE + 2);
  const deblurScratch = new OffscreenCanvas(TILE + 2, TILE + 2);
  const sourceCtx = sourceScratch.getContext('2d', { willReadFrequently: true, alpha: false });
  const deblurCtx = deblurScratch.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!sourceCtx || !deblurCtx) throw new Error('Deblur fidelity workspace is unavailable.');

  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
      const coreW = Math.min(TILE, width - x);
      const coreH = Math.min(TILE, height - y);
      const sx = Math.max(0, x - 1);
      const sy = Math.max(0, y - 1);
      const ex = Math.min(width, x + coreW + 1);
      const ey = Math.min(height, y + coreH + 1);
      const readW = ex - sx;
      const readH = ey - sy;
      const offsetX = x - sx;
      const offsetY = y - sy;

      sourceScratch.width = readW;
      sourceScratch.height = readH;
      deblurScratch.width = readW;
      deblurScratch.height = readH;
      sourceCtx.drawImage(sourceBitmap, sx, sy, readW, readH, 0, 0, readW, readH);
      deblurCtx.drawImage(deblurBitmap, sx, sy, readW, readH, 0, 0, readW, readH);

      const source = sourceCtx.getImageData(0, 0, readW, readH).data;
      const deblurred = deblurCtx.getImageData(0, 0, readW, readH).data;
      const core = outputCtx.createImageData(coreW, coreH);
      const dst = core.data;

      for (let cy = 0; cy < coreH; cy++) {
        const py = cy + offsetY;
        for (let cx = 0; cx < coreW; cx++) {
          const px = cx + offsetX;
          const center = (py * readW + px) * 4;
          const left = (py * readW + Math.max(0, px - 1)) * 4;
          const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
          const up = (Math.max(0, py - 1) * readW + px) * 4;
          const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
          const out = (cy * coreW + cx) * 4;

          const sourceY = luma(source, center);
          const deblurY = luma(deblurred, center);
          const sourceEdge = (
            Math.abs(sourceY - luma(source, left)) +
            Math.abs(sourceY - luma(source, right)) +
            Math.abs(sourceY - luma(source, up)) +
            Math.abs(sourceY - luma(source, down))
          ) * 0.25;
          const deblurEdge = (
            Math.abs(deblurY - luma(deblurred, left)) +
            Math.abs(deblurY - luma(deblurred, right)) +
            Math.abs(deblurY - luma(deblurred, up)) +
            Math.abs(deblurY - luma(deblurred, down))
          ) * 0.25;

          const recoveredDetail = clamp((deblurEdge - sourceEdge) / 18, 0, 1);
          const lostDetail = clamp((sourceEdge - deblurEdge) / 12, 0, 1);
          const deviation = clamp((Math.abs(deblurY - sourceY) - 5) / 30, 0, 1);

          // Region-aware deblur: retain the photographed source in smooth
          // areas, allow stronger reconstruction where source structure supports
          // it, and keep the face-safety ceiling as the final authority.
          const faceLimit = faceSafetyAiLimitAt(x + cx, y + cy, faces);
          const deblurPlan = resolveRegionRestorationPlan(analysis, 'deblur');
          let weight = resolveRegionProcessedWeight({
            sourceEdge,
            sourceResidual: Math.abs(sourceY - (
              luma(source, left) + luma(source, right) + luma(source, up) + luma(source, down)
            ) * 0.25),
            deviation: Math.abs(deblurY - sourceY),
            faceLimit,
            plan: deblurPlan
          });

          // When NAFNet recovers a real edge that was weaker in the source,
          // allow a small additional contribution outside protected faces.
          if (faceLimit >= 0.999) {
            weight += recoveredDetail * 0.05 * deblurPlan.detailDemand;
            weight -= lostDetail * 0.10;
          }
          weight = clamp(weight, 0.54, Math.min(0.98, faceLimit));

          for (let channel = 0; channel < 3; channel++) {
            dst[out + channel] = byte(
              source[center + channel] +
              (deblurred[center + channel] - source[center + channel]) * weight
            );
          }
          dst[out + 3] = 255;
        }
      }

      outputCtx.putImageData(core, x, y);
      await Promise.resolve();
    }
  }

  sourceBitmap.close?.();
  deblurBitmap.close?.();
  return output.transferToImageBitmap();
}

async function regionAwareRestore(sourceBitmap, processedBitmap, analysis, faces, mode, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  const width = processedBitmap.width;
  const height = processedBitmap.height;
  if (!width || !height || !sourceBitmap.width || !sourceBitmap.height) {
    sourceBitmap.close?.();
    processedBitmap.close?.();
    throw new Error('Region-aware restoration received invalid image dimensions.');
  }

  const plan = resolveRegionRestorationPlan(analysis, mode);
  const output = new OffscreenCanvas(width, height);
  const outputCtx = output.getContext('2d', { alpha: false });
  if (!outputCtx) throw new Error('Region-aware restoration output canvas is unavailable.');

  const TILE = 256;
  const sourceScratch = new OffscreenCanvas(TILE + 2, TILE + 2);
  const resultScratch = new OffscreenCanvas(TILE + 2, TILE + 2);
  const sourceCtx = sourceScratch.getContext('2d', { willReadFrequently: true, alpha: false });
  const resultCtx = resultScratch.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!sourceCtx || !resultCtx) throw new Error('Region-aware restoration workspace is unavailable.');

  const scaleX = sourceBitmap.width / width;
  const scaleY = sourceBitmap.height / height;

  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');

      const coreW = Math.min(TILE, width - x);
      const coreH = Math.min(TILE, height - y);
      const sx = Math.max(0, x - 1);
      const sy = Math.max(0, y - 1);
      const ex = Math.min(width, x + coreW + 1);
      const ey = Math.min(height, y + coreH + 1);
      const readW = ex - sx;
      const readH = ey - sy;
      const offsetX = x - sx;
      const offsetY = y - sy;

      sourceScratch.width = readW;
      sourceScratch.height = readH;
      resultScratch.width = readW;
      resultScratch.height = readH;

      sourceCtx.drawImage(
        sourceBitmap,
        sx * scaleX,
        sy * scaleY,
        readW * scaleX,
        readH * scaleY,
        0,
        0,
        readW,
        readH
      );
      resultCtx.drawImage(processedBitmap, sx, sy, readW, readH, 0, 0, readW, readH);

      const source = sourceCtx.getImageData(0, 0, readW, readH).data;
      const processed = resultCtx.getImageData(0, 0, readW, readH).data;
      const core = outputCtx.createImageData(coreW, coreH);
      const dst = core.data;

      for (let cy = 0; cy < coreH; cy++) {
        const py = cy + offsetY;
        for (let cx = 0; cx < coreW; cx++) {
          const px = cx + offsetX;
          const center = (py * readW + px) * 4;
          const left = (py * readW + Math.max(0, px - 1)) * 4;
          const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
          const up = (Math.max(0, py - 1) * readW + px) * 4;
          const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
          const out = (cy * coreW + cx) * 4;

          const sourceY = luma(source, center);
          const sourceNeighbour = (
            luma(source, left) +
            luma(source, right) +
            luma(source, up) +
            luma(source, down)
          ) * 0.25;
          const sourceEdge = (
            Math.abs(sourceY - luma(source, left)) +
            Math.abs(sourceY - luma(source, right)) +
            Math.abs(sourceY - luma(source, up)) +
            Math.abs(sourceY - luma(source, down))
          ) * 0.25;
          const sourceResidual = Math.abs(sourceY - sourceNeighbour);

          const resultY = luma(processed, center);
          const resultEdge = (
            Math.abs(resultY - luma(processed, left)) +
            Math.abs(resultY - luma(processed, right)) +
            Math.abs(resultY - luma(processed, up)) +
            Math.abs(resultY - luma(processed, down))
          ) * 0.25;
          const deviation = Math.abs(resultY - sourceY);

          const sourceX = (x + cx) * scaleX;
          const sourceYCoord = (y + cy) * scaleY;
          const faceLimit = faceSafetyAiLimitAt(sourceX, sourceYCoord, faces);

          const processedWeight = resolveRegionProcessedWeight({
            sourceEdge,
            sourceResidual,
            deviation,
            faceLimit,
            plan
          });

          const edgeBoost = resolveRegionEdgeBoost({
            sourceEdge,
            resultEdge,
            faceLimit,
            plan
          });

          const resultNeighbour = (
            luma(processed, left) +
            luma(processed, right) +
            luma(processed, up) +
            luma(processed, down)
          ) * 0.25;
          const resultHighPass = resultY - resultNeighbour;
          const boundedEdgeCorrection = clamp(
            resultHighPass * edgeBoost * 0.28,
            -plan.maxEdgeBoost,
            plan.maxEdgeBoost
          );

          let toneDelta = 0;
          if (plan.shadowLift > 0 && resultY < 112) {
            toneDelta += plan.shadowLift * clamp((112 - resultY) / 112, 0, 1);
          }
          if (plan.highlightCompression > 0 && resultY > 180) {
            toneDelta -= plan.highlightCompression * clamp((resultY - 180) / 75, 0, 1);
          }
          if (plan.contrastGain > 0) {
            toneDelta += (resultY - 128) * plan.contrastGain;
          }

          const smoothNoiseBlend = clamp(
            plan.cleanupDemand *
            clamp((5 - sourceEdge) / 5, 0, 1) *
            0.08,
            0,
            0.08
          );

          for (let channel = 0; channel < 3; channel++) {
            const sourceValue = source[center + channel];
            const processedValue = processed[center + channel];
            const neighbourValue = (
              processed[left + channel] +
              processed[right + channel] +
              processed[up + channel] +
              processed[down + channel]
            ) * 0.25;

            let value = sourceValue + (processedValue - sourceValue) * processedWeight;
            value = value * (1 - smoothNoiseBlend) + neighbourValue * smoothNoiseBlend;
            value += boundedEdgeCorrection + toneDelta;
            dst[out + channel] = byte(value);
          }
          dst[out + 3] = 255;
        }
      }

      outputCtx.putImageData(core, x, y);
      await Promise.resolve();
    }
  }

  sourceBitmap.close?.();
  processedBitmap.close?.();
  return output.transferToImageBitmap();
}

async function postprocess(bitmap, local, analysis, sharpening, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  const width = bitmap.width;
  const height = bitmap.height;
  const amount = Number(sharpening?.amount) || 0;
  const threshold = Number(sharpening?.threshold) || 255;
  const maxDelta = Number(sharpening?.maxDelta) || 0;
  if (!local && !amount) return bitmap;

  const output = new OffscreenCanvas(width, height);
  const outputCtx = output.getContext('2d', { alpha: true });
  if (!outputCtx) throw new Error('Worker post-processing canvas is unavailable.');

  const TILE = 256;
  const scratch = new OffscreenCanvas(TILE + 2, TILE + 2);
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!scratchCtx) throw new Error('Worker post-processing workspace is unavailable.');

  for (let y = 0; y < height; y += TILE) {
    for (let x = 0; x < width; x += TILE) {
      if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
      const coreW = Math.min(TILE, width - x);
      const coreH = Math.min(TILE, height - y);
      const sx = Math.max(0, x - 1);
      const sy = Math.max(0, y - 1);
      const ex = Math.min(width, x + coreW + 1);
      const ey = Math.min(height, y + coreH + 1);
      const readW = ex - sx;
      const readH = ey - sy;
      const offsetX = x - sx;
      const offsetY = y - sy;

      scratch.width = readW;
      scratch.height = readH;
      scratchCtx.clearRect(0, 0, readW, readH);
      scratchCtx.drawImage(bitmap, sx, sy, readW, readH, 0, 0, readW, readH);
      const sampled = scratchCtx.getImageData(0, 0, readW, readH);
      const src = sampled.data;

      if (local) {
        for (let p = 0; p < src.length; p += 4) {
          const [r, g, b] = adjustedRgb(src[p], src[p + 1], src[p + 2], true, analysis);
          src[p] = r;
          src[p + 1] = g;
          src[p + 2] = b;
        }
      }

      const core = outputCtx.createImageData(coreW, coreH);
      const dst = core.data;
      for (let cy = 0; cy < coreH; cy++) {
        const py = cy + offsetY;
        for (let cx = 0; cx < coreW; cx++) {
          const px = cx + offsetX;
          const center = (py * readW + px) * 4;
          const out = (cy * coreW + cx) * 4;
          let correction = 0;
          if (amount) {
            const left = (py * readW + Math.max(0, px - 1)) * 4;
            const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
            const up = (Math.max(0, py - 1) * readW + px) * 4;
            const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
            const edge = luma(src, center) - (luma(src, left) + luma(src, right) + luma(src, up) + luma(src, down)) * 0.25;
            if (Math.abs(edge) >= threshold) correction = clamp(edge * amount, -maxDelta, maxDelta);
          }
          dst[out] = byte(src[center] + correction);
          dst[out + 1] = byte(src[center + 1] + correction);
          dst[out + 2] = byte(src[center + 2] + correction);
          dst[out + 3] = src[center + 3];
        }
      }
      outputCtx.putImageData(core, x, y);
      await Promise.resolve();
    }
  }

  bitmap.close?.();
  return output.transferToImageBitmap();
}

self.onmessage = async event => {
  const message = event.data || {};
  const { id, type } = message;
  if (type === 'cancel') {
    cancelled.add(id);
    return;
  }

  try {
    if (type === 'pack-tile') {
      const result = await packTile(message.bitmap, message.width, message.height, id);
      self.postMessage({ id, ok: true, ...result }, [result.buffer]);
    } else if (type === 'tensor-to-bitmap') {
      const bitmap = await tensorToBitmap(message.buffer, message.width, message.height, id);
      self.postMessage({ id, ok: true, bitmap }, [bitmap]);
    } else if (type === 'adaptive-deblur-blend') {
      const bitmap = await adaptiveDeblurBlend(message.sourceBitmap, message.deblurBitmap, message.analysis, message.faces || [], id);
      self.postMessage({ id, ok: true, bitmap }, [bitmap]);
    } else if (type === 'region-aware-restore') {
      const bitmap = await regionAwareRestore(
        message.sourceBitmap,
        message.processedBitmap,
        message.analysis,
        message.faces || [],
        message.mode || 'enhance',
        id
      );
      self.postMessage({ id, ok: true, bitmap }, [bitmap]);
    } else if (type === 'postprocess') {
      const bitmap = await postprocess(message.bitmap, !!message.local, message.analysis, message.sharpening, id);
      self.postMessage({ id, ok: true, bitmap }, [bitmap]);
    } else {
      throw new Error('Unknown worker task.');
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), name: error?.name || 'Error' });
  } finally {
    cancelled.delete(id);
  }
};
