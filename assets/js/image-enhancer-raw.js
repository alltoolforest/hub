const RAW_EXTENSIONS = new Set([
  'cr2','cr3','nef','nrw','arw','srf','sr2','dng','raf','orf','rw2','pef','srw','erf','kdc','dcr','mos','3fr','iiq','rwl','mef','mrw','x3f'
]);

let worker = null;
let sequence = 0;
const pending = new Map();

function extensionOf(file) {
  return String(file?.name || '').split('.').pop()?.toLowerCase() || '';
}

export function isEnhancerRawInput(file) {
  return RAW_EXTENSIONS.has(extensionOf(file));
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./image-enhancer-raw-worker.js', import.meta.url));
  worker.addEventListener('message', event => {
    const message = event.data || {};
    const item = pending.get(message.id);
    if (!item) return;
    if (message.progress) {
      item.onProgress?.(message.progress);
      return;
    }
    pending.delete(message.id);
    if (!message.ok) {
      const error = new Error(message.error || 'RAW decoding failed.');
      error.name = message.name || 'Error';
      item.reject(error);
      return;
    }
    item.resolve(message);
  });
  worker.addEventListener('error', event => {
    const error = new Error(event?.message || 'RAW decoding worker stopped unexpectedly.');
    for (const item of pending.values()) item.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

export async function decodeEnhancerRaw(file, { maxSourcePixels, onProgress } = {}) {
  if (!isEnhancerRawInput(file)) throw new Error('This file is not a supported camera RAW format.');
  const activeWorker = ensureWorker();
  const id = ++sequence;
  onProgress?.('Reading camera RAW file…');
  const buffer = await file.arrayBuffer();

  return new Promise((resolve, reject) => {
    pending.set(id, {
      onProgress,
      resolve: message => resolve(message.bitmap),
      reject
    });
    try {
      activeWorker.postMessage({
        id,
        type: 'decode',
        buffer,
        filename: file.name,
        maxSourcePixels
      }, [buffer]);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

export function disposeEnhancerRawDecoder() {
  if (!worker) return;
  try { worker.postMessage({ type: 'dispose' }); } catch {}
  worker.terminate();
  worker = null;
  for (const item of pending.values()) item.reject(new Error('RAW decoder closed.'));
  pending.clear();
}
