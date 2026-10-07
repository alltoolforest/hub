import { abortIfNeeded, byte, clamp, faceInfluence, nextFrame } from './enhance-unblur-common.js';

const SETTINGS = Object.freeze({
  gentle: Object.freeze({ contrast: 1.018, saturation: 1.010, clarity: 0.055, denoise: 0.055, exposureMin: 0.985, exposureMax: 1.025 }),
  balanced: Object.freeze({ contrast: 1.032, saturation: 1.022, clarity: 0.085, denoise: 0.075, exposureMin: 0.975, exposureMax: 1.040 })
});

function sourceCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!ctx) throw new Error('Image enhancement canvas is unavailable.');
  ctx.drawImage(image, 0, 0);
  return canvas;
}

function analyze(image) {
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(32, Math.round(image.width * scale));
  const height = Math.max(32, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Image analysis canvas is unavailable.');
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0;

  let r = 0, g = 0, b = 0, luma = 0, count = 0;
  let shadows = 0, highlights = 0;
  const stride = Math.max(1, Math.floor((width * height) / 50000));
  for (let i = 0; i < width * height; i += stride) {
    const p = i * 4;
    const rr = data[p], gg = data[p + 1], bb = data[p + 2];
    const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
    r += rr; g += gg; b += bb; luma += y; count++;
    if (y < 42) shadows++;
    if (y > 220) highlights++;
  }
  count = Math.max(1, count);
  return {
    meanR: r / count,
    meanG: g / count,
    meanB: b / count,
    meanLuma: luma / count,
    shadowFraction: shadows / count,
    highlightFraction: highlights / count
  };
}

function correctionProfile(stats, settings) {
  const neutral = (stats.meanR + stats.meanG + stats.meanB) / 3 || 128;
  const rGain = clamp(neutral / Math.max(1, stats.meanR), 0.975, 1.025);
  const gGain = clamp(neutral / Math.max(1, stats.meanG), 0.982, 1.018);
  const bGain = clamp(neutral / Math.max(1, stats.meanB), 0.975, 1.025);

  let exposure = clamp(128 / Math.max(48, stats.meanLuma), settings.exposureMin, settings.exposureMax);
  if (stats.highlightFraction > 0.12) exposure = Math.min(exposure, 1.01);
  if (stats.shadowFraction < 0.04 && stats.meanLuma > 118) exposure = Math.min(exposure, 1.015);
  return { rGain, gGain, bGain, exposure };
}

function correctedPixel(data, p, profile, settings, out, i) {
  let r = data[p] * profile.rGain * profile.exposure;
  let g = data[p + 1] * profile.gGain * profile.exposure;
  let b = data[p + 2] * profile.bGain * profile.exposure;

  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const toned = (y - 128) * settings.contrast + 128;
  const scale = y > 0.01 ? toned / y : 1;
  r *= scale; g *= scale; b *= scale;
  y = r * 0.2126 + g * 0.7152 + b * 0.0722;

  out[i] = byte(y + (r - y) * settings.saturation);
  out[i + 1] = byte(y + (g - y) * settings.saturation);
  out[i + 2] = byte(y + (b - y) * settings.saturation);
  out[i + 3] = data[p + 3];
}

export class IdentityPreservingEnhancementEngine {
  constructor(faceGuard) {
    this.faceGuard = faceGuard;
    this.id = 'identity-preserving-enhancement';
    this.label = 'Image Enhancement';
    this.purpose = 'Improve an already usable photograph without reconstructing identity or changing geometry.';
  }

  async process(image, { retouch = 'balanced', signal, onProgress } = {}) {
    abortIfNeeded(signal);
    const settings = SETTINGS[retouch] || SETTINGS.balanced;
    onProgress?.('Analyzing exposure and color safely…');
    const stats = analyze(image);
    const profile = correctionProfile(stats, settings);

    let faces = [];
    if (this.faceGuard) faces = await this.faceGuard.detect(image, signal, onProgress);
    abortIfNeeded(signal);

    const input = sourceCanvas(image);
    const inputCtx = input.getContext('2d', { willReadFrequently: true, alpha: true });
    const output = document.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const outputCtx = output.getContext('2d', { alpha: true });
    if (!inputCtx || !outputCtx) throw new Error('Image enhancement workspace is unavailable.');

    const TILE = 256;
    const cols = Math.ceil(image.width / TILE);
    const rows = Math.ceil(image.height / TILE);
    let done = 0;
    const total = cols * rows;

    onProgress?.('Applying conservative professional enhancement…');
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

        const src = inputCtx.getImageData(sx, sy, readW, readH);
        const corrected = new Uint8ClampedArray(src.data.length);
        for (let p = 0; p < src.data.length; p += 4) correctedPixel(src.data, p, profile, settings, corrected, p);

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

            const y0 = corrected[center] * 0.2126 + corrected[center + 1] * 0.7152 + corrected[center + 2] * 0.0722;
            const yl = corrected[left] * 0.2126 + corrected[left + 1] * 0.7152 + corrected[left + 2] * 0.0722;
            const yr = corrected[right] * 0.2126 + corrected[right + 1] * 0.7152 + corrected[right + 2] * 0.0722;
            const yu = corrected[up] * 0.2126 + corrected[up + 1] * 0.7152 + corrected[up + 2] * 0.0722;
            const yd = corrected[down] * 0.2126 + corrected[down + 1] * 0.7152 + corrected[down + 2] * 0.0722;
            const localY = (yl + yr + yu + yd) * 0.25;
            const edge = Math.abs(y0 - localY);
            const face = faceInfluence(tx + x, ty + y, faces);
            const clarity = settings.clarity * (1 - face * 0.78);
            const denoise = settings.denoise * (1 - face * 0.45);

            for (let c = 0; c < 3; c++) {
              const current = corrected[center + c];
              const average = (corrected[left + c] + corrected[right + c] + corrected[up + c] + corrected[down + c]) * 0.25;
              let value = current;
              if (edge < 5.5) value = current + (average - current) * denoise;
              if (edge >= 2.5 && edge <= 42) value += (current - average) * clarity;
              core.data[out + c] = byte(value);
            }
            core.data[out + 3] = corrected[center + 3];
          }
        }
        outputCtx.putImageData(core, tx, ty);
        done++;
        onProgress?.(`Enhancing safely… ${done} of ${total}`);
        await nextFrame();
      }
    }

    input.width = input.height = 0;
    return {
      canvas: output,
      engineId: this.id,
      mode: 'enhance',
      facesProtected: faces.length,
      identityGuardAvailable: !!this.faceGuard?.available,
      resolutionChanged: false,
      generativeProcessing: false,
      reconstructionUsed: false,
      settings: { retouch }
    };
  }
}
