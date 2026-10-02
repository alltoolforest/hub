import {
  $, el, field, read, format, notice, setupStatus, status,
  fileInput, bindFile, checkFile, decodeImage, canvasBlob, output,
  downloads, clearOutputs, safeName, mobile
} from './core.js';
import {
  analyzeSourceImage,
  resolveRestorationProfile,
  prepareRestorationInput,
  blendForFidelity,
  resolveSharpening,
  applyIntelligentSharpen,
  applyLocalEnhancement
} from './image-enhancer-restoration.js';
import {
  resolveContentRoute,
  resolveRouteControls,
  contentRouteOptions
} from './image-enhancer-routing.js';
import { aiInferenceDimensions, tileCorePlan, estimateTileCount, isMemoryPressureError } from './image-enhancer-tiles.js';
import { decodeEnhancerHeic, isEnhancerHeicInput } from './image-enhancer-heic.js';

const MB = 1024 * 1024;
const SOURCE_PIXEL_LIMIT = 60e6;
const MODEL_CACHE = 'alltoolforest-image-enhancer-v1';
const DEFAULT_LIMITS = Object.freeze({
  mobile: { maxPixels: 8e6, maxSide: 8192, maxFileMB: 20 },
  desktop: { maxPixels: 24e6, maxSide: 16384, maxFileMB: 60 }
});

const sleepFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

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

class EnhancerModelLoader {
  constructor() {
    this.manifest = null;
    this.runtimePromise = null;
    this.modelPromise = null;
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
}

class OnnxSuperResolutionEngine extends EnhancementEngine {
  constructor(loader, caps) {
    super('realesrgan-x4v3', 'Real-ESRGAN general x4v3', 'ai');
    this.loader = loader;
    this.caps = caps;
    this.session = null;
    this.ort = null;
    this.backend = null;
    this.nativeScale = 4;
  }

  async initialize(signal, onProgress) {
    if (this.session) return;
    this.ort = await this.loader.loadRuntime(signal, onProgress);
    const model = await this.loader.loadModel(signal, onProgress);
    const preferWebGPU = this.caps.webgpu && !this.caps.isMobile;
    const useWasmProxy = this.caps.workers;
    onProgress?.(`Preparing AI engine (${preferWebGPU ? 'WebGPU preferred' : useWasmProxy ? 'WASM worker' : 'WASM'})…`);

    if (preferWebGPU) {
      try {
        this.session = await this.ort.InferenceSession.create(model.bytes, {
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all',
          enableCpuMemArena: true
        });
        this.backend = 'webgpu';
        return;
      } catch (error) {
        if (signal?.aborted) throw error;
        onProgress?.(`WebGPU initialization failed (${error?.message || 'unavailable'}). Retrying with ${useWasmProxy ? 'WASM worker' : 'WASM'}…`);
      }
    }

    // ONNX Runtime's proxy worker keeps WASM inference off the browser UI thread.
    // The site CSP permits blob workers; if workers are unavailable, large workloads
    // are rejected later rather than allowed to freeze the UI thread.
    this.ort.env.wasm.proxy = useWasmProxy;
    this.session = await this.ort.InferenceSession.create(model.bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true
    });
    this.backend = useWasmProxy ? 'wasm-worker' : 'wasm';
  }

  async process({ image, scale, width, height, signal, onProgress }) {
    await this.initialize(signal, onProgress);
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

    const plans = tileCorePlan(this.caps);
    const firstTileCount = estimateTileCount(image.width, image.height, plans[0]);
    if (this.backend === 'wasm' && !this.caps.workers && firstTileCount > 24) {
      throw new Error('This browser cannot run this AI workload responsively without a Web Worker.');
    }
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
          tile.width = tile.height = 0;
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
    const inputCanvas = el('canvas', { width, height });
    const inputCtx = inputCanvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!inputCtx) throw new RangeError('AI tile canvas allocation failed.');
    inputCtx.drawImage(image, sx, sy, width, height, 0, 0, width, height);
    const pixels = inputCtx.getImageData(0, 0, width, height).data;
    const plane = width * height;
    let data;
    try {
      data = new Float32Array(plane * 3);
    } catch (error) {
      inputCanvas.width = inputCanvas.height = 0;
      throw new RangeError(`AI tensor allocation failed: ${error?.message || 'out of memory'}`);
    }
    for (let i = 0, p = 0; i < plane; i++, p += 4) {
      data[i] = pixels[p] / 255;
      data[plane + i] = pixels[p + 1] / 255;
      data[plane * 2 + i] = pixels[p + 2] / 255;
    }
    inputCanvas.width = inputCanvas.height = 0;
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

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

