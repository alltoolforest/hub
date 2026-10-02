import {
  $, el, field, read, format, notice, setupStatus, status,
  fileInput, bindFile, checkFile, decodeImage, canvasBlob, output,
  downloads, clearOutputs, safeName
} from './core.js';
import {
  analyzeSourceImage,
  resolveRestorationProfile,
  prepareRestorationInput,
  blendForFidelity,
  resolveSharpening
} from './image-enhancer-restoration.js';
import {
  resolveContentRoute,
  resolveRouteControls,
  contentRouteOptions
} from './image-enhancer-routing.js';
import { aiInferenceDimensions, tileCorePlan, estimateTileCount, isMemoryPressureError } from './image-enhancer-tiles.js';
import { decodeEnhancerHeic, isEnhancerHeicInput } from './image-enhancer-heic.js';
import { detectEnhancerCapabilities } from './image-enhancer-capabilities.js';

const MB = 1024 * 1024;
const MODEL_CACHE = 'alltoolforest-image-enhancer-v1';

const sleepFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

class ProcessingWorkerBridge {
  constructor(caps) {
    this.available = !!(caps?.workers && caps?.offscreenCanvas && caps?.createImageBitmap);
    this.worker = this.available
      ? new Worker(new URL('./image-enhancer-processing-worker.js', import.meta.url), { type: 'module' })
      : null;
    this.sequence = 0;
    this.pending = new Map();

    this.worker?.addEventListener('message', event => {
      const message = event.data || {};
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.cleanup?.();
      if (!message.ok) {
        const error = new Error(message.error || 'Background image processing failed.');
        error.name = message.name || 'Error';
        pending.reject(error);
        return;
      }
      pending.resolve(message);
    });

    this.worker?.addEventListener('error', event => {
      const error = new Error(event?.message || 'Background image worker stopped unexpectedly.');
      for (const pending of this.pending.values()) {
        pending.cleanup?.();
        pending.reject(error);
      }
      this.pending.clear();
    });
  }

  request(type, payload, transfer = [], signal) {
    if (!this.worker) return Promise.reject(new Error('Background image processing is unavailable in this browser.'));
    if (signal?.aborted) return Promise.reject(new DOMException('Processing cancelled.', 'AbortError'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.worker?.postMessage({ type: 'cancel', id });
        this.pending.delete(id);
        reject(new DOMException('Processing cancelled.', 'AbortError'));
      };
      if (signal) signal.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      this.pending.set(id, { resolve, reject, cleanup });
      try {
        this.worker.postMessage({ id, type, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }

  async packTile(image, sx, sy, width, height, signal) {
    const bitmap = await createImageBitmap(image, sx, sy, width, height);
    const result = await this.request('pack-tile', { bitmap, width, height }, [bitmap], signal);
    return new Float32Array(result.buffer);
  }

  async tensorToBitmap(data, width, height, signal) {
    let buffer;
    if (data?.buffer instanceof ArrayBuffer && data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      buffer = data.buffer;
    } else {
      buffer = new Float32Array(data).buffer;
    }
    let result;
    try {
      result = await this.request('tensor-to-bitmap', { buffer, width, height }, [buffer], signal);
    } catch (error) {
      if (error?.name === 'DataCloneError') {
        const copy = new Float32Array(data).buffer;
        result = await this.request('tensor-to-bitmap', { buffer: copy, width, height }, [copy], signal);
      } else {
        throw error;
      }
    }
    return result.bitmap;
  }

  async postprocessCanvas(inputCanvas, { local, analysis, sharpening }, signal) {
    if (!this.available) return { canvas: inputCanvas, applied: false, label: 'Background finishing unavailable' };
    const bitmap = await createImageBitmap(inputCanvas);
    const result = await this.request('postprocess', {
      bitmap,
      local: !!local,
      analysis: analysis || null,
      sharpening: sharpening || null
    }, [bitmap], signal);

    const canvas = el('canvas', { width: result.bitmap.width, height: result.bitmap.height });
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      result.bitmap.close?.();
      throw new Error('Finished image canvas is unavailable.');
    }
    ctx.drawImage(result.bitmap, 0, 0);
    result.bitmap.close?.();
    inputCanvas.width = inputCanvas.height = 0;
    return {
      canvas,
      applied: !!(local || sharpening?.amount),
      label: sharpening?.label || 'Auto'
    };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) {
      pending.cleanup?.();
      pending.reject(new Error('Background image worker closed.'));
    }
    this.pending.clear();
  }
}

class EnhancementEngine {
  constructor(id, label, kind) {
    this.id = id;
    this.label = label;
    this.kind = kind;
  }
  async initialize() {}
  async process() { throw new Error('Enhancement engine is not implemented.'); }
  async dispose() {}
}

class BrowserResampleEngine extends EnhancementEngine {
  constructor() {
    super('browser-resample', 'Standard high-quality enlargement', 'fallback');
  }

  async process({ image, width, height, signal, onProgress }) {
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
    onProgress?.('Preparing standard high-quality enlargement…');
    const canvas = el('canvas', { width, height });
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas processing is unavailable in this browser.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    if (signal?.aborted) {
      canvas.width = canvas.height = 0;
      throw new DOMException('Processing cancelled.', 'AbortError');
    }
    onProgress?.('Encoding output…');
    return { canvas, aiUsed: false, engine: this, backend: 'browser-resample' };
  }
}

class BrowserEnhanceEngine extends EnhancementEngine {
  constructor() {
    super('browser-enhance', 'Fast local enhancement', 'fallback');
  }

  async process({ image, width, height, signal, onProgress }) {
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
    onProgress?.('Improving the image locally…');
    const canvas = el('canvas', { width, height });
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas processing is unavailable in this browser.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'contrast(1.06) saturate(1.03)';
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = 'none';
    await sleepFrame();
    if (signal?.aborted) {
      canvas.width = canvas.height = 0;
      throw new DOMException('Processing cancelled.', 'AbortError');
    }
    return { canvas, aiUsed: false, engine: this, backend: 'browser-enhance' };
  }
}

class EnhancerModelLoader {
  constructor() {
    this.manifest = null;
    this.runtimePromise = null;
    this.modelPromise = null;
    this.deblurModelPromise = null;
  }

  async loadManifest(signal) {
    if (this.manifest) return this.manifest;
    const response = await fetch(new URL('../models/image-enhancer/manifest.json', import.meta.url), {
      signal,
      cache: 'no-cache'
    });
    if (!response.ok) throw new Error('Enhancer model manifest could not be loaded.');
    this.manifest = await response.json();
    return this.manifest;
  }

  async loadRuntime(signal, onProgress) {
    if (window.ort?.InferenceSession) return window.ort;
    if (this.runtimePromise) return this.runtimePromise;
    this.runtimePromise = (async () => {
      const manifest = await this.loadManifest(signal);
      const config = manifest.runtime;
      onProgress?.('Downloading AI runtime…');
      const response = await fetch(config.bundle, { signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`AI runtime download failed (${response.status}).`);
      const source = await response.text();
      if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
      const blobURL = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = blobURL;
          script.async = true;
          script.onload = () => { script.remove(); resolve(); };
          script.onerror = () => { script.remove(); reject(new Error('AI runtime could not start.')); };
          document.head.append(script);
        });
      } finally {
        URL.revokeObjectURL(blobURL);
      }
      const ort = window.ort;
      if (!ort?.InferenceSession || !ort?.Tensor) throw new Error('AI runtime loaded without the required ONNX APIs.');
      ort.env.logLevel = 'warning';
      ort.env.wasm.wasmPaths = config.wasmBase;
      ort.env.wasm.initTimeout = 45000;
      ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(2, Math.max(1, navigator.hardwareConcurrency || 1)) : 1;
      return ort;
    })();
    try {
      return await this.runtimePromise;
    } catch (error) {
      this.runtimePromise = null;
      throw error;
    }
  }

