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

function measureDetail(input) {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / input.width, maxSide / input.height);
  const width = Math.max(16, Math.round(input.width * scale));
  const height = Math.max(16, Math.round(input.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Detail analysis canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(input, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
  }

  let edge = 0;
  let edgeCount = 0;
  let texture = 0;
  let textureCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const center = gray[i];
      const left = gray[i - 1];
      const right = gray[i + 1];
      const up = gray[i - width];
      const down = gray[i + width];
      edge += Math.abs(right - center) + Math.abs(down - center);
      edgeCount += 2;
      texture += Math.abs(left + right + up + down - 4 * center);
      textureCount++;
    }
  }

  return {
    edge: edgeCount ? edge / edgeCount : 0,
    texture: textureCount ? texture / textureCount : 0
  };
}

async function preserveDetail(sourceBitmap, candidateBitmap, minimumRatio, id) {
  if (cancelled.has(id)) throw new DOMException('Processing cancelled.', 'AbortError');
  if (sourceBitmap.width !== candidateBitmap.width || sourceBitmap.height !== candidateBitmap.height) {
    sourceBitmap.close?.();
    return {
      bitmap: candidateBitmap,
      beforeRatio: 1,
      afterRatio: 1,
      sourceBlend: 0
    };
  }

  const sourceMetrics = measureDetail(sourceBitmap);
  const candidateMetrics = measureDetail(candidateBitmap);
  const edgeRatio = sourceMetrics.edge > 0.001 ? candidateMetrics.edge / sourceMetrics.edge : 1;
  const textureRatio = sourceMetrics.texture > 0.001 ? candidateMetrics.texture / sourceMetrics.texture : 1;
  const beforeRatio = Math.min(edgeRatio, textureRatio);
  const floor = clamp(Number(minimumRatio) || 0.92, 0.82, 0.98);

  if (beforeRatio >= floor) {
    sourceBitmap.close?.();
    return {
      bitmap: candidateBitmap,
      beforeRatio,
      afterRatio: beforeRatio,
      sourceBlend: 0
    };
  }

  const denominator = Math.max(0.05, 1 - beforeRatio);
  const sourceBlend = clamp((floor - beforeRatio) / denominator + 0.05, 0.12, 0.82);
  const canvas = new OffscreenCanvas(candidateBitmap.width, candidateBitmap.height);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    sourceBitmap.close?.();
    candidateBitmap.close?.();
    throw new Error('Detail-preservation canvas is unavailable.');
  }
  ctx.drawImage(candidateBitmap, 0, 0);
  ctx.globalAlpha = sourceBlend;
  ctx.drawImage(sourceBitmap, 0, 0);
  ctx.globalAlpha = 1;

  const finalMetrics = measureDetail(canvas);
  const finalEdgeRatio = sourceMetrics.edge > 0.001 ? finalMetrics.edge / sourceMetrics.edge : 1;
  const finalTextureRatio = sourceMetrics.texture > 0.001 ? finalMetrics.texture / sourceMetrics.texture : 1;
  const afterRatio = Math.min(finalEdgeRatio, finalTextureRatio);

  sourceBitmap.close?.();
  candidateBitmap.close?.();
  return {
    bitmap: canvas.transferToImageBitmap(),
    beforeRatio,
    afterRatio,
    sourceBlend
  };
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
    } else if (type === 'postprocess') {
      const bitmap = await postprocess(message.bitmap, !!message.local, message.analysis, message.sharpening, id);
      self.postMessage({ id, ok: true, bitmap }, [bitmap]);
    } else if (type === 'preserve-detail') {
      const result = await preserveDetail(message.sourceBitmap, message.candidateBitmap, message.minimumRatio, id);
      self.postMessage({ id, ok: true, ...result }, [result.bitmap]);
    } else {
      throw new Error('Unknown worker task.');
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), name: error?.name || 'Error' });
  } finally {
    cancelled.delete(id);
  }
};
