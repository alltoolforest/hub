import {
  abortIfNeeded, byte, clamp, faceInfluence, imageToTensor, nextFrame, tensorToCanvas
} from './enhance-unblur-common.js';

const SETTINGS = Object.freeze({
  gentle: Object.freeze({
    learnedBlend: 0.46,
    faceLearnedBlend: 0.09,
    fallbackBlendCap: 0.34,
    contrast: 1.026,
    saturation: 1.014,
    clarity: 0.12,
    denoise: 0.055,
    exposureMin: 0.980,
    exposureMax: 1.032
  }),
  balanced: Object.freeze({
    learnedBlend: 0.68,
    faceLearnedBlend: 0.14,
    fallbackBlendCap: 0.42,
    contrast: 1.042,
    saturation: 1.024,
    clarity: 0.18,
    denoise: 0.070,
    exposureMin: 0.972,
    exposureMax: 1.045
  })
});

function sourceCanvas(image, alpha = true) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha });
  if (!ctx) throw new Error('Image enhancement canvas is unavailable.');
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function analyze(image) {
  const maxSide = 480;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(48, Math.round(image.width * scale));
  const height = Math.max(48, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Image analysis canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0;

  let r = 0, g = 0, b = 0, luma = 0, count = 0;
  let shadows = 0, highlights = 0, gradient = 0, gradientCount = 0;
  let lapSum = 0, lapSq = 0, lapCount = 0;

  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const rr = data[p], gg = data[p + 1], bb = data[p + 2];
    const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
    gray[i] = y;
    r += rr;
    g += gg;
    b += bb;
    luma += y;
    count++;
    if (y < 42) shadows++;
    if (y > 220) highlights++;
  }

  const at = (x, y) => gray[y * width + x];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = at(x, y);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const up = at(x, y - 1);
      const down = at(x, y + 1);
      gradient += (Math.abs(right - left) + Math.abs(down - up)) * 0.5;
      gradientCount++;
      const lap = left + right + up + down - 4 * c;
      lapSum += lap;
      lapSq += lap * lap;
      lapCount++;
    }
  }

  count = Math.max(1, count);
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const lapVariance = lapCount ? Math.max(0, lapSq / lapCount - lapMean * lapMean) : 0;
  const meanGradient = gradientCount ? gradient / gradientCount : 0;
  const softness = clamp(1 - meanGradient / 17, 0, 1);

  return {
    meanR: r / count,
    meanG: g / count,
    meanB: b / count,
    meanLuma: luma / count,
    shadowFraction: shadows / count,
    highlightFraction: highlights / count,
    meanGradient,
    lapVariance,
    softness
  };
}

function correctionProfile(stats, settings) {
  const neutral = (stats.meanR + stats.meanG + stats.meanB) / 3 || 128;
  const rGain = clamp(neutral / Math.max(1, stats.meanR), 0.970, 1.030);
  const gGain = clamp(neutral / Math.max(1, stats.meanG), 0.978, 1.022);
  const bGain = clamp(neutral / Math.max(1, stats.meanB), 0.970, 1.030);

  let exposure = clamp(128 / Math.max(48, stats.meanLuma), settings.exposureMin, settings.exposureMax);
  if (stats.highlightFraction > 0.12) exposure = Math.min(exposure, 1.012);
  if (stats.shadowFraction < 0.04 && stats.meanLuma > 118) exposure = Math.min(exposure, 1.018);
  return { rGain, gGain, bGain, exposure };
}

function correctedPixel(data, p, profile, settings, out, i) {
  let r = data[p] * profile.rGain * profile.exposure;
  let g = data[p + 1] * profile.gGain * profile.exposure;
  let b = data[p + 2] * profile.bGain * profile.exposure;

  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const toned = (y - 128) * settings.contrast + 128;
  const scale = y > 0.01 ? toned / y : 1;
  r *= scale;
  g *= scale;
  b *= scale;
  y = r * 0.2126 + g * 0.7152 + b * 0.0722;

  out[i] = byte(y + (r - y) * settings.saturation);
  out[i + 1] = byte(y + (g - y) * settings.saturation);
  out[i + 2] = byte(y + (b - y) * settings.saturation);
  out[i + 3] = data[p + 3];
}

function mobileProfile() {
  const mobile = matchMedia?.('(max-width: 760px)')?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const memory = Number(navigator.deviceMemory) || 0;
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 2);

  if (!mobile) return { mobile: false, tileCore: memory >= 8 || cores >= 8 ? 176 : 144 };
  if (memory >= 6 || cores >= 8) return { mobile: true, tileCore: 176 };
  if (memory >= 4 || cores >= 6) return { mobile: true, tileCore: 144 };
  return { mobile: true, tileCore: 112 };
}