  async loadModel(signal, onProgress) {
    if (this.modelPromise) return this.modelPromise;
    this.modelPromise = (async () => {
      const manifest = await this.loadManifest(signal);
      const model = manifest.models['general-x4'];
      let bytes = null;

      if ('caches' in window) {
        try {
          const cache = await caches.open(MODEL_CACHE);
          const cached = await cache.match(model.url);
          if (cached) {
            onProgress?.('Checking cached AI model…');
            bytes = await cached.arrayBuffer();
            if (!(await verifySha256(bytes, model.sha256))) {
              bytes = null;
              await cache.delete(model.url);
            }
          }
        } catch {
          // Cache is optional. Continue with network loading.
        }
      }

      if (!bytes) {
        onProgress?.('Downloading AI model…');
        const response = await fetch(model.url, { signal, cache: 'force-cache' });
        if (!response.ok) throw new Error(`AI model download failed (${response.status}).`);
        bytes = await readResponseWithProgress(response, signal, (loaded, total) => {
          if (total) onProgress?.(`Downloading AI model… ${Math.min(100, Math.round(loaded / total * 100))}%`);
          else onProgress?.(`Downloading AI model… ${format(loaded / MB, 1)} MB`);
        });
        onProgress?.('Verifying AI model…');
        if (!(await verifySha256(bytes, model.sha256))) {
          throw new Error('AI model integrity check failed. The downloaded model was not used.');
        }
        if ('caches' in window) {
          try {
            const cache = await caches.open(MODEL_CACHE);
            await cache.put(model.url, new Response(bytes.slice(0), {
              headers: { 'content-type': 'application/octet-stream' }
            }));
          } catch {
            // Cache quota/private-mode failures are non-fatal.
          }
        }
      }
      return { config: model, bytes };
    })();
    try {
      return await this.modelPromise;
    } catch (error) {
      this.modelPromise = null;
      throw error;
    }
  }

  async loadDeblurModel(signal, onProgress) {
    if (this.deblurModelPromise) return this.deblurModelPromise;
    this.deblurModelPromise = (async () => {
      const manifest = await this.loadManifest(signal);
      const model = manifest.models['deblur-nafnet'];
      let bytes = null;

      if ('caches' in window) {
        try {
          const cache = await caches.open(MODEL_CACHE);
          const cached = await cache.match(model.url);
          if (cached) {
            onProgress?.('Checking cached deblur model…');
            bytes = await cached.arrayBuffer();
            if (!(await verifySha256(bytes, model.sha256))) {
              bytes = null;
              await cache.delete(model.url);
            }
          }
        } catch {}
      }

      if (!bytes) {
        onProgress?.('Downloading deblur model…');
        const response = await fetch(model.url, { signal, cache: 'force-cache' });
        if (!response.ok) throw new Error(`Deblur model download failed (${response.status}).`);
        bytes = await readResponseWithProgress(response, signal, (loaded, total) => {
          if (total) onProgress?.(`Downloading deblur model… ${Math.min(100, Math.round(loaded / total * 100))}%`);
          else onProgress?.(`Downloading deblur model… ${format(loaded / MB, 1)} MB`);
        });
        onProgress?.('Verifying deblur model…');
        if (!(await verifySha256(bytes, model.sha256))) {
          throw new Error('Deblur model integrity check failed. The downloaded model was not used.');
        }
        if ('caches' in window) {
          try {
            const cache = await caches.open(MODEL_CACHE);
            await cache.put(model.url, new Response(bytes.slice(0), {
              headers: { 'content-type': 'application/octet-stream' }
            }));
          } catch {}
        }
      }
      return { config: model, bytes };
    })();
    try {
      return await this.deblurModelPromise;
    } catch (error) {
      this.deblurModelPromise = null;
      throw error;
    }
  }
}

