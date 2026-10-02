const FACE_INPUT_WIDTH = 320;
const FACE_INPUT_HEIGHT = 240;
const FACE_SCORE_THRESHOLD = 0.65;
const FACE_NMS_IOU = 0.32;
const MAX_FACES = 24;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function area(box) {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!intersection) return 0;
  return intersection / Math.max(1e-9, area(a) + area(b) - intersection);
}

function hardNms(candidates, threshold = FACE_NMS_IOU, limit = MAX_FACES) {
  const remaining = [...candidates].sort((a, b) => b.score - a.score);
  const kept = [];
  while (remaining.length && kept.length < limit) {
    const current = remaining.shift();
    kept.push(current);
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (iou(current, remaining[i]) > threshold) remaining.splice(i, 1);
    }
  }
  return kept;
}

function resolveUltraFaceOutputs(results) {
  const outputs = Object.values(results || {});
  const scores = outputs.find(output =>
    Array.isArray(output?.dims) &&
    output.dims.length === 3 &&
    Number(output.dims[output.dims.length - 1]) === 2
  );
  const boxes = outputs.find(output =>
    Array.isArray(output?.dims) &&
    output.dims.length === 3 &&
    Number(output.dims[output.dims.length - 1]) === 4
  );
  if (!scores?.data || !boxes?.data) {
    throw new Error('Face safety model returned unexpected outputs.');
  }
  return { scores, boxes };
}

function inputTensorData(image) {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_INPUT_WIDTH;
  canvas.height = FACE_INPUT_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Face safety input canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = canvas.height = 0;

  const plane = FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT;
  const data = new Float32Array(plane * 3);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    data[i] = (rgba[p] - 127) / 128;
    data[plane + i] = (rgba[p + 1] - 127) / 128;
    data[plane * 2 + i] = (rgba[p + 2] - 127) / 128;
  }
  return data;
}

function decodeFaces(scores, boxes, width, height) {
  const count = Math.min(
    Math.floor(scores.data.length / 2),
    Math.floor(boxes.data.length / 4)
  );
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const score = Number(scores.data[i * 2 + 1]);
    if (!Number.isFinite(score) || score < FACE_SCORE_THRESHOLD) continue;

    const x1n = clamp(Number(boxes.data[i * 4]));
    const y1n = clamp(Number(boxes.data[i * 4 + 1]));
    const x2n = clamp(Number(boxes.data[i * 4 + 2]));
    const y2n = clamp(Number(boxes.data[i * 4 + 3]));
    if (x2n <= x1n || y2n <= y1n) continue;

    const x1 = x1n * width;
    const y1 = y1n * height;
    const x2 = x2n * width;
    const y2 = y2n * height;
    const faceWidth = x2 - x1;
    const faceHeight = y2 - y1;
    if (faceWidth < 18 || faceHeight < 18) continue;

    candidates.push({ x1, y1, x2, y2, score });
  }

  return hardNms(candidates).map(face => Object.freeze({
    x: face.x1,
    y: face.y1,
    width: face.x2 - face.x1,
    height: face.y2 - face.y1,
    score: face.score
  }));
}

export class FaceIdentitySafetyEngine {
  constructor(loader, caps) {
    this.loader = loader;
    this.caps = caps;
    this.session = null;
    this.ort = null;
    this.cachedImage = null;
    this.cachedFaces = Object.freeze([]);
    this.lastAvailable = false;
    this.lastError = null;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    if (!this.caps?.wasm) throw new Error('Face identity safety requires WebAssembly support.');

    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadFaceSafetyModel(signal, onProgress);
    onProgress?.('Preparing face identity safety…');
    this.ort.env.wasm.proxy = true;
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true
    });
  }

  async detect(image, signal, onProgress) {
    if (!image?.width || !image?.height) return Object.freeze([]);
    if (this.cachedImage === image) return this.cachedFaces;

    try {
      await this.initialize(signal, onProgress);
      if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
      onProgress?.('Checking face identity safety…');

      const data = inputTensorData(image);
      const tensor = new this.ort.Tensor('float32', data, [1, 3, FACE_INPUT_HEIGHT, FACE_INPUT_WIDTH]);
      const inputName = this.session.inputNames[0];
      const results = await this.session.run({ [inputName]: tensor });
      const { scores, boxes } = resolveUltraFaceOutputs(results);
      const faces = Object.freeze(decodeFaces(scores, boxes, image.width, image.height));

      this.cachedImage = image;
      this.cachedFaces = faces;
      this.lastAvailable = true;
      this.lastError = null;
      return faces;
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      console.warn('Face identity safety detector unavailable; continuing with existing fidelity safeguards.', error);
      this.cachedImage = null;
      this.cachedFaces = Object.freeze([]);
      this.lastAvailable = false;
      this.lastError = error;
      return this.cachedFaces;
    }
  }

  reset() {
    this.cachedImage = null;
    this.cachedFaces = Object.freeze([]);
    this.lastAvailable = false;
    this.lastError = null;
  }

  async dispose() {
    try { await this.session?.release?.(); } catch {}
    this.session = null;
    this.reset();
  }
}

