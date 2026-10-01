import {
  $, el, field, read, format, action, notice, setupStatus, status,
  fileInput, bindFile, checkFile, decodeImage, canvasBlob, output,
  downloads, clearOutputs, safeName, mobile
} from './core.js';

const MB = 1024 * 1024;
const SOURCE_PIXEL_LIMIT = 60e6;
const DEFAULT_LIMITS = Object.freeze({
  mobile: { maxPixels: 8e6, maxSide: 8192, maxFileMB: 20 },
  desktop: { maxPixels: 24e6, maxSide: 16384, maxFileMB: 60 }
});

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
    onProgress?.('Preparing high-quality resampling…');
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
    return { canvas, aiUsed: false, engine: this };
  }
}

class EnhancerModelLoader {
  constructor() {
    this.manifest = null;
  }

  async loadManifest(signal) {
    if (this.manifest) return this.manifest;
    const response = await fetch(new URL('../models/image-enhancer/manifest.json', import.meta.url), { signal });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Enhancer model manifest could not be loaded.');
    this.manifest = await response.json();
    return this.manifest;
  }
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

function sourceSummary(file, image, caps) {
  const mp = image.width * image.height / 1e6;
  const alphaLikely = /\.(png|webp)$/i.test(file.name);
  return `${image.width.toLocaleString()} × ${image.height.toLocaleString()} · ${format(mp, 2)} MP · ${format(file.size / MB, 2)} MB${alphaLikely ? ' · transparency preserved when present' : ''} · ${caps.webgpu ? 'WebGPU available' : caps.wasm ? 'WASM-capable browser' : 'browser fallback only'}`;
}

function outputScaleOptions(image, caps) {
  const select = $('#enhancer-scale');
  if (!select || !image) return;
  for (const option of select.options) {
    const scale = Number(option.value);
    try {
      safeOutputFor(image, scale, caps);
      option.disabled = false;
      option.textContent = `${scale}×`;
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

export async function mount(root, slug) {
  if (slug !== 'enhance') throw new Error('Image Enhancer mounted for an unsupported tool.');

  const caps = await detectDeviceCapabilities();
  const modelLoader = new EnhancerModelLoader();
  const engine = new BrowserResampleEngine();
  let image = null;
  let file = null;
  let controller = null;

  const input = fileInput(root, '.jpg,.jpeg,.png,.webp,.heic,.heif', false, 'Open an image');
  const summary = el('p', { class: 'status', id: 'enhancer-source-info', text: 'Choose an image to inspect its safe processing limits.' });
  root.append(summary);

  const preview = el('canvas', { 'aria-label': 'Source image preview', role: 'img' });
  const frame = el('div', { class: 'canvas-frame', hidden: true });
  frame.append(preview);
  root.append(frame);

  const form = el('div', { class: 'fields' });
  form.append(field('enhancer-scale', 'Enlargement', 'select', '2', {
    options: [['2', '2×'], ['3', '3×'], ['4', '4×']]
  }));
  root.append(form);

  notice(root, 'Current verified engine: standard high-quality browser enlargement. It does not reconstruct missing detail and is not presented as AI. The new enhancer architecture is isolated so AI engines can be added without changing frozen image tools.');

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
    image = await decodeImage(file);
    if (image.width * image.height > SOURCE_PIXEL_LIMIT) {
      image.close?.();
      image = null;
      throw new Error('Use an image below 60 million pixels.');
    }
    clearOutputs();
    frame.hidden = false;
    drawSource();
    outputScaleOptions(image, caps);
    summary.textContent = sourceSummary(file, image, caps);
  });

  const actions = el('div', { class: 'actions' });
  actions.append(
    action('Create enlargement', async () => {
      if (!image || !file) throw new Error('Open an image first.');
      clearOutputs();
      controller?.abort();
      controller = new AbortController();
      const scale = Number(read('enhancer-scale'));
      const { width, height } = safeOutputFor(image, scale, caps);
      const result = await engine.process({
        image,
        width,
        height,
        signal: controller.signal,
        onProgress: message => status(message)
      });
      const blob = await canvasBlob(result.canvas, 'image/png', 1);
      output(blob, safeName(file.name, `-enlarged-${scale}x`, 'png'));
      status(`${width.toLocaleString()} × ${height.toLocaleString()} pixels · ${format(blob.size / 1024)} KB · ${result.engine.label}. AI enhancement was not used.`);
      result.canvas.width = result.canvas.height = 0;
    }, true),
    action('Reset', () => {
      controller?.abort();
      controller = null;
      clearOutputs();
      $('#enhancer-scale').value = '2';
      outputScaleOptions(image, caps);
      if (image && file) summary.textContent = sourceSummary(file, image, caps);
      drawSource();
      status('Reset complete.');
    })
  );
  root.append(actions);

  setupStatus(root);
  downloads(root);

  // Model loading is intentionally not invoked until Phase B selects verified, licensed models.
  void modelLoader;

  window.addEventListener('pagehide', () => {
    controller?.abort();
    image?.close?.();
    engine.dispose();
  }, { once: true });
}