class OnnxSuperResolutionEngine extends EnhancementEngine {
  constructor(loader, caps, processor) {
    super('realesrgan-x4v3', 'Real-ESRGAN general x4v3', 'ai');
    this.loader = loader;
    this.caps = caps;
    this.processor = processor;
    this.session = null;
    this.ort = null;
    this.backend = null;
    this.nativeScale = 4;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    if (!this.caps.workers) throw new Error('Background AI processing is unavailable in this browser.');
    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadModel(signal, onProgress);
    onProgress?.('Preparing background AI engine…');

    // Production intentionally uses worker-backed WASM. WebGPU is not selected
    // until a real-browser responsiveness gate proves it safe for this tool.
    this.ort.env.wasm.proxy = true;
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true
    });
    this.backend = 'wasm-worker';
  }

  async process({ image, scale, width, height, signal, onProgress }) {
    await this.initialize(signal, onProgress);
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

    const plans = tileCorePlan({ ...this.caps, webgpu: false });
    const firstTileCount = estimateTileCount(image.width, image.height, plans[0]);
    if (!this.caps.workers || !this.processor?.available) {
      throw new Error('This browser cannot run this AI workload responsively without background workers.');
    }
    if (!Number.isFinite(firstTileCount)) throw new Error('AI tile plan could not be created.');
    let lastError = null;
    for (let attempt = 0; attempt < plans.length; attempt++) {
      const tileCore = plans[attempt];
      try {
        if (attempt > 0) onProgress?.(`Retrying AI with smaller ${tileCore}px tiles…`);
        return await this.processTiled({ image, scale, width, height, signal, onProgress, tileCore, retryCount: attempt });
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        lastError = error;
        if (!isMemoryPressureError(error) || attempt === plans.length - 1) throw error;
        const next = plans[attempt + 1];
        onProgress?.(`Memory pressure detected. Retrying with smaller ${next}px tiles…`);
        await sleepFrame();
      }
    }
    throw lastError || new Error('AI tiling failed.');
  }

  async processTiled({ image, scale, width, height, signal, onProgress, tileCore, retryCount }) {
    const outputCanvas = el('canvas', { width, height });
    const outputCtx = outputCanvas.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!outputCtx) throw new RangeError('Output canvas allocation failed.');
    outputCtx.imageSmoothingEnabled = true;
    outputCtx.imageSmoothingQuality = 'high';

    const padding = 16;
    const cols = Math.ceil(image.width / tileCore);
    const rows = Math.ceil(image.height / tileCore);
    const total = cols * rows;
    let index = 0;

    try {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

          const x = col * tileCore;
          const y = row * tileCore;
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
          onProgress?.(`Enhancing tile ${index} of ${total}…`);
          const tile = await this.inferTile(image, sx, sy, tileW, tileH, signal);
          const srcX = padLeft * this.nativeScale;
          const srcY = padTop * this.nativeScale;
          const srcW = coreW * this.nativeScale;
          const srcH = coreH * this.nativeScale;
          const dstX = Math.round(x * width / image.width);
          const dstY = Math.round(y * height / image.height);
          const dstRight = Math.round((x + coreW) * width / image.width);
          const dstBottom = Math.round((y + coreH) * height / image.height);
          const dstW = Math.max(1, dstRight - dstX);
          const dstH = Math.max(1, dstBottom - dstY);

          outputCtx.drawImage(tile, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
          tile.close?.();
          if ('width' in tile) {
            try { tile.width = tile.height = 0; } catch {}
          }
          await sleepFrame();
        }
      }

      return {
        canvas: outputCanvas,
        aiUsed: true,
        engine: this,
        backend: this.backend,
        tileCount: total,
        tileCore,
        retryCount,
        inferenceWidth: image.width,
        inferenceHeight: image.height,
        reconstructed: true
      };
    } catch (error) {
      outputCanvas.width = outputCanvas.height = 0;
      throw error;
    }
  }

  async inferTile(image, sx, sy, width, height, signal) {
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
    const data = await this.processor.packTile(image, sx, sy, width, height, signal);
    const tensor = new this.ort.Tensor('float32', data, [1, 3, height, width]);
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    const results = await this.session.run({ [inputName]: tensor });
    const output = results[outputName];
    if (!output?.data || output.dims?.length !== 4) throw new Error('AI model returned an unexpected output.');
    const outH = Number(output.dims[2]);
    const outW = Number(output.dims[3]);
    if (outW !== width * this.nativeScale || outH !== height * this.nativeScale) {
      throw new Error(`AI model returned ${outW} × ${outH}; expected ${width * this.nativeScale} × ${height * this.nativeScale}.`);
    }
    return this.processor.tensorToBitmap(output.data, outW, outH, signal);
  }

  async dispose() {
    try { await this.session?.release?.(); } catch {}
    this.session = null;
  }
}


class OnnxDeblurEngine extends EnhancementEngine {
  constructor(loader, caps, processor) {
    super('nafnet-deblur', 'NAFNet deblurring', 'ai');
    this.loader = loader;
    this.caps = caps;
    this.processor = processor;
    this.session = null;
    this.ort = null;
    this.backend = null;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    if (!this.caps.workers || !this.processor?.available) {
      throw new Error('Background deblurring is unavailable in this browser.');
    }
    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadDeblurModel(signal, onProgress);
    onProgress?.('Preparing dedicated deblur engine…');
    this.ort.env.wasm.proxy = true;
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true
    });
    this.backend = 'wasm-worker';
  }

  async process({ image, signal, onProgress }) {
    await this.initialize(signal, onProgress);
    const plans = this.caps.isMobile ? [128, 96, 64] : [192, 144, 96, 64];
    let lastError = null;
    for (let attempt = 0; attempt < plans.length; attempt++) {
      try {
        return await this.processTiled(image, plans[attempt], signal, onProgress, attempt);
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        lastError = error;
        if (!isMemoryPressureError(error) || attempt === plans.length - 1) throw error;
        onProgress?.(`Deblur memory pressure detected. Retrying with smaller ${plans[attempt + 1]}px tiles…`);
        await sleepFrame();
      }
    }
    throw lastError || new Error('Deblur processing failed.');
  }

  async processTiled(image, tileCore, signal, onProgress, retryCount) {
    const outputCanvas = el('canvas', { width: image.width, height: image.height });
    const ctx = outputCanvas.getContext('2d', { alpha: false });
    if (!ctx) throw new RangeError('Deblur output canvas allocation failed.');
    const padding = 24;
    const cols = Math.ceil(image.width / tileCore);
    const rows = Math.ceil(image.height / tileCore);
    const total = cols * rows;
    let index = 0;

    try {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
          const x = col * tileCore;
          const y = row * tileCore;
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
          onProgress?.(`Deblurring tile ${index} of ${total}…`);
          const tile = await this.inferTile(image, sx, sy, tileW, tileH, signal);
          ctx.drawImage(tile, padLeft, padTop, coreW, coreH, x, y, coreW, coreH);
          tile.close?.();
          await sleepFrame();
        }
      }
      return {
        canvas: outputCanvas,
        aiUsed: true,
        engine: this,
        backend: this.backend,
        tileCount: total,
        tileCore,
        retryCount,
        deblurred: true
      };
    } catch (error) {
      outputCanvas.width = outputCanvas.height = 0;
      throw error;
    }
  }

  async inferTile(image, sx, sy, width, height, signal) {
    const data = await this.processor.packTile(image, sx, sy, width, height, signal);
    const tensor = new this.ort.Tensor('float32', data, [1, 3, height, width]);
    const inputName = this.session.inputNames[0];
    const outputName = this.session.outputNames[0];
    const results = await this.session.run({ [inputName]: tensor });
    const output = results[outputName];
    if (!output?.data || output.dims?.length !== 4) throw new Error('Deblur model returned an unexpected output.');
    const outH = Number(output.dims[2]);
    const outW = Number(output.dims[3]);
    if (outW !== width || outH !== height) {
      throw new Error(`Deblur model returned ${outW} × ${outH}; expected ${width} × ${height}.`);
    }
    return this.processor.tensorToBitmap(output.data, outW, outH, signal);
  }

  async dispose() {
    try { await this.session?.release?.(); } catch {}
    this.session = null;
  }
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

async function verifySha256(buffer, expected) {
  if (!globalThis.crypto?.subtle?.digest) return false;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  const actual = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  return actual === String(expected).toLowerCase();
}

