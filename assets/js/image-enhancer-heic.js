// Enhancer-only HEIC/HEIF decoder. heic-to 1.5.2 is loaded unmodified from jsDelivr
// only when HEIC/HEIF input needs a fallback decoder. Upstream license: LGPL-3.0.
const DECODER_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.5.2/dist/csp/heic-to.js';
const DECODER_SHA256 = 'c189220a7a1e87559758a48ab4700e55629fb23a4cb57489e1e8970be1b9d018';
const NATIVE_TIMEOUT_MS = 5000;
const DECODER_TIMEOUT_MS = 45000;

let decoderPromise = null;

function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle?.digest) {
    throw new Error('Secure decoder integrity verification is unavailable in this browser.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function imageElementFromBlob(blob, timeoutMs = NATIVE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const objectURL = URL.createObjectURL(blob);
    const image = new Image();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectURL);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Native image decoding timed out.')), timeoutMs);
    image.onload = () => finish(resolve, image);
    image.onerror = () => finish(reject, new Error('Native image decoding failed.'));
    image.src = objectURL;
  });
}

async function decodeBrowserImage(blob, timeoutMs = NATIVE_TIMEOUT_MS) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await withTimeout(
        createImageBitmap(blob),
        timeoutMs,
        'Native image decoding timed out.'
      );
      if (bitmap?.width > 0 && bitmap?.height > 0) return bitmap;
      bitmap?.close?.();
    } catch {
      // Fall through to the image-element decoder.
    }
  }
  return imageElementFromBlob(blob, timeoutMs);
}

async function loadDecoder(onStatus) {
  if (decoderPromise) return decoderPromise;
  decoderPromise = (async () => {
    onStatus?.('Loading HEIC/HEIF decoder…');
    const response = await fetch(DECODER_URL, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`HEIC/HEIF decoder download failed (${response.status}).`);
    const bytes = await response.arrayBuffer();
    onStatus?.('Verifying HEIC/HEIF decoder…');
    const actual = await sha256Hex(bytes);
    if (actual !== DECODER_SHA256) {
      throw new Error('HEIC/HEIF decoder integrity check failed. The downloaded decoder was not used.');
    }

    const source = new TextDecoder().decode(bytes);
    const moduleURL = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const mod = await import(moduleURL);
      if (typeof mod.heicTo !== 'function') throw new Error('HEIC/HEIF decoder loaded without the required API.');
      return mod;
    } finally {
      URL.revokeObjectURL(moduleURL);
    }
  })();

  try {
    return await decoderPromise;
  } catch (error) {
    decoderPromise = null;
    throw error;
  }
}

export function isEnhancerHeicInput(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || /^image\/hei[cf]$/.test(type);
}

export async function decodeEnhancerHeic(file, onStatus) {
  if (!isEnhancerHeicInput(file)) throw new Error('The selected file is not HEIC/HEIF.');

  onStatus?.('Checking native HEIC/HEIF support…');
  try {
    return await decodeBrowserImage(file, NATIVE_TIMEOUT_MS);
  } catch {
    // Most browsers still require a HEIC/HEIF decoder. Continue locally.
  }

  const decoder = await loadDecoder(onStatus);
  onStatus?.('Decoding HEIC/HEIF locally…');
  const converted = await withTimeout(
    Promise.resolve(decoder.heicTo({ blob: file, type: 'image/png', quality: 1 })),
    DECODER_TIMEOUT_MS,
    'HEIC/HEIF decoding took too long. Try a smaller image or convert it to PNG/JPG first.'
  );
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob) || !blob.size) throw new Error('HEIC/HEIF decoder returned an invalid image.');

  const image = await decodeBrowserImage(blob, 15000);
  if (!(image?.width > 0 && image?.height > 0)) {
    image?.close?.();
    throw new Error('Decoded HEIC/HEIF image has invalid dimensions.');
  }
  return image;
}
