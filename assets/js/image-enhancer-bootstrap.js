import { $, el, field, status } from './core.js';
import { resolveOutputTarget, outputSizingOptions } from './image-enhancer-output.js';
import { mountInspector } from './image-enhancer-inspector.js';

let runtimePromise = null;
let runtimeModuleBlobURL = null;

const OUTPUT_LIMITS = Object.freeze({
  mobile: Object.freeze({ maxPixels: 8e6, maxSide: 8192 }),
  desktop: Object.freeze({ maxPixels: 24e6, maxSide: 16384 })
});

async function loadScriptFromFetchedSource(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`AI runtime download failed (${response.status}).`);
  const source = await response.text();
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
}

async function ensureRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const manifestURL = new URL('../models/image-enhancer/manifest.json', import.meta.url);
    const manifestResponse = await fetch(manifestURL, { cache: 'no-cache' });
    if (!manifestResponse.ok) throw new Error('Enhancer runtime manifest could not be loaded.');
    const manifest = await manifestResponse.json();
    const config = manifest.runtime;

    if (!window.ort?.InferenceSession) await loadScriptFromFetchedSource(config.bundle);
    const ort = window.ort;
    if (!ort?.InferenceSession || !ort?.Tensor) throw new Error('AI runtime loaded without the required ONNX APIs.');

    // The site CSP permits remote data fetches but intentionally blocks remote script execution.
    // Fetch ORT's secondary MJS as data and execute that exact pinned module from a blob URL.
    if (!runtimeModuleBlobURL) {
      const moduleResponse = await fetch(config.wasmModule, { cache: 'force-cache' });
      if (!moduleResponse.ok) throw new Error(`AI runtime module download failed (${moduleResponse.status}).`);
      const moduleSource = await moduleResponse.text();
      runtimeModuleBlobURL = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
    }

    ort.env.logLevel = 'warning';
    ort.env.wasm.wasmPaths = {
      mjs: runtimeModuleBlobURL,
      wasm: config.wasmBinary
    };
    ort.env.wasm.initTimeout = 45000;
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated
      ? Math.min(2, Math.max(1, navigator.hardwareConcurrency || 1))
      : 1;
    return ort;
  })();
  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

function currentPlannerCaps() {
  const isMobile = globalThis.matchMedia?.('(max-width:700px)').matches ?? false;
  return OUTPUT_LIMITS[isMobile ? 'mobile' : 'desktop'];
}