async function readResponseWithProgress(response, signal, onProgress) {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
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

function sampleDetailMetrics(input) {
  const sourceWidth = Number(input?.width) || 0;
  const sourceHeight = Number(input?.height) || 0;
  if (!sourceWidth || !sourceHeight) return { edge: 0, texture: 0 };
  const sampleW = Math.max(48, Math.min(320, sourceWidth));
  const sampleH = Math.max(48, Math.round(sampleW * sourceHeight / sourceWidth));
  const canvas = el('canvas', { width: sampleW, height: sampleH });
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) return { edge: 0, texture: 0 };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(input, 0, 0, sampleW, sampleH);
  const rgba = ctx.getImageData(0, 0, sampleW, sampleH).data;
  canvas.width = canvas.height = 0;

  const gray = new Float32Array(sampleW * sampleH);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
  }

  let edge = 0;
  let texture = 0;
  let edgeCount = 0;
  let textureCount = 0;
  for (let y = 1; y < sampleH - 1; y++) {
    for (let x = 1; x < sampleW - 1; x++) {
      const i = y * sampleW + x;
      edge += Math.abs(gray[i + 1] - gray[i]) + Math.abs(gray[i + sampleW] - gray[i]);
      edgeCount += 2;
      const neighbours = (gray[i - 1] + gray[i + 1] + gray[i - sampleW] + gray[i + sampleW]) * 0.25;
      texture += Math.abs(gray[i] - neighbours);
      textureCount++;
    }
  }
  return {
    edge: edgeCount ? edge / edgeCount : 0,
    texture: textureCount ? texture / textureCount : 0
  };
}

function sampleRegionalDetailGrid(input, columns = 6, rows = 6) {
  const sourceWidth = Number(input?.width) || 0;
  const sourceHeight = Number(input?.height) || 0;
  if (!sourceWidth || !sourceHeight) return { columns, rows, regions: [] };

  const sampleW = Math.max(180, Math.min(720, sourceWidth));
  const sampleH = Math.max(120, Math.round(sampleW * sourceHeight / sourceWidth));
  const canvas = el('canvas', { width: sampleW, height: sampleH });
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) return { columns, rows, regions: [] };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(input, 0, 0, sampleW, sampleH);
  const rgba = ctx.getImageData(0, 0, sampleW, sampleH).data;
  canvas.width = canvas.height = 0;

  const gray = new Float32Array(sampleW * sampleH);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
  }

  const regions = [];
  for (let row = 0; row < rows; row++) {
    const y0 = Math.max(1, Math.floor(row * sampleH / rows));
    const y1 = Math.min(sampleH - 1, Math.floor((row + 1) * sampleH / rows));
    for (let col = 0; col < columns; col++) {
      const x0 = Math.max(1, Math.floor(col * sampleW / columns));
      const x1 = Math.min(sampleW - 1, Math.floor((col + 1) * sampleW / columns));
      let edge = 0;
      let texture = 0;
      let edgeCount = 0;
      let textureCount = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * sampleW + x;
          if (x + 1 < x1) {
            edge += Math.abs(gray[i + 1] - gray[i]);
            edgeCount++;
          }
          if (y + 1 < y1) {
            edge += Math.abs(gray[i + sampleW] - gray[i]);
            edgeCount++;
          }
          const neighbours = (gray[i - 1] + gray[i + 1] + gray[i - sampleW] + gray[i + sampleW]) * 0.25;
          texture += Math.abs(gray[i] - neighbours);
          textureCount++;
        }
      }

      regions.push({
        row,
        col,
        edge: edgeCount ? edge / edgeCount : 0,
        texture: textureCount ? texture / textureCount : 0
      });
    }
  }

  return { columns, rows, regions };
}

async function enforceRegionalDetailFloor(resultCanvas, sourceImage, profile, signal) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
  const target = Number(profile?.minRegionalDetailRatio) || Number(profile?.minDetailRatio) || 0.90;
  const sourceGrid = sampleRegionalDetailGrid(sourceImage);
  const resultGrid = sampleRegionalDetailGrid(resultCanvas);
  if (!sourceGrid.regions.length || sourceGrid.regions.length !== resultGrid.regions.length) {
    return { canvas: resultCanvas, protected: false, worstRatio: 1, protectedRegions: 0 };
  }

  const sourceGlobal = sampleDetailMetrics(sourceImage);
  const maskValues = new Uint8ClampedArray(sourceGrid.columns * sourceGrid.rows * 4);
  let worstRatio = 1;
  let protectedRegions = 0;

  for (let i = 0; i < sourceGrid.regions.length; i++) {
    const sourceRegion = sourceGrid.regions[i];
    const resultRegion = resultGrid.regions[i];
    const edgeRatio = sourceRegion.edge > 0.001 ? resultRegion.edge / sourceRegion.edge : 1;
    const textureRatio = sourceRegion.texture > 0.001 ? resultRegion.texture / sourceRegion.texture : 1;
    const ratio = Math.min(edgeRatio, textureRatio);
    worstRatio = Math.min(worstRatio, ratio);

    const meaningfulSourceDetail =
      sourceRegion.edge >= Math.max(1.5, sourceGlobal.edge * 0.35) ||
      sourceRegion.texture >= Math.max(0.8, sourceGlobal.texture * 0.35);
    const deficit = target - ratio;

    let restoreAlpha = 0;
    if (meaningfulSourceDetail && deficit > 0.015) {
      restoreAlpha = Math.max(0.12, Math.min(0.92, 0.12 + (deficit / Math.max(target, 0.01)) * 4.2));
      protectedRegions++;
    }

    const p = i * 4;
    maskValues[p] = 255;
    maskValues[p + 1] = 255;
    maskValues[p + 2] = 255;
    maskValues[p + 3] = Math.round(restoreAlpha * 255);
  }

  if (!protectedRegions) {
    return { canvas: resultCanvas, protected: false, worstRatio, protectedRegions: 0 };
  }

  const maskScale = 8;
  const maskSmall = el('canvas', {
    width: sourceGrid.columns * maskScale,
    height: sourceGrid.rows * maskScale
  });
  const maskSmallCtx = maskSmall.getContext('2d', { alpha: true });
  if (!maskSmallCtx) {
    maskSmall.width = maskSmall.height = 0;
    return { canvas: resultCanvas, protected: false, worstRatio, protectedRegions: 0 };
  }
  maskSmallCtx.clearRect(0, 0, maskSmall.width, maskSmall.height);
  for (let i = 0; i < sourceGrid.regions.length; i++) {
    const region = sourceGrid.regions[i];
    const alpha = maskValues[i * 4 + 3] / 255;
    if (alpha <= 0) continue;
    maskSmallCtx.fillStyle = `rgba(255,255,255,${alpha})`;
    maskSmallCtx.fillRect(
      region.col * maskScale,
      region.row * maskScale,
      maskScale,
      maskScale
    );
  }

  const overlay = el('canvas', { width: resultCanvas.width, height: resultCanvas.height });
  const overlayCtx = overlay.getContext('2d', { alpha: true });
  const candidate = el('canvas', { width: resultCanvas.width, height: resultCanvas.height });
  const candidateCtx = candidate.getContext('2d', { alpha: false });
  if (!overlayCtx || !candidateCtx) {
    maskSmall.width = maskSmall.height = 0;
    overlay.width = overlay.height = 0;
    candidate.width = candidate.height = 0;
    return { canvas: resultCanvas, protected: false, worstRatio, protectedRegions: 0 };
  }

  overlayCtx.imageSmoothingEnabled = true;
  overlayCtx.imageSmoothingQuality = 'high';
  overlayCtx.drawImage(sourceImage, 0, 0, overlay.width, overlay.height);
  overlayCtx.globalCompositeOperation = 'destination-in';
  overlayCtx.drawImage(maskSmall, 0, 0, overlay.width, overlay.height);
  overlayCtx.globalCompositeOperation = 'source-over';

  candidateCtx.drawImage(resultCanvas, 0, 0);
  candidateCtx.drawImage(overlay, 0, 0);

  maskSmall.width = maskSmall.height = 0;
  overlay.width = overlay.height = 0;
  await sleepFrame();

  return { canvas: candidate, protected: true, worstRatio, protectedRegions };
}

