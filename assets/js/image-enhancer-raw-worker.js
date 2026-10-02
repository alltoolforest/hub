const RUNTIME_VERSION = 'rawconvert-wasm 0.1.1';
const CORE_URL = new URL('../vendor/rawconvert/rawconvert-core.js', self.location.href).href;
const WASM_URL = new URL('../vendor/rawconvert/rawconvert-core.wasm', self.location.href).href;

let modulePromise = null;
let processor = null;

function getFactory() {
  if (typeof self.createRawConvertCore === 'function') return self.createRawConvertCore;
  importScripts(CORE_URL);
  if (typeof self.createRawConvertCore !== 'function') {
    throw new Error('Pinned RAW decoder core did not initialize.');
  }
  return self.createRawConvertCore;
}

async function getProcessor() {
  if (processor) return processor;
  if (!modulePromise) {
    const factory = getFactory();
    modulePromise = factory({
      locateFile: path => path.endsWith('.wasm') ? WASM_URL : path,
      print: () => {},
      printErr: message => {
        if (message && !/warning/i.test(String(message))) console.warn(message);
      }
    });
  }
  const module = await modulePromise;
  processor = new module.RawProcessor();
  return { module, processor };
}

function extensionOf(filename) {
  return String(filename || 'photo.raw').split('.').pop()?.toLowerCase() || 'raw';
}

function loadRaw(module, activeProcessor, buffer, filename) {
  const ext = extensionOf(filename);
  const path = `/tmp/input.${ext}`;
  try {
    module.FS.writeFile(path, new Uint8Array(buffer));
    const ok = activeProcessor.loadFromFile(path);
    if (!ok) throw new Error(activeProcessor.getLastError() || 'Failed to load RAW file.');
    return activeProcessor.getMetadata();
  } finally {
    try { module.FS.unlink(path); } catch {}
  }
}

function processRaw(module, activeProcessor) {
  const options = {
    colorSpace: 1,
    interpolation: 3,
    outputBps: 8,
    halfSize: false,
    autoWhiteBalance: false,
    cameraWhiteBalance: true,
    brightness: 1,
    highlightMode: 2,
    noiseReduction: 0,
    medianPasses: 0
  };
  const ok = activeProcessor.process(options);
  if (!ok) throw new Error(activeProcessor.getLastError() || 'Failed to develop RAW photo.');

  const path = '/tmp/pixels.bin';
  const exported = activeProcessor.exportRawPixels(path);
  if (!exported) throw new Error(activeProcessor.getLastError() || 'Failed to export RAW pixels.');
  try {
    const rawData = module.FS.readFile(path);
    const view = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
    const width = view.getUint32(0, true);
    const height = view.getUint32(4, true);
    const bits = view.getUint16(8, true);
    const colors = view.getUint8(10);
    if (bits !== 8) throw new Error(`RAW decoder returned unsupported ${bits}-bit pixels.`);
    const data = new Uint8Array(rawData.slice(11));
    return { width, height, colors, data };
  } finally {
    try { module.FS.unlink(path); } catch {}
  }
}

function rgbToBitmap(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  const data = image?.data;
  const colors = Number(image?.colors) || 3;
  if (!width || !height || !data?.length) throw new Error('RAW decoder returned an empty image.');
  if (colors < 3) throw new Error('RAW decoder returned fewer than three colour channels.');
  const pixels = width * height;
  if (data.length < pixels * colors) {
    throw new Error(`RAW decoder returned an unexpected pixel layout (${data.length} bytes).`);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('RAW output canvas is unavailable.');
  const rgba = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < pixels; i++, p += 4) {
    const s = i * colors;
    rgba.data[p] = data[s];
    rgba.data[p + 1] = data[s + 1];
    rgba.data[p + 2] = data[s + 2];
    rgba.data[p + 3] = 255;
  }
  ctx.putImageData(rgba, 0, 0);
  return canvas.transferToImageBitmap();
}

self.onmessage = async event => {
  const message = event.data || {};
  const { id, type } = message;
  if (type === 'dispose') {
    try { processor?.delete?.(); } catch {}
    processor = null;
    modulePromise = null;
    return;
  }
  if (type !== 'decode') return;

  try {
    self.postMessage({ id, progress: 'Loading camera RAW decoder…' });
    const active = await getProcessor();
    active.processor.reset?.();

    self.postMessage({ id, progress: 'Reading camera RAW file…' });
    const metadata = loadRaw(active.module, active.processor, message.buffer, message.filename);
    const width = Number(metadata?.width) || 0;
    const height = Number(metadata?.height) || 0;
    const sourcePixels = width * height;
    if (!width || !height) throw new Error('The RAW file did not report valid image dimensions.');
    if (message.maxSourcePixels && sourcePixels > message.maxSourcePixels) {
      throw new Error(`This RAW photo is ${(sourcePixels / 1e6).toFixed(1)} MP. This device can safely develop about ${Math.floor(message.maxSourcePixels / 1e6)} MP at full resolution.`);
    }

    self.postMessage({ id, progress: `Developing RAW photo at ${width.toLocaleString()} × ${height.toLocaleString()}…` });
    const processed = processRaw(active.module, active.processor);

    self.postMessage({ id, progress: 'Preparing RAW pixels…' });
    const bitmap = rgbToBitmap(processed);
    self.postMessage({
      id,
      ok: true,
      bitmap,
      runtime: RUNTIME_VERSION,
      metadata: {
        width,
        height,
        cameraMake: metadata?.cameraMake || '',
        cameraModel: metadata?.cameraModel || ''
      }
    }, [bitmap]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), name: error?.name || 'Error' });
  }
};
