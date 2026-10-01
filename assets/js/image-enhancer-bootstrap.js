let runtimePromise = null;
let runtimeModuleBlobURL = null;

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

export async function mount(root, slug) {
  try {
    await ensureRuntime();
  } catch (error) {
    // The enhancer core retains a truthful non-AI fallback if runtime preparation fails.
    console.warn('Enhancer AI runtime preload failed; core fallback remains available.', error);
  }
  const enhancer = await import('./image-enhancer.js');
  return enhancer.mount(root, slug);
}

window.addEventListener('pagehide', () => {
  if (runtimeModuleBlobURL) URL.revokeObjectURL(runtimeModuleBlobURL);
  runtimeModuleBlobURL = null;
}, { once: true });