async function enforceEnhanceDetailFloor(resultCanvas, sourceImage, profile, signal) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
  const source = sampleDetailMetrics(sourceImage);
  const current = sampleDetailMetrics(resultCanvas);
  const edgeRatio = source.edge > 0.001 ? current.edge / source.edge : 1;
  const textureRatio = source.texture > 0.001 ? current.texture / source.texture : 1;
  const initialRatio = Math.min(edgeRatio, textureRatio);
  const target = Number(profile?.minDetailRatio) || 0.90;

  let best = resultCanvas;
  let bestRatio = initialRatio;
  let globallyProtected = false;

  if (initialRatio < target) {
    for (const processedAlpha of [0.48, 0.40, 0.32, 0.24]) {
      if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
      const candidate = el('canvas', { width: resultCanvas.width, height: resultCanvas.height });
      const ctx = candidate.getContext('2d', { alpha: false });
      if (!ctx) {
        candidate.width = candidate.height = 0;
        break;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceImage, 0, 0, candidate.width, candidate.height);
      ctx.globalAlpha = processedAlpha;
      ctx.drawImage(resultCanvas, 0, 0);
      ctx.globalAlpha = 1;

      const metrics = sampleDetailMetrics(candidate);
      const ratio = Math.min(
        source.edge > 0.001 ? metrics.edge / source.edge : 1,
        source.texture > 0.001 ? metrics.texture / source.texture : 1
      );

      if (ratio > bestRatio) {
        if (best !== resultCanvas) best.width = best.height = 0;
        best = candidate;
        bestRatio = ratio;
        globallyProtected = true;
      } else {
        candidate.width = candidate.height = 0;
      }
      if (bestRatio >= target) break;
      await sleepFrame();
    }
  }

  const regional = await enforceRegionalDetailFloor(best, sourceImage, profile, signal);
  if (regional.canvas !== best) {
    if (best !== resultCanvas) best.width = best.height = 0;
    best = regional.canvas;
  }

  const finalMetrics = sampleDetailMetrics(best);
  const finalRatio = Math.min(
    source.edge > 0.001 ? finalMetrics.edge / source.edge : 1,
    source.texture > 0.001 ? finalMetrics.texture / source.texture : 1
  );

  if (best !== resultCanvas) resultCanvas.width = resultCanvas.height = 0;
  return {
    canvas: best,
    detailRatio: finalRatio,
    regionalDetailRatio: regional.worstRatio,
    protectedRegions: regional.protectedRegions,
    protected: globallyProtected || regional.protected
  };
}

function safeOutputFor(image, scale, caps) {
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const pixels = width * height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('The requested output dimensions are invalid.');
  }
  if (width > caps.maxSide || height > caps.maxSide || pixels > caps.maxPixels) {
    const sideScale = Math.min(caps.maxSide / image.width, caps.maxSide / image.height);
    const pixelScale = Math.sqrt(caps.maxPixels / (image.width * image.height));
    const maxScale = Math.max(0.01, Math.min(sideScale, pixelScale));
    const safeW = Math.max(1, Math.floor(image.width * maxScale));
    const safeH = Math.max(1, Math.floor(image.height * maxScale));
    throw new Error(`This output is too large for the current safety limit. Maximum safe output is about ${safeW.toLocaleString()} × ${safeH.toLocaleString()} pixels.`);
  }
  return { width, height, pixels };
}

function sourceSummary(file, image, caps, analysis) {
  const mp = image.width * image.height / 1e6;
  const base = `${image.width.toLocaleString()} × ${image.height.toLocaleString()} · ${format(mp, 2)} MP · ${format(file.size / MB, 2)} MB · ${caps.wasm && caps.workers ? 'background AI ready' : 'standard fallback only'}`;
  return analysis?.note ? `${base} · Analysis: ${analysis.note}` : base;
}

function outputScaleOptions(image, caps) {
  const select = $('#enhancer-scale');
  if (!select || !image) return;
  for (const option of select.options) {
    const scale = Number(option.value);
    try {
      safeOutputFor(image, scale, caps);
      option.disabled = false;
      option.textContent = scale === 1 ? '1× Enhance / Restore' : `${scale}× AI Upscale`;
    } catch {
      option.disabled = true;
      option.textContent = `${scale}× (too large on this device)`;
    }
  }
  if (select.selectedOptions[0]?.disabled) {
    const first = [...select.options].find(o => !o.disabled);
    if (first) select.value = first.value;
  }
}

async function prepareAiInferenceInput(image, targetWidth, targetHeight, nativeScale, signal, caps) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
  const plan = aiInferenceDimensions(image.width, image.height, targetWidth, targetHeight, nativeScale, {
    isMobile: !!caps?.isMobile,
    iosLike: !!caps?.iosLike,
    deviceMemory: Number(caps?.deviceMemory) || 0,
    cores: Number(caps?.cores) || 2
  });
  if (plan.width === image.width && plan.height === image.height) {
    return { image, temporary: null, plan };
  }

  const resized = el('canvas', { width: plan.width, height: plan.height });
  const ctx = resized.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('AI working canvas is unavailable in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, plan.width, plan.height);
  await sleepFrame();
  if (signal?.aborted) {
    resized.width = resized.height = 0;
    throw new DOMException('Processing cancelled.', 'AbortError');
  }
  return { image: resized, temporary: resized, plan };
}

