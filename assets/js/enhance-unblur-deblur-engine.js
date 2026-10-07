import {
  abortIfNeeded, byte, clamp, faceInfluence, imageToTensor, nextFrame, tensorToCanvas
} from './enhance-unblur-common.js';

const STRENGTH = Object.freeze({
  gentle: Object.freeze({ base: 0.36, faceFloor: 0.10, fallbackCap: 0.30 }),
  balanced: Object.freeze({ base: 0.52, faceFloor: 0.12, fallbackCap: 0.38 }),
  'maximum-safe': Object.freeze({ base: 0.64, faceFloor: 0.15, fallbackCap: 0.44 })
});

function isMobileDevice() {
  return matchMedia?.('(max-width: 760px)')?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function luma(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function validateOutput(output, width, height) {
  if (!output?.data || !Array.isArray(output.dims) || output.dims.length !== 4) {
    throw new Error('Deblur model returned an unexpected output.');
  }
  const outH = Number(output.dims[2]);
  const outW = Number(output.dims[3]);
  if (outW !== width || outH !== height) {
    throw new Error(`Deblur model returned ${outW} × ${outH}; expected ${width} × ${height}.`);
  }
}

export class StrictIdentityDeblurEngine {
  constructor(loader, faceGuard) {
    this.loader = loader;
    this.faceGuard = faceGuard;
    this.id = 'strict-identity-deblur';
    this.label = 'Unblur';
    this.purpose = 'Reduce blur while preferring source facial accuracy over maximum sharpness.';
    this.session = null;
    this.ort = null;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadModel('deblur-nafnet', signal, onProgress);
    onProgress?.('Preparing dedicated deblur engine…');
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all', enableCpuMemArena: true
    });
  }

  async infer(image, sx, sy, width, height, signal) {
    abortIfNeeded(signal);
    const values = imageToTensor(image, sx, sy, width, height);
    const tensor = new this.ort.Tensor('float32', values, [1, 3, height, width]);
    let results;
    try {
      results = await this.session.run({ [this.session.inputNames[0]]: tensor });
      const output = results[this.session.outputNames[0]];
      validateOutput(output, width, height);
      abortIfNeeded(signal);
      return tensorToCanvas(output.data, width, height);
    } finally {
      tensor.dispose?.();
      for (const output of Object.values(results || {})) output.dispose?.();
    }
  }

  async buildCandidate(image, signal, onProgress) {
    await this.initialize(signal, onProgress);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Deblur output canvas is unavailable.');

    const tileCore = isMobileDevice() ? 96 : 160;
    const padding = 24;
    const cols = Math.ceil(image.width / tileCore);
    const rows = Math.ceil(image.height / tileCore);
    const total = cols * rows;
    let index = 0;

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
        onProgress?.(`Reducing blur… ${index} of ${total}`);
        const tile = await this.infer(image, sx, sy, tileW, tileH, signal);
        ctx.drawImage(tile, padLeft, padTop, coreW, coreH, x, y, coreW, coreH);
        tile.width = tile.height = 0;
        await nextFrame();
      }
    }
    return canvas;
  }

  async fuseWithSource(image, candidate, faces, guardAvailable, setting, signal, onProgress) {
    const source = document.createElement('canvas');
    source.width = image.width;
    source.height = image.height;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!sourceCtx) throw new Error('Deblur source canvas is unavailable.');
    sourceCtx.drawImage(image, 0, 0);

    const candidateCtx = candidate.getContext('2d', { willReadFrequently: true, alpha: false });
    const output = document.createElement('canvas');
    output.width = image.width;
    output.height = image.height;
    const outputCtx = output.getContext('2d', { alpha: false });
    if (!candidateCtx || !outputCtx) throw new Error('Deblur fidelity workspace is unavailable.');

    const TILE = 256;
    const cols = Math.ceil(image.width / TILE);
    const rows = Math.ceil(image.height / TILE);
    const total = cols * rows;
    let done = 0;

    onProgress?.('Applying identity-preserving fidelity guard…');
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
        const deb = candidateCtx.getImageData(sx, sy, readW, readH).data;
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
            const deblurY = luma(deb, center);
            const sourceEdge = (
              Math.abs(sourceY - luma(src, left)) + Math.abs(sourceY - luma(src, right)) +
              Math.abs(sourceY - luma(src, up)) + Math.abs(sourceY - luma(src, down))
            ) * 0.25;
            const deblurEdge = (
              Math.abs(deblurY - luma(deb, left)) + Math.abs(deblurY - luma(deb, right)) +
              Math.abs(deblurY - luma(deb, up)) + Math.abs(deblurY - luma(deb, down))
            ) * 0.25;

            const face = faceInfluence(tx + x, ty + y, faces);
            let weight = setting.base;
            if (guardAvailable) {
              const faceCap = setting.faceFloor + (setting.base - setting.faceFloor) * (1 - face);
              weight = Math.min(weight, faceCap);
            } else {
              weight = Math.min(weight, setting.fallbackCap);
            }

            const deviation = Math.abs(deblurY - sourceY);
            if (deviation > 8) weight *= clamp(1 - (deviation - 8) / 42, 0.25, 1);
            if (deblurEdge < sourceEdge * 0.84) weight *= 0.72;
            if (deblurEdge > Math.max(24, sourceEdge * 2.8 + 8)) weight *= 0.58;
            if (face > 0.45 && deviation > 12) weight *= 0.55;
            weight = clamp(weight, 0.03, setting.base);

            for (let c = 0; c < 3; c++) {
              core.data[out + c] = byte(src[center + c] + (deb[center + c] - src[center + c]) * weight);
            }
            core.data[out + 3] = 255;
          }
        }

        outputCtx.putImageData(core, tx, ty);
        done++;
        onProgress?.(`Protecting original detail… ${done} of ${total}`);
        await nextFrame();
      }
    }

    source.width = source.height = 0;
    candidate.width = candidate.height = 0;
    return output;
  }

  async process(image, { strength = 'balanced', signal, onProgress } = {}) {
    abortIfNeeded(signal);
    const setting = STRENGTH[strength] || STRENGTH.balanced;
    const faces = this.faceGuard ? await this.faceGuard.detect(image, signal, onProgress) : [];
    abortIfNeeded(signal);
    const candidate = await this.buildCandidate(image, signal, onProgress);
    const output = await this.fuseWithSource(image, candidate, faces, !!this.faceGuard?.available, setting, signal, onProgress);
    return {
      canvas: output,
      engineId: this.id,
      mode: 'deblur',
      facesProtected: faces.length,
      identityGuardAvailable: !!this.faceGuard?.available,
      resolutionChanged: false,
      generativeProcessing: false,
      reconstructionUsed: false,
      model: 'NAFNet GoPro width32 FP16',
      settings: { strength }
    };
  }

  async dispose() {
    try { await this.session?.release?.(); } catch {}
    this.session = null;
  }
}
