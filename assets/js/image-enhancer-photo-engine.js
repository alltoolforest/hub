// Browser adapter for the dedicated photographic pipeline. A failure is reported;
// it never silently substitutes SR, deblur, or the former global-filter fallback.
export async function enhancePhotograph(image, options, signal, onProgress) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    throw new Error('Enhance Quality requires a browser with background canvas processing. The original is unchanged.');
  }
  const bitmap = await createImageBitmap(image);
  if (signal?.aborted) { bitmap.close(); throw new DOMException('Processing cancelled.', 'AbortError'); }
  let worker;
  try { worker = new Worker(new URL('./image-enhancer-photo-worker.js', import.meta.url), { type: 'module' }); }
  catch (error) { bitmap.close(); throw error; }
  return new Promise((resolve, reject) => {
    const finish = (error, result) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Processing cancelled.', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress) { onProgress?.(data.progress); return; }
      if (data.error) { finish(new Error(data.error)); return; }
      if (!(data.blob instanceof Blob) || data.width !== image.width || data.height !== image.height) {
        finish(new Error('Enhancement did not produce a valid original-size image.')); return;
      }
      finish(null, data);
    };
    worker.onerror = event => finish(new Error(event.message || 'Photographic enhancement worker failed.'));
    worker.onmessageerror = () => finish(new Error('Photographic enhancement response could not be read.'));
    try { worker.postMessage({ bitmap, options }, [bitmap]); }
    catch (error) { bitmap.close(); finish(error); }
  });
}