async function detectTransparency(image) {
  const sampleW = Math.min(512, image.width);
  const sampleH = Math.min(512, image.height);
  const canvas = el('canvas', { width: sampleW, height: sampleH });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, sampleW, sampleH);
  ctx.drawImage(image, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  canvas.width = canvas.height = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export async function mount(root, slug) {
  if (slug !== 'enhance') throw new Error('Image Enhancer mounted for an unsupported tool.');

  const caps = detectEnhancerCapabilities();
  const loader = new EnhancerModelLoader();
  const processor = new ProcessingWorkerBridge(caps);
  const aiEngine = new OnnxSuperResolutionEngine(loader, caps, processor);
  const deblurEngine = new OnnxDeblurEngine(loader, caps, processor);
  const fallbackEngine = new BrowserResampleEngine();
  const browserEnhanceEngine = new BrowserEnhanceEngine();
  let image = null;
  let file = null;
  let hasTransparency = false;
  let analysis = null;
  let controller = null;
  let processing = false;
  let taskMode = null;

  const input = fileInput(root, '.jpg,.jpeg,.png,.webp,.heic,.heif', false, 'Open an image');
  const summary = el('p', { class: 'status', id: 'enhancer-source-info', text: 'Choose an image to inspect its safe processing limits.' });
  root.append(summary);

  const preview = el('canvas', { 'aria-label': 'Source image preview', role: 'img' });
  const frame = el('div', { class: 'canvas-frame', hidden: true });
  frame.append(preview);
  root.append(frame);

  const modeSection = el('section', { id: 'enhancer-mode-picker', 'aria-label': 'Choose enhancer task' });
  modeSection.append(
    el('h2', { text: 'What do you want to do?' }),
    el('p', {
      class: 'status',
      id: 'enhancer-mode-help',
      text: 'Choose one task first. You will only see controls for that task.'
    })
  );
  const modeActions = el('div', { class: 'actions' });
  const enhanceModeButton = el('button', {
    id: 'enhancer-mode-enhance',
    type: 'button',
    text: 'Enhance quality',
    'aria-pressed': 'false'
  });
  const upscaleModeButton = el('button', {
    id: 'enhancer-mode-upscale',
    type: 'button',
    text: 'Upscale resolution',
    'aria-pressed': 'false'
  });
  modeActions.append(enhanceModeButton, upscaleModeButton);
  modeSection.append(modeActions);
  root.append(modeSection);

  const form = el('div', { class: 'fields', hidden: true });
  form.append(
    field('enhancer-scale', 'Upscale amount', 'select', '2', {
      options: [['1', '1× internal enhance'], ['2', '2× AI Upscale'], ['4', '4× AI Upscale']]
    }),
    field('enhancer-content', 'Photo type', 'select', 'auto', {
      options: [
        ['auto', 'Auto'],
        ['general', 'Photo'],
        ['high-fidelity', 'Clear photo'],
        ['low-resolution', 'Low-quality photo'],
        ['portrait', 'Portrait / face'],
        ['text-logo', 'Text / logo'],
        ['illustration', 'Illustration / artwork'],
        ['old-photo', 'Old photo']
      ]
    }),
    field('enhancer-restoration', 'Enhancement strength', 'select', 'auto', {
      options: [
        ['auto', 'Auto'],
        ['fidelity', 'Light'],
        ['balanced', 'Normal'],
        ['recovery', 'Strong']
      ]
    }),
    field('enhancer-sharpen', 'Sharpness', 'select', 'auto', {
      options: [
        ['auto', 'Auto'],
        ['off', 'Off'],
        ['low', 'Light'],
        ['medium', 'Strong']
      ]
    })
  );
  root.append(form);

  const scaleWrap = $('#enhancer-scale', root).closest('.field');
  const contentWrap = $('#enhancer-content', root).closest('.field');
  const restorationWrap = $('#enhancer-restoration', root).closest('.field');
  const sharpenWrap = $('#enhancer-sharpen', root).closest('.field');
  scaleWrap.hidden = true;
  contentWrap.hidden = true;
  restorationWrap.hidden = true;
  sharpenWrap.hidden = true;

  notice(root, 'Processing happens in your browser. Enhance quality improves the image without changing its size. Upscale resolution increases the pixel dimensions. Large images can take longer, and the tool uses background processing to keep the page responsive.');

  function drawSource() {
    if (!image) return;
    const scale = Math.min(1, 1000 / image.width, 1000 / image.height);
    preview.width = Math.max(1, Math.round(image.width * scale));
    preview.height = Math.max(1, Math.round(image.height * scale));
    const ctx = preview.getContext('2d');
    if (!ctx) throw new Error('Image preview is unavailable in this browser.');
    ctx.drawImage(image, 0, 0, preview.width, preview.height);
  }

  bindFile(input, async files => {
    file = files[0];
    checkFile(file, ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], caps.maxFileMB);
    image?.close?.();
    image = isEnhancerHeicInput(file)
      ? await decodeEnhancerHeic(file, message => status(message))
      : await decodeImage(file);
    if (image.width * image.height > caps.maxSourcePixels) {
      const sourceLimitMP = format(caps.maxSourcePixels / 1e6, 0);
      image.close?.();
      image = null;
      throw new Error(`This image is beyond this device's safe decoded-image limit (about ${sourceLimitMP} MP). Try the same file on a device with more available memory.`);
    }
    clearOutputs();
    frame.hidden = false;
    drawSource();
    hasTransparency = await detectTransparency(image);
    analysis = await analyzeSourceImage(image, file);
    outputScaleOptions(image, caps);
    summary.textContent = sourceSummary(file, image, caps, analysis) + (hasTransparency ? ' · transparency detected' : '');
    // core.bindFile restores every workspace control after file loading. Re-apply
    // this tool's task-mode state on the next task so hidden/irrelevant controls
    // do not become interactable by accident.
    setTimeout(() => {
      if (!processing) setProcessing(false);
    }, 0);
  });

  const enhanceButton = el('button', { id: 'enhancer-run', type: 'button', class: 'primary', text: 'Choose Enhance or Upscale', disabled: true });
  const cancelButton = el('button', { type: 'button', text: 'Cancel', disabled: true });
  const resetButton = el('button', { type: 'button', text: 'Reset' });
  const actions = el('div', { class: 'actions' }, [enhanceButton, cancelButton, resetButton]);
  root.append(actions);

  function setTaskMode(mode, silent = false) {
    taskMode = mode === 'enhance' || mode === 'upscale' ? mode : null;
    root.dataset.enhancerMode = taskMode || '';
    const oneX = [...$('#enhancer-scale', root).options].find(option => option.value === '1');

    if (!taskMode) {
      form.hidden = true;
      scaleWrap.hidden = true;
      contentWrap.hidden = true;
      restorationWrap.hidden = true;
      sharpenWrap.hidden = true;
      if (oneX) {
        oneX.disabled = false;
        oneX.hidden = false;
      }
      enhanceModeButton.setAttribute('aria-pressed', 'false');
      upscaleModeButton.setAttribute('aria-pressed', 'false');
      enhanceModeButton.classList.remove('primary');
      upscaleModeButton.classList.remove('primary');
      enhanceButton.textContent = 'Choose Enhance or Upscale';
      enhanceButton.disabled = true;
      $('#enhancer-scale', root).disabled = true;
      $('#enhancer-content', root).disabled = true;
      $('#enhancer-restoration', root).disabled = true;
      $('#enhancer-sharpen', root).disabled = true;
      $('#enhancer-mode-help', root).textContent = 'Choose one task first. You will only see controls for that task.';
    } else if (taskMode === 'enhance') {
      form.hidden = false;
      $('#enhancer-scale', root).value = '1';
      scaleWrap.hidden = true;
      contentWrap.hidden = false;
      restorationWrap.hidden = false;
      sharpenWrap.hidden = false;
      if (oneX) {
        oneX.disabled = false;
        oneX.hidden = false;
      }
      enhanceModeButton.setAttribute('aria-pressed', 'true');
      upscaleModeButton.setAttribute('aria-pressed', 'false');
      enhanceModeButton.classList.add('primary');
      upscaleModeButton.classList.remove('primary');
      enhanceButton.textContent = 'Enhance photo';
      enhanceButton.disabled = processing;
      $('#enhancer-scale', root).disabled = true;
      $('#enhancer-content', root).disabled = processing;
      $('#enhancer-restoration', root).disabled = processing;
      $('#enhancer-sharpen', root).disabled = processing;
      $('#enhancer-mode-help', root).textContent = 'Enhance improves quality without changing the image size. Choose the photo type, strength and sharpness below.';
    } else {
      form.hidden = false;
      if ($('#enhancer-scale', root).value === '1') $('#enhancer-scale', root).value = '2';
      scaleWrap.hidden = false;
      contentWrap.hidden = true;
      restorationWrap.hidden = true;
      sharpenWrap.hidden = true;
      $('#enhancer-content', root).value = 'auto';
      $('#enhancer-restoration', root).value = 'auto';
      $('#enhancer-sharpen', root).value = 'auto';
      if (oneX) {
        oneX.disabled = true;
        oneX.hidden = true;
      }
      enhanceModeButton.setAttribute('aria-pressed', 'false');
      upscaleModeButton.setAttribute('aria-pressed', 'true');
      enhanceModeButton.classList.remove('primary');
      upscaleModeButton.classList.add('primary');
      enhanceButton.textContent = 'Upscale image';
      enhanceButton.disabled = processing;
      $('#enhancer-scale', root).disabled = processing;
      $('#enhancer-content', root).disabled = true;
      $('#enhancer-restoration', root).disabled = true;
      $('#enhancer-sharpen', root).disabled = true;
      $('#enhancer-mode-help', root).textContent = 'Upscale increases resolution. Choose the output size below; restoration settings stay automatic.';
    }

    clearOutputs();
    root.dispatchEvent(new CustomEvent('enhancer-modechange', { detail: { mode: taskMode } }));
    if (!silent && taskMode) status(taskMode === 'enhance' ? 'Enhance mode selected.' : 'Upscale mode selected.');
  }

  enhanceModeButton.addEventListener('click', () => setTaskMode('enhance'));
  upscaleModeButton.addEventListener('click', () => setTaskMode('upscale'));

  function setProcessing(active) {
    processing = active;
    enhanceButton.disabled = active || !taskMode;
    resetButton.disabled = active;
    input.disabled = active;
    enhanceModeButton.disabled = active;
    upscaleModeButton.disabled = active;
    $('#enhancer-scale').disabled = active || taskMode !== 'upscale';
    $('#enhancer-content').disabled = active || taskMode !== 'enhance';
    $('#enhancer-restoration').disabled = active || taskMode !== 'enhance';
    $('#enhancer-sharpen').disabled = active || taskMode !== 'enhance';
    cancelButton.disabled = !active;
  }

  cancelButton.addEventListener('click', () => {
    if (!processing) return;
    controller?.abort();
    status('Cancelling…');
  });

  resetButton.addEventListener('click', () => {
    controller?.abort();
    controller = null;
    clearOutputs();
    $('#enhancer-scale').value = '2';
    $('#enhancer-content').value = 'auto';
    $('#enhancer-restoration').value = 'auto';
    $('#enhancer-sharpen').value = 'auto';
    outputScaleOptions(image, caps);
    setTaskMode(null, true);
    if (image && file) summary.textContent = sourceSummary(file, image, caps, analysis) + (hasTransparency ? ' · transparency detected' : '');
    drawSource();
    status('Reset complete. Choose Enhance or Upscale.');
  });

  async function finishInBackground(canvas, { local, sharpening }, signal) {
    if (!processor.available) return { canvas, applied: false, label: 'Fast browser finish' };
    status(local ? 'Finishing enhancement in the background…' : 'Finishing upscale in the background…');
    try {
      return await processor.postprocessCanvas(canvas, { local, analysis, sharpening }, signal);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.warn('Background finishing unavailable; preserving completed image.', error);
      return { canvas, applied: false, label: 'Skipped safely' };
    }
  }

  async function runEnhancePipeline(signal) {
    const scale = 1;
    const contentRoute = resolveContentRoute(read('enhancer-content'), analysis, scale, caps);
    const routeControls = resolveRouteControls(contentRoute, read('enhancer-restoration'), read('enhancer-sharpen'));
    const restoration = resolveRestorationProfile(routeControls.restoration, analysis, scale);
    const sharpening = resolveSharpening(routeControls.sharpen, analysis, restoration);
    const { width, height } = safeOutputFor(image, 1, caps);
    let result = null;
    let temporaryInput = null;
    let temporaryAiInput = null;

    try {
      const shouldUseAi = contentRoute.engine !== 'standard' && caps.wasm && caps.workers && processor.available && !hasTransparency;
      if (!shouldUseAi) {
        result = await browserEnhanceEngine.process({
          image, width, height, signal,
          onProgress: message => status(message)
        });
        const finished = await finishInBackground(result.canvas, { local: true, sharpening }, signal);
        result.canvas = finished.canvas;
        const detail = await enforceEnhanceDetailFloor(result.canvas, image, restoration, signal);
        result.canvas = detail.canvas;
        const blob = await canvasBlob(result.canvas, 'image/png', 1);
        output(blob, safeName(file.name, '-enhanced', 'png'));
        const detailLabel = detail.protected ? ' · source detail protected' : '';
        status(`Enhanced · original size ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · background-safe local processing${detailLabel}.`);
        return result;
      }

      const blurEligible =
        analysis?.likelyBlurred &&
        contentRoute.engine !== 'standard' &&
        !['text-logo', 'illustration'].includes(contentRoute.id);

      if (blurEligible) {
        status('Blur detected. Running dedicated deblur reconstruction…');
        result = await deblurEngine.process({
          image,
          signal,
          onProgress: message => status(message)
        });

        const deblurBlend = Math.max(0.76, Math.min(0.92, 0.76 + (analysis.blurScore || 0) * 0.18));
        const blended = el('canvas', { width, height });
        const blendCtx = blended.getContext('2d', { alpha: false });
        if (!blendCtx) throw new Error('Deblur blend canvas is unavailable.');
        blendCtx.drawImage(image, 0, 0, width, height);
        blendCtx.globalAlpha = deblurBlend;
        blendCtx.drawImage(result.canvas, 0, 0, width, height);
        blendCtx.globalAlpha = 1;
        result.canvas.width = result.canvas.height = 0;
        result.canvas = blended;

        const finished = await finishInBackground(result.canvas, { local: false, sharpening }, signal);
        result.canvas = finished.canvas;
        const detail = await enforceEnhanceDetailFloor(result.canvas, image, restoration, signal);
        result.canvas = detail.canvas;
        const blob = await canvasBlob(result.canvas, 'image/png', 1);
        output(blob, safeName(file.name, '-enhanced', 'png'));
        const retryLabel = result.retryCount ? ` · deblur memory retry ×${result.retryCount}` : '';
        const detailLabel = detail.protected ? ' · source detail protected' : '';
        status(`Enhanced · original size ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · dedicated deblur AI${retryLabel}${detailLabel}.`);
        return result;
      }

      status('Preparing quality enhancement…');
      const aiPrepared = await prepareAiInferenceInput(image, width, height, aiEngine.nativeScale, signal, caps);
      temporaryAiInput = aiPrepared.temporary;
      const prepared = await prepareRestorationInput(aiPrepared.image, restoration, signal);
      temporaryInput = prepared.temporary;
      if (temporaryAiInput && temporaryInput) {
        temporaryAiInput.width = temporaryAiInput.height = 0;
        temporaryAiInput = null;
      }

      result = await aiEngine.process({
        image: prepared.image,
        scale: 1,
        width,
        height,
        signal,
        onProgress: message => status(message)
      });

      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
      temporaryInput = null;
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryAiInput = null;

      result.canvas = blendForFidelity(result.canvas, image, 1, restoration);
      const finished = await finishInBackground(result.canvas, { local: true, sharpening }, signal);
      result.canvas = finished.canvas;
      const detail = await enforceEnhanceDetailFloor(result.canvas, image, restoration, signal);
      result.canvas = detail.canvas;

      status('Creating enhanced image…');
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, '-enhanced', 'png'));
      const retryLabel = result.retryCount ? ` · memory retry ×${result.retryCount}` : '';
      const detailLabel = detail.protected ? ' · source detail protected' : '';
      status(`Enhanced · original size ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · background AI${retryLabel}${detailLabel}.`);
      return result;
    } catch (error) {
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
      if (error?.name === 'AbortError' || signal.aborted) throw error;

      console.warn('AI enhance path unavailable; using fast local enhancement.', error);
      status('AI enhancement unavailable. Using fast local enhancement…');
      result = await browserEnhanceEngine.process({
        image, width, height, signal,
        onProgress: message => status(message)
      });
      const finished = await finishInBackground(result.canvas, { local: true, sharpening }, signal);
      result.canvas = finished.canvas;
      const detail = await enforceEnhanceDetailFloor(result.canvas, image, restoration, signal);
      result.canvas = detail.canvas;
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, '-enhanced', 'png'));
      const detailLabel = detail.protected ? ' · source detail protected' : '';
      status(`Enhanced · original size ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · local fallback used safely${detailLabel}.`);
      return result;
    }
  }

  async function runUpscalePipeline(signal) {
    const scale = Number(read('enhancer-scale'));
    if (!Number.isFinite(scale) || scale <= 1) throw new Error('Choose an upscale target larger than the source.');
    const contentRoute = resolveContentRoute('auto', analysis, scale, caps);
    const routeControls = resolveRouteControls(contentRoute, 'auto', 'auto');
    const restoration = resolveRestorationProfile(routeControls.restoration, analysis, scale);
    const sharpening = resolveSharpening(routeControls.sharpen, analysis, restoration);
    const { width, height } = safeOutputFor(image, scale, caps);
    let result = null;
    let temporaryInput = null;
    let temporaryAiInput = null;

    try {
      if (!caps.wasm || !caps.workers || !processor.available || hasTransparency) {
        throw new Error(hasTransparency
          ? 'AI upscale for transparent images is not verified yet.'
          : 'Background AI processing is unavailable in this browser.');
      }

      status(`Preparing ${scale}× upscale…`);
      const aiPrepared = await prepareAiInferenceInput(image, width, height, aiEngine.nativeScale, signal, caps);
      temporaryAiInput = aiPrepared.temporary;
      const prepared = await prepareRestorationInput(aiPrepared.image, restoration, signal);
      temporaryInput = prepared.temporary;
      if (temporaryAiInput && temporaryInput) {
        temporaryAiInput.width = temporaryAiInput.height = 0;
        temporaryAiInput = null;
      }

      result = await aiEngine.process({
        image: prepared.image,
        scale,
        width,
        height,
        signal,
        onProgress: message => status(message)
      });

      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
      temporaryInput = null;
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryAiInput = null;

      result.canvas = blendForFidelity(result.canvas, image, scale, restoration);
      const finished = await finishInBackground(result.canvas, { local: false, sharpening }, signal);
      result.canvas = finished.canvas;

      status('Creating upscaled image…');
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, `-upscaled-${scale}x`, 'png'));
      const retryLabel = result.retryCount ? ` · memory retry ×${result.retryCount}` : '';
      status(`Upscaled ${scale}× · ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · background AI${retryLabel}.`);
      return result;
    } catch (error) {
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
      if (error?.name === 'AbortError' || signal.aborted) throw error;

      console.warn('AI upscale unavailable; using standard enlargement.', error);
      status(`AI upscale unavailable (${error.message}). Using standard enlargement…`);
      result = await fallbackEngine.process({
        image, width, height, signal,
        onProgress: message => status(message)
      });
      const finished = await finishInBackground(result.canvas, { local: false, sharpening }, signal);
      result.canvas = finished.canvas;
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, `-enlarged-${scale}x`, 'png'));
      status(`Enlarged ${scale}× · ${width.toLocaleString()} × ${height.toLocaleString()} · ${format(blob.size / 1024)} KB · standard fallback used.`);
      return result;
    }
  }

  enhanceButton.addEventListener('click', async () => {
    if (processing) return;
    if (!taskMode) {
      status('Choose Enhance or Upscale first.', true);
      return;
    }
    if (!image || !file) {
      status('Open an image first.', true);
      return;
    }

    clearOutputs();
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    let result = null;
    setProcessing(true);

    try {
      result = taskMode === 'enhance'
        ? await runEnhancePipeline(signal)
        : await runUpscalePipeline(signal);
    } catch (error) {
      if (error?.name === 'AbortError' || signal.aborted) {
        status('Processing cancelled.');
      } else {
        console.error(error);
        status(error?.message || 'Image processing failed.', true);
      }
    } finally {
      if (result?.canvas) result.canvas.width = result.canvas.height = 0;
      setProcessing(false);
    }
  });

  setupStatus(root);
  downloads(root);

  window.addEventListener('pagehide', () => {
    controller?.abort();
    image?.close?.();
    aiEngine.dispose();
    deblurEngine.dispose();
    processor.dispose();
    fallbackEngine.dispose();
    browserEnhanceEngine.dispose();
  }, { once: true });
}