function faceSourceRetention(analysis, mode, faceScore) {
  const diagnosis = analysis?.diagnosis?.confidence || {};
  const damage = Math.max(
    Number(diagnosis.blur) || 0,
    Number(diagnosis.noise) || 0,
    Number(diagnosis.compression) || 0
  );
  const base = mode === 'upscale' ? 0.26 : mode === 'deblur' ? 0.20 : 0.24;
  return clamp(base + damage * 0.07 + clamp(faceScore) * 0.03, 0.20, 0.36);
}

export function applyFaceIdentityGuard(outputCanvas, sourceImage, faces, analysis, mode = 'enhance') {
  if (!outputCanvas || !sourceImage || !faces?.length) {
    return { canvas: outputCanvas, applied: false, faceCount: 0 };
  }

  const targetCtx = outputCanvas.getContext('2d', { alpha: false });
  if (!targetCtx) throw new Error('Face identity safety output canvas is unavailable.');

  const scaleX = outputCanvas.width / sourceImage.width;
  const scaleY = outputCanvas.height / sourceImage.height;
  let applied = 0;

  for (const face of faces) {
    const expandX = face.width * 0.14;
    const expandTop = face.height * 0.18;
    const expandBottom = face.height * 0.10;
    const sx = Math.max(0, face.x - expandX);
    const sy = Math.max(0, face.y - expandTop);
    const ex = Math.min(sourceImage.width, face.x + face.width + expandX);
    const ey = Math.min(sourceImage.height, face.y + face.height + expandBottom);
    const sw = ex - sx;
    const sh = ey - sy;
    if (sw < 8 || sh < 8) continue;

    const dx = Math.round(sx * scaleX);
    const dy = Math.round(sy * scaleY);
    const dw = Math.max(1, Math.round(sw * scaleX));
    const dh = Math.max(1, Math.round(sh * scaleY));
    const overlay = document.createElement('canvas');
    overlay.width = dw;
    overlay.height = dh;
    const ctx = overlay.getContext('2d', { alpha: true });
    if (!ctx) continue;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, dw, dh);

    const retention = faceSourceRetention(analysis, mode, face.score);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.save();
    ctx.translate(dw * 0.5, dh * 0.50);
    ctx.scale(Math.max(1, dw * 0.5), Math.max(1, dh * 0.5));
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, `rgba(0,0,0,${retention})`);
    gradient.addColorStop(0.52, `rgba(0,0,0,${retention * 0.86})`);
    gradient.addColorStop(0.78, `rgba(0,0,0,${retention * 0.44})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    targetCtx.drawImage(overlay, dx, dy);
    overlay.width = overlay.height = 0;
    applied++;
  }

  return {
    canvas: outputCanvas,
    applied: applied > 0,
    faceCount: applied
  };
}

export function faceSafetyAiLimitAt(x, y, faces) {
  if (!faces?.length) return 1;
  let limit = 1;
  for (const face of faces) {
    const cx = face.x + face.width * 0.5;
    const cy = face.y + face.height * 0.50;
    const rx = Math.max(1, face.width * 0.68);
    const ry = Math.max(1, face.height * 0.76);
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const distance = dx * dx + dy * dy;
    if (distance >= 1) continue;

    const core = 1 - Math.sqrt(Math.max(0, distance));
    const scoreBias = clamp(face.score) * 0.03;
    const localLimit = clamp(0.60 + (1 - core) * 0.20 + scoreBias, 0.60, 0.83);
    limit = Math.min(limit, localLimit);
  }
  return limit;
}

export function fallbackPortraitSafetyRegion(image) {
  if (!image?.width || !image?.height) return Object.freeze([]);
  const width = image.width * 0.42;
  const height = image.height * 0.48;
  return Object.freeze([Object.freeze({
    x: (image.width - width) * 0.5,
    y: image.height * 0.16,
    width,
    height,
    score: 0.55,
    fallback: true
  })]);
}