    const outputCanvas = el('canvas', { width: outW, height: outH });
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) throw new RangeError('AI output canvas allocation failed.');
    const imageData = outputCtx.createImageData(outW, outH);
    const outPlane = outW * outH;
    let maxProbe = 0;
    const probeStep = Math.max(1, Math.floor(outPlane / 1024));
    for (let i = 0; i < outPlane; i += probeStep) {
      maxProbe = Math.max(maxProbe, Math.abs(output.data[i]), Math.abs(output.data[outPlane + i]), Math.abs(output.data[outPlane * 2 + i]));
    }
    const multiplier = maxProbe > 2 ? 1 : 255;
    for (let i = 0, p = 0; i < outPlane; i++, p += 4) {
      imageData.data[p] = clampByte(output.data[i] * multiplier);
      imageData.data[p + 1] = clampByte(output.data[outPlane + i] * multiplier);
      imageData.data[p + 2] = clampByte(output.data[outPlane * 2 + i] * multiplier);
      imageData.data[p + 3] = 255;
    }
    outputCtx.putImageData(imageData, 0, 0);
    return outputCanvas;
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

async function detectDeviceCapabilities() {
  const isMobile = mobile();
  const baseline = DEFAULT_LIMITS[isMobile ? 'mobile' : 'desktop'];
  const caps = {
    isMobile,
    webgpu: false,
    wasm: typeof WebAssembly !== 'undefined',
    workers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    createImageBitmap: typeof createImageBitmap === 'function',
    maxTextureDimension2D: null,
    maxPixels: baseline.maxPixels,
    maxSide: baseline.maxSide,
    maxFileMB: baseline.maxFileMB
  };

  if (navigator.gpu?.requestAdapter) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        caps.webgpu = true;
        const textureLimit = Number(adapter.limits?.maxTextureDimension2D);
        if (Number.isFinite(textureLimit) && textureLimit > 0) {
          caps.maxTextureDimension2D = textureLimit;
          caps.maxSide = Math.min(caps.maxSide, textureLimit);
        }
      }
    } catch {
      caps.webgpu = false;
    }
  }

  return Object.freeze(caps);
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
  const base = `${image.width.toLocaleString()} × ${image.height.toLocaleString()} · ${format(mp, 2)} MP · ${format(file.size / MB, 2)} MB · ${caps.webgpu ? 'WebGPU available' : caps.wasm ? 'WASM AI available' : 'standard fallback only'}`;
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
  const plan = aiInferenceDimensions(image.width, image.height, targetWidth, targetHeight, nativeScale, { isMobile: !!caps?.isMobile });
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

  const caps = await detectDeviceCapabilities();
  const loader = new EnhancerModelLoader();
  const aiEngine = new OnnxSuperResolutionEngine(loader, caps);
  const fallbackEngine = new BrowserResampleEngine();
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
    field('enhancer-content', 'Content mode', 'select', 'auto', {
      options: contentRouteOptions()
    }),
    field('enhancer-restoration', 'Restoration profile', 'select', 'auto', {
      options: [
        ['auto', 'Auto — follow route/source'],
        ['fidelity', 'Fidelity — preserve source'],
        ['balanced', 'Balanced'],
        ['recovery', 'Recovery — stronger reconstruction']
      ]
    }),
    field('enhancer-sharpen', 'Sharpening', 'select', 'auto', {
      options: [
        ['auto', 'Auto — follow route/source'],
        ['off', 'Off'],
        ['low', 'Low'],
        ['medium', 'Medium']
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

  notice(root, 'AI super-resolution runs locally in your browser. The pinned ONNX runtime and Real-ESRGAN model are downloaded from jsDelivr; image pixels are not uploaded. Auto content routing currently uses verified source-quality signals, not unverified semantic classification. Portrait, Text/Logo, Illustration and Old Photo are manual overrides until dedicated detectors/models pass their gates. Text/Logo deliberately uses standard enlargement to reduce character hallucination risk. Edge-aware sharpening runs after AI restoration and is capped to reduce halos and sharpened noise. Memory-pressure failures retry AI with smaller tiles before falling back.');

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
    if (image.width * image.height > SOURCE_PIXEL_LIMIT) {
      image.close?.();
      image = null;
      throw new Error('Use an image below 60 million pixels.');
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
      $('#enhancer-mode-help', root).textContent = 'Enhance improves quality at the original pixel dimensions. Choose restoration and sharpening options below.';
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
    const scale = taskMode === 'enhance' ? 1 : Number(read('enhancer-scale'));
    const requestedContent = taskMode === 'enhance' ? read('enhancer-content') : 'auto';
    const requestedRestoration = taskMode === 'enhance' ? read('enhancer-restoration') : 'auto';
    const requestedSharpen = taskMode === 'enhance' ? read('enhancer-sharpen') : 'auto';
    const contentRoute = resolveContentRoute(requestedContent, analysis, scale, caps);
    const routeControls = resolveRouteControls(contentRoute, requestedRestoration, requestedSharpen);
    const restoration = resolveRestorationProfile(routeControls.restoration, analysis, scale);
    const sharpening = resolveSharpening(routeControls.sharpen, analysis, restoration);
    let result = null;
    let temporaryInput = null;
    let temporaryAiInput = null;
    let sharpened = { applied: false, label: sharpening.label };
    setProcessing(true);
    try {
      const { width, height } = safeOutputFor(image, scale, caps);

      if (contentRoute.engine === 'standard') {
        status(`Preparing ${contentRoute.label} fidelity path…`);
        result = await fallbackEngine.process({ image, width, height, signal, onProgress: message => status(message) });
        if (taskMode === 'enhance') {
          await applyLocalEnhancement(result.canvas, analysis, signal, message => status(message));
          sharpened = await applyIntelligentSharpen(result.canvas, sharpening, signal, message => status(message));
          result.canvas = sharpened.canvas;
        }
        const blob = await canvasBlob(result.canvas, 'image/png', 1);
        output(blob, safeName(file.name, taskMode === 'enhance' ? '-enhanced' : `-fidelity-${scale}x`, 'png'));
        status(taskMode === 'enhance'
          ? `${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · ${contentRoute.label} · Local quality enhancement · original dimensions preserved. ${contentRoute.disclosure}`
          : `${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · ${contentRoute.label} · Standard high-quality enlargement. AI deliberately not used. ${contentRoute.disclosure}`);
        return;
      }

      if (!caps.wasm) throw new Error('WebAssembly is unavailable in this browser.');
      if (hasTransparency) throw new Error('AI transparency-safe reconstruction is not verified yet.');

      status(`Preparing ${contentRoute.label} · ${restoration.label.toLowerCase()} restoration…`);
      const aiPrepared = await prepareAiInferenceInput(image, width, height, aiEngine.nativeScale, signal, caps);
      temporaryAiInput = aiPrepared.temporary;
      const prepared = await prepareRestorationInput(aiPrepared.image, restoration, signal);
      temporaryInput = prepared.temporary;
      if (temporaryAiInput && temporaryInput) {
        temporaryAiInput.width = temporaryAiInput.height = 0;
        temporaryAiInput = null;
      }
      status(`AI working size ${prepared.image.width.toLocaleString()} × ${prepared.image.height.toLocaleString()}…`);
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
      if (taskMode === 'enhance') {
        await applyLocalEnhancement(result.canvas, analysis, signal, message => status(message));
      }
      sharpened = await applyIntelligentSharpen(result.canvas, sharpening, signal, message => status(message));
      result.canvas = sharpened.canvas;

      status('Encoding AI result…');
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, scale === 1 ? '-enhanced' : `-upscaled-${scale}x`, 'png'));
      const sharpenLabel = sharpened.applied ? sharpened.label : sharpened.label === 'Off' ? 'Off' : sharpened.label;
      const retryLabel = result.retryCount ? ` · memory retry ×${result.retryCount} · ${result.tileCore}px tiles` : '';
      const tileLabel = `${result.tileCount} ${result.tileCount === 1 ? 'tile' : 'tiles'}`;
      status(`${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · ${contentRoute.label} · AI super-resolution · ${tileLabel} · AI input ${result.inferenceWidth.toLocaleString()} × ${result.inferenceHeight.toLocaleString()}${retryLabel} · ${result.backend} · ${restoration.label} profile · Sharpen ${sharpenLabel}. ${restoration.disclosure} ${contentRoute.disclosure}`);
    } catch (error) {
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryAiInput = null;
      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
      temporaryInput = null;
      if (error?.name === 'AbortError' || signal.aborted) {
        status('Processing cancelled.');
        return;
      }
      console.warn('AI enhancement unavailable; using truthful browser fallback.', error);
      try {
        const { width, height } = safeOutputFor(image, scale, caps);
        result = await fallbackEngine.process({ image, width, height, signal, onProgress: message => status(message) });

        if (taskMode === 'enhance') {
          status(`AI unavailable (${error.message}). Applying local quality enhancement instead…`);
          await applyLocalEnhancement(result.canvas, analysis, signal, message => status(message));
          sharpened = await applyIntelligentSharpen(result.canvas, sharpening, signal, message => status(message));
          result.canvas = sharpened.canvas;
          const blob = await canvasBlob(result.canvas, 'image/png', 1);
          output(blob, safeName(file.name, '-enhanced-local', 'png'));
          status(`${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · Local enhancement fallback · original dimensions preserved · AI model was unavailable, but the result is not a same-pixel redraw.`);
        } else {
          status(`AI unavailable (${error.message}). Using standard high-quality enlargement…`);
          const blob = await canvasBlob(result.canvas, 'image/png', 1);
          output(blob, safeName(file.name, `-enlarged-${scale}x`, 'png'));
          status(`${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · ${contentRoute.label} · Standard high-quality enlargement. AI enhancement was not used.`);
        }
      } catch (fallbackError) {
        console.error(fallbackError);
        status(fallbackError?.message || 'Image processing failed.', true);
      }
    } finally {
      temporaryAiInput && (temporaryAiInput.width = temporaryAiInput.height = 0);
      temporaryInput && (temporaryInput.width = temporaryInput.height = 0);
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
    fallbackEngine.dispose();
  }, { once: true });
}