function sourceDimensions(summary) {
  const match = (summary?.textContent || '').match(/([\d,]+)\s*×\s*([\d,]+)/);
  if (!match) return null;
  const width = Number(match[1].replaceAll(',', ''));
  const height = Number(match[2].replaceAll(',', ''));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function mountOutputPlanner(root) {
  const form = root.querySelector('.fields');
  const scaleSelect = $('#enhancer-scale', root);
  const sourceInfo = $('#enhancer-source-info', root);
  if (!form || !scaleSelect || !sourceInfo || $('#enhancer-output-mode', root)) return;

  const modeWrap = field('enhancer-output-mode', 'Output size', 'select', 'scale', {
    options: outputSizingOptions(),
    hint: 'Choose a multiplier, exact pixel target, longest edge, or print-size planner.'
  });
  const widthWrap = field('enhancer-target-width', 'Target width (px)', 'number', '', { min: '1', step: '1' });
  const heightWrap = field('enhancer-target-height', 'Target height (px)', 'number', '', { min: '1', step: '1' });
  const longestWrap = field('enhancer-longest-edge', 'Longest edge (px)', 'number', '', { min: '1', step: '1' });
  const printWidthWrap = field('enhancer-print-width', 'Print width', 'number', '', { min: '0.01', step: '0.01' });
  const printHeightWrap = field('enhancer-print-height', 'Print height', 'number', '', { min: '0.01', step: '0.01' });
  const printUnitWrap = field('enhancer-print-unit', 'Print unit', 'select', 'in', {
    options: [['in', 'Inches'], ['cm', 'Centimetres']]
  });
  const ppiWrap = field('enhancer-ppi', 'Target PPI', 'number', '300', {
    min: '36', max: '1200', step: '1',
    hint: 'PPI calculates required pixels; it does not invent detail or merely rewrite metadata.'
  });

  form.prepend(modeWrap);
  const scaleWrap = scaleSelect.closest('.field');
  scaleWrap?.after(widthWrap, heightWrap, longestWrap, printWidthWrap, printHeightWrap, printUnitWrap, ppiWrap);

  const plannerInfo = el('p', {
    class: 'status',
    id: 'enhancer-output-info',
    text: 'Open an image to calculate the planned output.'
  });
  form.after(plannerInfo);

  const modeSelect = $('#enhancer-output-mode', root);
  const plannerControls = [
    modeSelect,
    $('#enhancer-target-width', root), $('#enhancer-target-height', root),
    $('#enhancer-longest-edge', root), $('#enhancer-print-width', root),
    $('#enhancer-print-height', root), $('#enhancer-print-unit', root), $('#enhancer-ppi', root)
  ].filter(Boolean);

  let source = null;
  let lastScale = scaleSelect.value || '2';
  let customOption = null;

  function refreshSource() {
    source = sourceDimensions(sourceInfo);
    return source;
  }

  function syncVisibility() {
    const mode = modeSelect.value;
    if (scaleWrap) scaleWrap.hidden = mode !== 'scale';
    widthWrap.hidden = heightWrap.hidden = mode !== 'dimensions';
    longestWrap.hidden = mode !== 'longest-edge';
    const printHidden = mode !== 'print';
    printWidthWrap.hidden = printHidden;
    printHeightWrap.hidden = printHidden;
    printUnitWrap.hidden = printHidden;
    ppiWrap.hidden = printHidden;

    if (mode === 'scale' && customOption && scaleSelect.value === customOption.value) {
      scaleSelect.value = lastScale;
    }
  }

  function resolvePlannerTarget() {
    refreshSource();
    if (!source) throw new Error('Open an image first.');
    const mode = modeSelect.value;
    const caps = currentPlannerCaps();

    if (mode === 'scale') {
      if (customOption && scaleSelect.value === customOption.value) scaleSelect.value = lastScale;
      return resolveOutputTarget({ image: source, caps, mode, scale: scaleSelect.value });
    }
    if (mode === 'dimensions') {
      return resolveOutputTarget({
        image: source, caps, mode,
        width: $('#enhancer-target-width', root).value,
        height: $('#enhancer-target-height', root).value,
        lockAspect: true
      });
    }
    if (mode === 'longest-edge') {
      return resolveOutputTarget({ image: source, caps, mode, longestEdge: $('#enhancer-longest-edge', root).value });
    }
    return resolveOutputTarget({
      image: source, caps, mode: 'print',
      printWidth: $('#enhancer-print-width', root).value,
      printHeight: $('#enhancer-print-height', root).value,
      printUnit: $('#enhancer-print-unit', root).value,
      ppi: $('#enhancer-ppi', root).value
    });
  }

  function applyEquivalentScale(target) {
    if (modeSelect.value === 'scale') return;
    const scale = target.width / source.width;
    if (!Number.isFinite(scale) || scale < 0.999) throw new Error('The requested output cannot be mapped safely to the enhancer pipeline.');
    if (!customOption) {
      customOption = el('option', { 'data-output-planner-custom': 'true', text: 'Custom target' });
      scaleSelect.append(customOption);
    }
    customOption.disabled = false;
    customOption.value = String(scale);
    customOption.textContent = `${scale.toLocaleString(undefined, { maximumFractionDigits: 4 })}× custom target`;
    scaleSelect.value = customOption.value;
  }

  function updatePlanner(strict = false) {
    refreshSource();
    if (!source) {
      plannerInfo.classList.remove('error');
      plannerInfo.textContent = 'Open an image to calculate the planned output.';
      return null;
    }
    try {
      const target = resolvePlannerTarget();
      applyEquivalentScale(target);
      plannerInfo.classList.remove('error');
      const printNote = target.printNote ? ` ${target.printNote}` : '';
      plannerInfo.textContent = `Planned output: ${target.width.toLocaleString()} × ${target.height.toLocaleString()} px · ${target.outputMP.toLocaleString(undefined, { maximumFractionDigits: 2 })} MP · ${target.detail}.${printNote}`;
      return target;
    } catch (error) {
      plannerInfo.classList.add('error');
      plannerInfo.textContent = error?.message || 'Choose a valid output size.';
      if (strict) throw error;
      return null;
    }
  }

  scaleSelect.addEventListener('change', () => {
    if (modeSelect.value === 'scale' && (!customOption || scaleSelect.value !== customOption.value)) {
      lastScale = scaleSelect.value;
    }
    updatePlanner(false);
  });

  modeSelect.addEventListener('change', () => {
    syncVisibility();
    updatePlanner(false);
  });
  for (const control of plannerControls.slice(1)) {
    control.addEventListener('input', () => updatePlanner(false));
    control.addEventListener('change', () => updatePlanner(false));
  }

  const summaryObserver = new MutationObserver(() => updatePlanner(false));
  summaryObserver.observe(sourceInfo, { childList: true, subtree: true, characterData: true });

  const enhanceButton = [...root.querySelectorAll('button')].find(button => button.textContent === 'Enhance image');
  if (enhanceButton) {
    enhanceButton.addEventListener('click', event => {
      try {
        updatePlanner(true);
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        status(error?.message || 'Choose a valid output size.', true);
      }
    }, true);

    const disabledObserver = new MutationObserver(() => {
      for (const control of plannerControls) control.disabled = enhanceButton.disabled;
    });
    disabledObserver.observe(enhanceButton, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('pagehide', () => disabledObserver.disconnect(), { once: true });
  }

  const resetButton = [...root.querySelectorAll('button')].find(button => button.textContent === 'Reset');
  resetButton?.addEventListener('click', () => {
    modeSelect.value = 'scale';
    lastScale = '2';
    customOption?.remove();
    customOption = null;
    scaleSelect.value = '2';
    $('#enhancer-target-width', root).value = '';
    $('#enhancer-target-height', root).value = '';
    $('#enhancer-longest-edge', root).value = '';
    $('#enhancer-print-width', root).value = '';
    $('#enhancer-print-height', root).value = '';
    $('#enhancer-print-unit', root).value = 'in';
    $('#enhancer-ppi', root).value = '300';
    syncVisibility();
    updatePlanner(false);
  });

  syncVisibility();
  updatePlanner(false);
  window.addEventListener('pagehide', () => summaryObserver.disconnect(), { once: true });
}

export async function mount(root, slug) {
  try {
    await ensureRuntime();
  } catch (error) {
    // The enhancer core retains a truthful non-AI fallback if runtime preparation fails.
    console.warn('Enhancer AI runtime preload failed; core fallback remains available.', error);
  }
  const enhancer = await import('./image-enhancer.js');
  const result = await enhancer.mount(root, slug);
  mountOutputPlanner(root);
  mountInspector(root);
  return result;
}

window.addEventListener('pagehide', () => {
  if (runtimeModuleBlobURL) URL.revokeObjectURL(runtimeModuleBlobURL);
  runtimeModuleBlobURL = null;
}, { once: true });