function luma(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

export class IdentityPreservingEnhancementEngine {
  constructor(faceGuard) {
    this.faceGuard = faceGuard;
    this.loader = faceGuard?.loader || null;
    this.session = null;
    this.ort = null;
    this.nativeScale = 4;
    this.id = 'identity-preserving-enhancement';
    this.label = 'Image Enhancement';
    this.purpose = 'Improve an already usable photograph without reconstructing identity or changing geometry.';
  }

  async initializeRestoration(signal, onProgress) {
    if (this.session) return true;
    if (!this.loader) return false;

    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadModel('general-x4', signal, onProgress);
    this.nativeScale = Number(model.config?.scale) || 4;

    onProgress?.('Preparing detail-restoration engine…');
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true
    });
    return true;
  }

  async inferRestorationTile(image, sx, sy, width, height, signal) {
    abortIfNeeded(signal);
    const values = imageToTensor(image, sx, sy, width, height);
    const tensor = new this.ort.Tensor('float32', values, [1, 3, height, width]);
    let results;

    try {
      results = await this.session.run({ [this.session.inputNames[0]]: tensor });
      const output = results[this.session.outputNames[0]];
      if (!output?.data || !Array.isArray(output.dims) || output.dims.length !== 4) {
        throw new Error('Enhancement restoration model returned an unexpected output.');
      }
      const outH = Number(output.dims[2]);
      const outW = Number(output.dims[3]);
      const expectedW = width * this.nativeScale;
      const expectedH = height * this.nativeScale;
      if (outW !== expectedW || outH !== expectedH) {
        throw new Error(`Enhancement model returned ${outW} × ${outH}; expected ${expectedW} × ${expectedH}.`);
      }
      abortIfNeeded(signal);
      return tensorToCanvas(output.data, outW, outH);
    } finally {
      tensor.dispose?.();
      for (const output of Object.values(results || {})) output.dispose?.();
    }
  }

  async buildRestorationCandidate(image, signal, onProgress) {
    const available = await this.initializeRestoration(signal, onProgress);
    if (!available) return null;

    const profile = mobileProfile();
    const tileCore = profile.tileCore;
    const padding = 14;
    const cols = Math.ceil(image.width / tileCore);
    const rows = Math.ceil(image.height / tileCore);
    const total = cols * rows;
    let index = 0;

    const candidate = document.createElement('canvas');
    candidate.width = image.width;
    candidate.height = image.height;
    const ctx = candidate.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Enhancement restoration canvas is unavailable.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    for (let y = 0; y < image.height; y += tileCore) {
      for (let x = 0; x < image.width; x += tileCore) {
        abortIfNeeded(signal);
        const coreW = Math.min(tileCore, image.width - x);
        const coreH = Math.min(tileCore, image.height - y);
        const sx = Math.max(0, x - padding);
        const sy = Math.max(0, y - padding);
        const ex = Math.min(image.width, x + coreW + padding);
        const ey = Math.min(image.height, y + coreH + padding);
        const tileW = ex - sx;
        const tileH = ey - sy;
        const padLeft = x - sx;
        const padTop = y - sy;

        index++;
        onProgress?.(`Restoring supported detail… ${index} of ${total}`);
        const tile = await this.inferRestorationTile(image, sx, sy, tileW, tileH, signal);
        ctx.drawImage(
          tile,
          padLeft * this.nativeScale,
          padTop * this.nativeScale,
          coreW * this.nativeScale,
          coreH * this.nativeScale,
          x,
          y,
          coreW,
          coreH
        );
        tile.width = tile.height = 0;
        await nextFrame();
      }
    }

    return candidate;
  }

  async blendRestorationWithSource(image, candidate, faces, guardAvailable, settings, stats, signal, onProgress) {
    const source = sourceCanvas(image, false);
    const sourceCtx = source.getContext('2d', { willReadFrequently: true, alpha: false });
    const candidateCtx = candidate.getContext('2d', { willReadFrequently: true, alpha: false });
    const output = document.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const outputCtx = output.getContext('2d', { alpha: false });

    if (!sourceCtx || !candidateCtx || !outputCtx) {
      throw new Error('Enhancement fidelity workspace is unavailable.');
    }

    const TILE = 256;
    const cols = Math.ceil(image.width / TILE);
    const rows = Math.ceil(image.height / TILE);
    const total = cols * rows;
    const softnessBoost = 0.86 + stats.softness * 0.14;
    let done = 0;

    onProgress?.('Applying identity-preserving restoration guard…');

    for (let ty = 0; ty < image.height; ty += TILE) {
      for (let tx = 0; tx < image.width; tx += TILE) {
        abortIfNeeded(signal);
        const coreW = Math.min(TILE, image.width - tx);
        const coreH = Math.min(TILE, image.height - ty);
        const sx = Math.max(0, tx - 1);
        const sy = Math.max(0, ty - 1);
        const ex = Math.min(image.width, tx + coreW + 1);
        const ey = Math.min(image.height, ty + coreH + 1);
        const readW = ex - sx;
        const readH = ey - sy;
        const ox = tx - sx;
        const oy = ty - sy;

        const src = sourceCtx.getImageData(sx, sy, readW, readH).data;
        const restored = candidateCtx.getImageData(sx, sy, readW, readH).data;
        const core = outputCtx.createImageData(coreW, coreH);

        for (let y = 0; y < coreH; y++) {
          const py = y + oy;
          for (let x = 0; x < coreW; x++) {
            const px = x + ox;
            const center = (py * readW + px) * 4;
            const left = (py * readW + Math.max(0, px - 1)) * 4;
            const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
            const up = (Math.max(0, py - 1) * readW + px) * 4;
            const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
            const out = (y * coreW + x) * 4;

            const sourceY = luma(src, center);
            const restoredY = luma(restored, center);
            const sourceEdge = (
              Math.abs(sourceY - luma(src, left)) +
              Math.abs(sourceY - luma(src, right)) +
              Math.abs(sourceY - luma(src, up)) +
              Math.abs(sourceY - luma(src, down))
            ) * 0.25;
            const restoredEdge = (
              Math.abs(restoredY - luma(restored, left)) +
              Math.abs(restoredY - luma(restored, right)) +
              Math.abs(restoredY - luma(restored, up)) +
              Math.abs(restoredY - luma(restored, down))
            ) * 0.25;

            const face = faceInfluence(tx + x, ty + y, faces);
            let weight = settings.learnedBlend * softnessBoost;

            if (guardAvailable) {
              const faceCap = settings.faceLearnedBlend +
                (settings.learnedBlend - settings.faceLearnedBlend) * (1 - face);
              weight = Math.min(weight, faceCap);
            } else {
              weight = Math.min(weight, settings.fallbackBlendCap);
            }

            const deviation = Math.abs(restoredY - sourceY);
            const faceDeviationLimit = 6 + (1 - face) * 10;
            if (deviation > faceDeviationLimit) {
              const excess = deviation - faceDeviationLimit;
              weight *= clamp(1 - excess / 36, face > 0.35 ? 0.22 : 0.34, 1);
            }

            if (sourceEdge < 2.2 && restoredEdge > 5.8) {
              weight *= face > 0.2 ? 0.30 : 0.52;
            }
            if (restoredEdge < sourceEdge * 0.80) {
              weight *= 0.72;
            }
            if (restoredEdge > Math.max(30, sourceEdge * 2.7 + 8)) {
              weight *= face > 0.2 ? 0.42 : 0.62;
            }
            if (face > 0.50 && restoredEdge > sourceEdge * 1.55 + 3) {
              weight *= 0.48;
            }

            weight = clamp(weight, 0.02, settings.learnedBlend);

            for (let c = 0; c < 3; c++) {
              core.data[out + c] = byte(
                src[center + c] + (restored[center + c] - src[center + c]) * weight
              );
            }
            core.data[out + 3] = src[center + 3];
          }
        }

        outputCtx.putImageData(core, tx, ty);
        done++;
        onProgress?.(`Protecting original structure… ${done} of ${total}`);
        await nextFrame();
      }
    }

    source.width = source.height = 0;
    candidate.width = candidate.height = 0;
    return output;
  }

  async applyProfessionalFinish(inputCanvas, faces, settings, profile, signal, onProgress) {
    const inputCtx = inputCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
    const output = document.createElement('canvas');
    output.width = inputCanvas.width;
    output.height = inputCanvas.height;
    const outputCtx = output.getContext('2d', { alpha: true });
    if (!inputCtx || !outputCtx) throw new Error('Image finishing workspace is unavailable.');

    const TILE = 256;
    const cols = Math.ceil(inputCanvas.width / TILE);
    const rows = Math.ceil(inputCanvas.height / TILE);
    const total = cols * rows;
    let done = 0;

    onProgress?.('Finishing tone, color and natural clarity…');

    for (let ty = 0; ty < inputCanvas.height; ty += TILE) {
      for (let tx = 0; tx < inputCanvas.width; tx += TILE) {
        abortIfNeeded(signal);
        const coreW = Math.min(TILE, inputCanvas.width - tx);
        const coreH = Math.min(TILE, inputCanvas.height - ty);
        const sx = Math.max(0, tx - 1);
        const sy = Math.max(0, ty - 1);
        const ex = Math.min(inputCanvas.width, tx + coreW + 1);
        const ey = Math.min(inputCanvas.height, ty + coreH + 1);
        const readW = ex - sx;
        const readH = ey - sy;
        const ox = tx - sx;
        const oy = ty - sy;

        const src = inputCtx.getImageData(sx, sy, readW, readH);
        const corrected = new Uint8ClampedArray(src.data.length);
        for (let p = 0; p < src.data.length; p += 4) {
          correctedPixel(src.data, p, profile, settings, corrected, p);
        }

        const core = outputCtx.createImageData(coreW, coreH);
        for (let y = 0; y < coreH; y++) {
          const py = y + oy;
          for (let x = 0; x < coreW; x++) {
            const px = x + ox;
            const center = (py * readW + px) * 4;
            const left = (py * readW + Math.max(0, px - 1)) * 4;
            const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
            const up = (Math.max(0, py - 1) * readW + px) * 4;
            const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
            const out = (y * coreW + x) * 4;

            const y0 = luma(corrected, center);
            const localY = (
              luma(corrected, left) +
              luma(corrected, right) +
              luma(corrected, up) +
              luma(corrected, down)
            ) * 0.25;
            const edge = Math.abs(y0 - localY);
            const face = faceInfluence(tx + x, ty + y, faces);
            const clarity = settings.clarity * (1 - face * 0.70);
            const denoise = settings.denoise * (1 - face * 0.38);

            for (let c = 0; c < 3; c++) {
              const current = corrected[center + c];
              const average = (
                corrected[left + c] +
                corrected[right + c] +
                corrected[up + c] +
                corrected[down + c]
              ) * 0.25;

              let value = current;
              if (edge < 4.8) value += (average - current) * denoise;
              if (edge >= 1.8 && edge <= 46) value += (current - average) * clarity;
              core.data[out + c] = byte(value);
            }
            core.data[out + 3] = corrected[center + 3];
          }
        }

        outputCtx.putImageData(core, tx, ty);
        done++;
        onProgress?.(`Finishing enhancement… ${done} of ${total}`);
        await nextFrame();
      }
    }

    inputCanvas.width = inputCanvas.height = 0;
    return output;
  }

  async process(image, { retouch = 'balanced', signal, onProgress } = {}) {
    abortIfNeeded(signal);
    const settings = SETTINGS[retouch] || SETTINGS.balanced;

    onProgress?.('Analyzing exposure, color and source detail…');
    const stats = analyze(image);
    const profile = correctionProfile(stats, settings);

    let faces = [];
    if (this.faceGuard) faces = await this.faceGuard.detect(image, signal, onProgress);
    abortIfNeeded(signal);

    let workingCanvas = null;

    try {
      const candidate = await this.buildRestorationCandidate(image, signal, onProgress);
      if (!candidate) {
        throw new Error('The detail-restoration model is unavailable in this browser.');
      }
      workingCanvas = await this.blendRestorationWithSource(
        image,
        candidate,
        faces,
        !!this.faceGuard?.available,
        settings,
        stats,
        signal,
        onProgress
      );
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      console.error('Enhancement detail-restoration stage failed.', error);
      throw new Error(
        `Detail restoration could not run safely. No low-quality fallback was returned. ${error?.message || ''}`.trim()
      );
    }

    const output = await this.applyProfessionalFinish(
      workingCanvas,
      faces,
      settings,
      profile,
      signal,
      onProgress
    );

    return {
      canvas: output,
      engineId: this.id,
      mode: 'enhance',
      facesProtected: faces.length,
      identityGuardAvailable: !!this.faceGuard?.available,
      resolutionChanged: false,
      generativeProcessing: false,
      reconstructionUsed: false,
      learnedRestorationUsed: true,
      restorationModel: 'Real-ESRGAN general x4v3 (same-resolution restoration candidate)',
      settings: { retouch }
    };
  }
}
