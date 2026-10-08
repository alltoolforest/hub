import { ExperimentalFaceGuard, ExperimentalModelLoader } from './enhance-unblur-common.js';
import { IdentityPreservingEnhancementEngine } from './enhance-unblur-enhancement-engine.js?v=5';
import { StrictIdentityDeblurEngine } from './enhance-unblur-deblur-engine.js';
import { getProcessingSpec } from './enhance-unblur-specs.js';

const EXPERIMENT_BUILD = 'V5';

const workspace = document.getElementById('workspace');
if (!workspace) throw new Error('Image Enhancer & Unblur workspace was not found.');

const loader = new ExperimentalModelLoader();
const faceGuard = new ExperimentalFaceGuard(loader);
const enhancementEngine = new IdentityPreservingEnhancementEngine(faceGuard);
const deblurEngine = new StrictIdentityDeblurEngine(loader, faceGuard);

let mode = 'enhancement';
let sourceFile = null;
let sourceImage = null;
let sourceUrl = null;
let outputUrl = null;
let abortController = null;
let busy = false;

workspace.innerHTML = `
  <div class="eu-shell">
    <section class="eu-step" aria-labelledby="eu-upload-title">
      <div class="eu-heading"><span class="eu-number">1</span><div><h2 id="eu-upload-title">Choose an image</h2><p>JPG, PNG or WebP. The original image remains the input for every run.</p></div></div>
      <label class="eu-upload" for="eu-file">
        <input id="eu-file" type="file" accept="image/jpeg,image/png,image/webp">
        <strong>Select image</strong><span>No output is chained into another engine.</span>
      </label>
      <div id="eu-source-meta" class="eu-meta" hidden></div>
    </section>

    <section class="eu-step" aria-labelledby="eu-mode-title">
      <div class="eu-heading"><span class="eu-number">2</span><div><h2 id="eu-mode-title">Choose one engine</h2><p>The engines are independent. Only the selected engine runs.</p></div></div>
      <div class="eu-tabs" role="tablist" aria-label="Image processing engine">
        <button type="button" class="eu-tab active" role="tab" aria-selected="true" data-mode="enhancement">Enhance image</button>
        <button type="button" class="eu-tab" role="tab" aria-selected="false" data-mode="deblur">Unblur image</button>
      </div>
      <div id="eu-engine-copy" class="eu-engine-copy"></div>
      <div id="eu-controls" class="eu-controls"></div>
    </section>

    <section class="eu-step" aria-labelledby="eu-preview-title">
      <div class="eu-heading"><span class="eu-number">3</span><div><h2 id="eu-preview-title">Process and compare</h2><p>Identity preservation and faithful photographic output take priority over aggressive processing.</p></div></div>
      <div class="eu-actions">
        <button id="eu-process" class="primary" type="button" disabled>Process image</button>
        <button id="eu-cancel" type="button" hidden>Cancel</button>
        <button id="eu-reset" type="button" disabled>Reset</button>
      </div>
      <p id="eu-status" class="eu-status" role="status" aria-live="polite">Choose an image to begin.</p>
      <div class="eu-previews">
        <figure><figcaption>Original</figcaption><div class="eu-frame"><img id="eu-before" alt="Original selected image preview"></div></figure>
        <figure><figcaption>Result</figcaption><div class="eu-frame"><img id="eu-after" alt="Processed image preview"><span id="eu-empty">Process the image to preview the result.</span></div></figure>
      </div>
      <div id="eu-result-meta" class="eu-meta" hidden></div>
      <a id="eu-download" class="button eu-download" hidden>Download result</a>
    </section>
  </div>`;

const fileInput = document.getElementById('eu-file');
const sourceMeta = document.getElementById('eu-source-meta');
const engineCopy = document.getElementById('eu-engine-copy');
const controls = document.getElementById('eu-controls');
const processButton = document.getElementById('eu-process');
const cancelButton = document.getElementById('eu-cancel');
const resetButton = document.getElementById('eu-reset');
const statusNode = document.getElementById('eu-status');
const beforeImage = document.getElementById('eu-before');
const afterImage = document.getElementById('eu-after');
const emptyResult = document.getElementById('eu-empty');
const resultMeta = document.getElementById('eu-result-meta');
const downloadLink = document.getElementById('eu-download');

function setStatus(message, kind = '') {
  statusNode.textContent = message;
  statusNode.className = `eu-status ${kind}`.trim();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeBaseName(name) {
  return String(name || 'image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
}

function renderEngine() {
  const spec = getProcessingSpec(mode);
  document.querySelectorAll('.eu-tab').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (mode === 'enhancement') {
    engineCopy.innerHTML = `<strong>${spec.title}</strong><p>Subtle same-photo retouching only: tonal/color cleanup, restrained noise handling and micro-contrast. No face generation, reconstruction or upscaling.</p>`;
    controls.innerHTML = `<label>Retouch amount<select id="eu-retouch"><option value="gentle">Gentle</option><option value="balanced" selected>Balanced</option></select></label><p class="eu-lock">Face identity and geometry are locked by design.</p>`;
  } else {
    engineCopy.innerHTML = `<strong>${spec.title}</strong><p>Dedicated blur reduction only. Facial regions are deliberately processed more conservatively and may remain slightly soft when stronger deblurring could change identity.</p>`;
    controls.innerHTML = `<label>Blur reduction<select id="eu-strength"><option value="gentle">Gentle</option><option value="balanced" selected>Balanced</option><option value="maximum-safe">Maximum safe</option></select></label><p class="eu-lock">Identity guard is mandatory and cannot be disabled.</p>`;
  }
  clearResult();
}

async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('This browser could not decode the selected image.'));
      img.src = url;
    });
    return { image: img, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function validateFile(file) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(file.type)) throw new Error('Use a JPG, PNG or WebP image for this experimental build.');
  if (file.size > 30 * 1024 * 1024) throw new Error('Choose an image smaller than 30 MB.');
}

