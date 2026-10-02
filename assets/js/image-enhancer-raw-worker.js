const RAWCONVERT_VERSION = '0.1.1';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/rawconvert-wasm@${RAWCONVERT_VERSION}/dist/`;
const MODULE_URL = `https://cdn.jsdelivr.net/npm/rawconvert-wasm@${RAWCONVERT_VERSION}/+esm`;

let RawConvert = null;
let processor = null;

async function getProcessor() {
  if (processor) return processor;
  if (!RawConvert) {
    const mod = await import(MODULE_URL);
    RawConvert = mod.RawConvert || mod.default?.RawConvert || mod.default;
    if (!RawConvert?.init) throw new Error('RAW decoder module loaded without the expected API.');
  }
  processor = await RawConvert.init({
    coreUrl: CDN_BASE + 'rawconvert-core.js',
    wasmUrl: CDN_BASE + 'rawconvert-core.wasm'
  });
  return processor;
}

function rgbToBitmap(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  const data = image?.data;
  if (!width || !height || !data?.length) throw new Error('RAW decoder returned an empty image.');
  const expectedRgb = width * height * 3;
  const expectedRgba = width * height * 4;
  if (data.length !== expectedRgb && data.length !== expectedRgba) {
    throw new Error(`RAW decoder returned an unexpected pixel layout (${data.length} bytes for ${width}×${height}).`);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('RAW output canvas is unavailable.');
  const rgba = ctx.createImageData(width, height);
  if (data.length === expectedRgba) {
    rgba.data.set(data);
  } else {
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      const s = i * 3;
      rgba.data[p] = data[s];
      rgba.data[p + 1] = data[s + 1];
      rgba.data[p + 2] = data[s + 2];
      rgba.data[p + 3] = 255;
    }
  }
  ctx.putImageData(rgba, 0, 0);
  return canvas.transferToImageBitmap();
}

self.onmessage = async event => {
  const message = event.data || {};
  const { id, type } = message;
  if (type === 'dispose') {
    try { processor?.dispose?.(); } catch {}
    processor = null;
    return;
  }
  if (type !== 'decode') return;

  try {
    self.postMessage({ id, progress: 'Loading camera RAW decoder…' });
    const raw = await getProcessor();
    raw.reset?.();
    self.postMessage({ id, progress: 'Reading camera RAW file…' });
    const metadata = await raw.load(message.buffer, message.filename || 'photo.raw');
    const width = Number(metadata?.width) || 0;
    const height = Number(metadata?.height) || 0;
    const sourcePixels = width * height;
    if (!width || !height) throw new Error('The RAW file did not report valid image dimensions.');
    if (message.maxSourcePixels && sourcePixels > message.maxSourcePixels) {
      throw new Error(`This RAW photo is ${(sourcePixels / 1e6).toFixed(1)} MP. This device can safely develop about ${Math.floor(message.maxSourcePixels / 1e6)} MP at full resolution.`);
    }

    self.postMessage({ id, progress: `Developing RAW photo at ${width.toLocaleString()} × ${height.toLocaleString()}…` });
    const processed = await raw.process({
      colorSpace: 'srgb',
      interpolation: 'ahd',
      outputBps: 8,
      halfSize: false,
      autoWhiteBalance: false,
      cameraWhiteBalance: true,
      brightness: 1,
      highlightMode: 2,
      noiseReduction: 0,
      medianPasses: 0
    });

    self.postMessage({ id, progress: 'Preparing RAW pixels…' });
    const bitmap = rgbToBitmap(processed);
    self.postMessage({
      id,
      ok: true,
      bitmap,
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
