const MODEL_CACHE = 'alltoolforest-enhance-unblur-experiment-v1';
const FACE_INPUT_WIDTH = 320;
const FACE_INPUT_HEIGHT = 240;
const FACE_SCORE_THRESHOLD = 0.68;
const MAX_FACES = 20;

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const byte = value => Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));

export function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
}

export function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function sha256Matches(buffer, expected) {
  if (!globalThis.crypto?.subtle?.digest || !expected) return false;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const actual = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  return actual === String(expected).toLowerCase();
}

async function responseBuffer(response, signal, onProgress) {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  try {
    while (true) {
      abortIfNeeded(signal);
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

export class ExperimentalModelLoader {
  constructor() {
    this.manifest = null;
    this.runtimePromise = null;
    this.modelPromises = new Map();
  }

  async loadManifest(signal) {
    if (this.manifest) return this.manifest;
    const url = new URL('../models/image-enhancer/manifest.json', import.meta.url);
    const response = await fetch(url, { signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('Image model manifest could not be loaded.');
    this.manifest = await response.json();
    return this.manifest;
  }

  async loadRuntime(signal, onProgress) {
    if (globalThis.ort?.InferenceSession && globalThis.ort?.Tensor) return globalThis.ort;
    if (this.runtimePromise) return this.runtimePromise;

    this.runtimePromise = (async () => {
      const manifest = await this.loadManifest(signal);
      const config = manifest.runtime;
      if (!config?.bundle) throw new Error('ONNX runtime configuration is missing.');
      onProgress?.('Loading local AI runtime…');
      const response = await fetch(config.bundle, { signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`AI runtime download failed (${response.status}).`);
      const source = await response.text();
      abortIfNeeded(signal);
      const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = blobUrl;
          script.async = true;
          script.onload = () => { script.remove(); resolve(); };
          script.onerror = () => { script.remove(); reject(new Error('AI runtime could not start.')); };
          document.head.append(script);
        });
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      const ort = globalThis.ort;
      if (!ort?.InferenceSession || !ort?.Tensor) throw new Error('AI runtime loaded without ONNX APIs.');
      ort.env.logLevel = 'error';
      ort.env.wasm.proxy = true;
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(2, Math.max(1, navigator.hardwareConcurrency || 1)) : 1;
      ort.env.wasm.initTimeout = 45000;
      if (config.wasmModule) {
        try { ort.env.wasm.wasmPaths = new URL('.', config.wasmModule).href; } catch {}
      }
      return ort;
    })();

    try {
      return await this.runtimePromise;
    } catch (error) {
      this.runtimePromise = null;
      throw error;
    }
  }

  async loadModel(key, signal, onProgress) {
    if (this.modelPromises.has(key)) return this.modelPromises.get(key);
    const promise = (async () => {
      const manifest = await this.loadManifest(signal);
      const model = manifest.models?.[key];
      if (!model?.url || !model?.sha256) throw new Error(`Model configuration '${key}' is missing.`);
      let bytes = null;

      if ('caches' in globalThis) {
        try {
          const cache = await caches.open(MODEL_CACHE);
          const cached = await cache.match(model.url);
          if (cached) {
            onProgress?.(`Checking cached ${model.name || key}…`);
            const cachedBytes = await cached.arrayBuffer();
            if (await sha256Matches(cachedBytes, model.sha256)) bytes = cachedBytes;
            else await cache.delete(model.url);
          }
        } catch {}
      }

      if (!bytes) {
        onProgress?.(`Downloading ${model.name || key}…`);
        const response = await fetch(model.url, { signal, cache: 'force-cache' });
        if (!response.ok) throw new Error(`${model.name || key} download failed (${response.status}).`);
        bytes = await responseBuffer(response, signal, (loaded, total) => {
          if (total) onProgress?.(`Downloading ${model.name || key}… ${Math.min(100, Math.round(loaded / total * 100))}%`);
        });
        onProgress?.(`Verifying ${model.name || key}…`);
        if (!(await sha256Matches(bytes, model.sha256))) throw new Error(`${model.name || key} integrity verification failed.`);
        if ('caches' in globalThis) {
          try {
            const cache = await caches.open(MODEL_CACHE);
            await cache.put(model.url, new Response(bytes.slice(0), { headers: { 'content-type': 'application/octet-stream' } }));
          } catch {}
        }
      }
      return { config: model, bytes };
    })();
    this.modelPromises.set(key, promise);
    try {
      return await promise;
    } catch (error) {
      this.modelPromises.delete(key);
      throw error;
    }
  }
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!intersection) return 0;
  const aa = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const ba = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return intersection / Math.max(1e-9, aa + ba - intersection);
}

function nms(candidates) {
  const queue = [...candidates].sort((a, b) => b.score - a.score);
  const kept = [];
  while (queue.length && kept.length < MAX_FACES) {
    const current = queue.shift();
    kept.push(current);
    for (let i = queue.length - 1; i >= 0; i--) {
      if (iou(current, queue[i]) > 0.32) queue.splice(i, 1);
    }
  }
  return kept;
}

function faceTensor(image) {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_INPUT_WIDTH;
  canvas.height = FACE_INPUT_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Face safety canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const plane = FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT;
  const data = new Float32Array(plane * 3);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    data[i] = (rgba[p] - 127) / 128;
    data[plane + i] = (rgba[p + 1] - 127) / 128;
    data[plane * 2 + i] = (rgba[p + 2] - 127) / 128;
  }
  canvas.width = canvas.height = 0;
  return data;
}

function resolveFaceOutputs(results) {
  const outputs = Object.values(results || {});
  const scores = outputs.find(output => Array.isArray(output?.dims) && output.dims.length === 3 && Number(output.dims.at(-1)) === 2);
  const boxes = outputs.find(output => Array.isArray(output?.dims) && output.dims.length === 3 && Number(output.dims.at(-1)) === 4);
  if (!scores?.data || !boxes?.data) throw new Error('Face safety model returned unexpected outputs.');
  return { scores, boxes };
}

export class ExperimentalFaceGuard {
  constructor(loader) {
    this.loader = loader;
    this.session = null;
    this.ort = null;
    this.cachedImage = null;
    this.cachedFaces = [];
    this.available = false;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadModel('face-safety-ultraface', signal, onProgress);
    onProgress?.('Preparing identity guard…');
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all', enableCpuMemArena: true, logSeverityLevel: 3
    });
  }

  async detect(image, signal, onProgress) {
    if (!image?.width || !image?.height) return [];
    if (this.cachedImage === image) return this.cachedFaces;
    try {
      await this.initialize(signal, onProgress);
      abortIfNeeded(signal);
      onProgress?.('Locating faces for identity protection…');
      const data = faceTensor(image);
      const tensor = new this.ort.Tensor('float32', data, [1, 3, FACE_INPUT_HEIGHT, FACE_INPUT_WIDTH]);
      let results;
      try {
        results = await this.session.run({ [this.session.inputNames[0]]: tensor });
        const { scores, boxes } = resolveFaceOutputs(results);
        const count = Math.min(Math.floor(scores.data.length / 2), Math.floor(boxes.data.length / 4));
        const candidates = [];
        for (let i = 0; i < count; i++) {
          const score = Number(scores.data[i * 2 + 1]);
          if (!Number.isFinite(score) || score < FACE_SCORE_THRESHOLD) continue;
          const x1 = clamp(Number(boxes.data[i * 4])) * image.width;
          const y1 = clamp(Number(boxes.data[i * 4 + 1])) * image.height;
          const x2 = clamp(Number(boxes.data[i * 4 + 2])) * image.width;
          const y2 = clamp(Number(boxes.data[i * 4 + 3])) * image.height;
          if (x2 <= x1 || y2 <= y1 || x2 - x1 < 18 || y2 - y1 < 18) continue;
          candidates.push({ x1, y1, x2, y2, score });
        }
        this.cachedFaces = nms(candidates).map(face => ({
          x: face.x1, y: face.y1, width: face.x2 - face.x1, height: face.y2 - face.y1, score: face.score
        }));
        this.cachedImage = image;
        this.available = true;
        return this.cachedFaces;
      } finally {
        tensor.dispose?.();
        for (const output of Object.values(results || {})) output.dispose?.();
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('Experimental identity guard unavailable; conservative fallback will be used.', error);
      this.cachedImage = image;
      this.cachedFaces = [];
      this.available = false;
      return [];
    }
  }

  async dispose() {
    try { await this.session?.release?.(); } catch {}
    this.session = null;
    this.cachedImage = null;
    this.cachedFaces = [];
    this.available = false;
  }
}

export function faceInfluence(x, y, faces) {
  let influence = 0;
  for (const face of faces || []) {
    const cx = face.x + face.width * 0.5;
    const cy = face.y + face.height * 0.50;
    const rx = Math.max(1, face.width * 0.72);
    const ry = Math.max(1, face.height * 0.82);
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d >= 1) continue;
    influence = Math.max(influence, 1 - d);
  }
  return clamp(influence);
}

export function imageToTensor(image, sx, sy, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('AI input canvas is unavailable.');
  ctx.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    tensor[i] = rgba[p] / 255;
    tensor[plane + i] = rgba[p + 1] / 255;
    tensor[plane * 2 + i] = rgba[p + 2] / 255;
  }
  canvas.width = canvas.height = 0;
  return tensor;
}

export function tensorToCanvas(data, width, height) {
  const values = data instanceof Float32Array ? data : new Float32Array(data);
  const plane = width * height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('AI output canvas is unavailable.');
  const image = ctx.createImageData(width, height);
  let maxProbe = 0;
  const step = Math.max(1, Math.floor(plane / 1024));
  for (let i = 0; i < plane; i += step) {
    maxProbe = Math.max(maxProbe, Math.abs(values[i]), Math.abs(values[plane + i]), Math.abs(values[plane * 2 + i]));
  }
  const scale = maxProbe > 2 ? 1 : 255;
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    image.data[p] = byte(values[i] * scale);
    image.data[p + 1] = byte(values[plane + i] * scale);
    image.data[p + 2] = byte(values[plane * 2 + i] * scale);
    image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