function validateDimensions(image) {
  const mobile = matchMedia?.('(max-width: 760px)')?.matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const pixels = image.width * image.height;
  const limit = mobile ? 10_000_000 : 16_000_000;
  if (pixels > limit) {
    throw new Error(`This experimental build limits ${mobile ? 'mobile' : 'desktop'} processing to ${Math.round(limit / 1_000_000)} megapixels for reliability.`);
  }
}

function clearResult() {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  afterImage.removeAttribute('src');
  emptyResult.hidden = false;
  resultMeta.hidden = true;
  resultMeta.textContent = '';
  downloadLink.hidden = true;
  downloadLink.removeAttribute('href');
}

function canvasBlob(canvas, type) {
  const preferred = type === 'image/png' ? 'image/png' : type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const quality = preferred === 'image/png' ? undefined : 0.94;
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The processed image could not be encoded.')), preferred, quality);
  });
}

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

async function selectFile(file) {
  if (busy) return;
  try {
    validateFile(file);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
    sourceImage = null;
    sourceFile = null;
    clearResult();
    setStatus('Reading image…');
    const decoded = await decode(file);
    validateDimensions(decoded.image);
    sourceFile = file;
    sourceImage = decoded.image;
    sourceUrl = decoded.url;
    beforeImage.src = sourceUrl;
    sourceMeta.hidden = false;
    sourceMeta.textContent = `${file.name} · ${decoded.image.width} × ${decoded.image.height} · ${formatBytes(file.size)}`;
    processButton.disabled = false;
    resetButton.disabled = false;
    setStatus(`Ready · ${EXPERIMENT_BUILD}. Choose the engine and processing level.`);
  } catch (error) {
    fileInput.value = '';
    processButton.disabled = true;
    resetButton.disabled = !sourceFile;
    setStatus(error.message || 'The image could not be opened.', 'error');
  }
}

async function processImage() {
  if (!sourceImage || !sourceFile || busy) return;
  busy = true;
  clearResult();
  processButton.disabled = true;
  cancelButton.hidden = false;
  fileInput.disabled = true;
  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    const spec = getProcessingSpec(mode);
    let result;
    if (mode === 'enhancement') {
      const retouch = document.getElementById('eu-retouch')?.value || 'balanced';
      result = await enhancementEngine.process(sourceImage, {
        retouch, signal, processingSpec: spec.sourceOfTruth, onProgress: message => setStatus(message)
      });
    } else {
      const strength = document.getElementById('eu-strength')?.value || 'balanced';
      result = await deblurEngine.process(sourceImage, {
        strength, signal, processingSpec: spec.sourceOfTruth, onProgress: message => setStatus(message)
      });
    }

    if (result.canvas.width !== sourceImage.width || result.canvas.height !== sourceImage.height) {
      result.canvas.width = result.canvas.height = 0;
      throw new Error('Safety check stopped output because the engine changed image dimensions.');
    }

    setStatus('Encoding the faithful same-resolution result…');
    const blob = await canvasBlob(result.canvas, sourceFile.type);
    result.canvas.width = result.canvas.height = 0;
    outputUrl = URL.createObjectURL(blob);
    afterImage.src = outputUrl;
    emptyResult.hidden = true;
    const label = mode === 'enhancement' ? 'Enhanced' : 'Unblurred';
    resultMeta.hidden = false;
    resultMeta.textContent = `${label} · ${sourceImage.width} × ${sourceImage.height} · ${formatBytes(blob.size)} · ${result.facesProtected || 0} detected face${result.facesProtected === 1 ? '' : 's'} protected${result.identityGuardAvailable ? '' : ' · conservative fallback guard used'}`;
    downloadLink.hidden = false;
    downloadLink.href = outputUrl;
    downloadLink.download = `${safeBaseName(sourceFile.name)}-${mode === 'enhancement' ? 'enhanced' : 'unblurred'}.${extensionFor(blob.type || sourceFile.type)}`;
    setStatus('Processing complete. Compare the result with the original before downloading.', 'success');
  } catch (error) {
    if (error?.name === 'AbortError') setStatus('Processing cancelled. The original image is unchanged.');
    else setStatus(error.message || 'Processing failed safely without changing the original.', 'error');
  } finally {
    busy = false;
    abortController = null;
    processButton.disabled = !sourceImage;
    cancelButton.hidden = true;
    fileInput.disabled = false;
  }
}

function reset() {
  abortController?.abort();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = null;
  sourceImage = null;
  sourceFile = null;
  fileInput.value = '';
  beforeImage.removeAttribute('src');
  sourceMeta.hidden = true;
  sourceMeta.textContent = '';
  clearResult();
  processButton.disabled = true;
  resetButton.disabled = true;
  setStatus('Choose an image to begin.');
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) selectFile(file);
});

document.querySelectorAll('.eu-tab').forEach(button => button.addEventListener('click', () => {
  if (busy) return;
  mode = button.dataset.mode === 'deblur' ? 'deblur' : 'enhancement';
  renderEngine();
  if (sourceImage) setStatus('Engine changed. Processing will start again from the original image.');
}));

processButton.addEventListener('click', processImage);
cancelButton.addEventListener('click', () => abortController?.abort());
resetButton.addEventListener('click', reset);
window.addEventListener('beforeunload', () => {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  abortController?.abort();
  deblurEngine.dispose();
  faceGuard.dispose();
});

renderEngine();
