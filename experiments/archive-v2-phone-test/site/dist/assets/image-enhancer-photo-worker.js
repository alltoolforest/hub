import { PHOTO_HALO, photoStripRows, photoStatistics, collectPhotoStatistics, makePhotoPlan, enhancePhotoStrip, releasePhotoWorkspace } from './image-enhancer-photo.js';

// One worker per job. The owner terminates it on cancel/error/completion, including
// while native canvas encoding is in progress. No abandoned worker jobs accumulate.
self.onmessage = async ({ data: { bitmap, options } }) => {
  let output, scratch;
  try {
    const { width, height } = bitmap;
    const rows = photoStripRows(width);          // v2: bounded working set for very wide images
    output = new OffscreenCanvas(width, height);
    scratch = new OffscreenCanvas(width, rows + PHOTO_HALO * 2);
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    const out = output.getContext('2d');
    if (!ctx || !out) throw new Error('Photographic processing canvas is unavailable.');
    const stats = photoStatistics({ width, height });   // v2: image size defines the local-exposure grid and detail scale
    const step = Math.max(2, Math.ceil(Math.sqrt(width * height / 90000)));
    function read(top, count) {
      ctx.clearRect(0, 0, width, scratch.height);
      ctx.drawImage(bitmap, 0, top, width, count, 0, 0, width, count);
      return ctx.getImageData(0, 0, width, count).data;
    }
    const t0 = performance.now();
    for (let y = 0; y < height; y += rows) {
      const count = Math.min(rows, height - y);
      collectPhotoStatistics(read(y, count), width, count, stats, step, y);
    }
    const plan = makePhotoPlan(stats, options);
    const t1 = performance.now();
    self.postMessage({ progress: 'Reducing noise and shaping detail at native resolution…' });
    for (let y = 0; y < height; y += rows) {
      const top = Math.max(0, y - PHOTO_HALO);
      const count = Math.min(rows, height - y);
      const bottom = Math.min(height, y + count + PHOTO_HALO);
      const rgba = enhancePhotoStrip(read(top, bottom - top), width, bottom - top, y - top, count, plan, { offsetY: top, faces: options.faces || [] });
      out.putImageData(new ImageData(rgba, width, count), 0, y);
      self.postMessage({ progress: `Enhancing photo · ${Math.round((y + count) / height * 100)}%` });
    }
    const t2 = performance.now();
    bitmap.close();
    releasePhotoWorkspace();
    self.postMessage({ progress: 'Creating enhanced image…' });
    const blob = await output.convertToBlob({ type: 'image/png' });
    self.postMessage({
      blob, width, height,
      diagnostics: {
        noise: plan.noise, chromaNoise: plan.chromaNoise, shadowNoise: plan.shadowNoise, blockStrength: plan.blockStrength,
        shadowGuard: plan.shadowGuard,
        mean: plan.mean, range: plan.range, wb: plan.wb, localExposure: !!plan.local, levelShift: plan.shift,
        msAnalysis: Math.round(t1 - t0), msPixels: Math.round(t2 - t1)
      }
    });
  } catch (error) {
    self.postMessage({ error: error.message || 'Photographic enhancement failed.' });
  } finally {
    releasePhotoWorkspace();
    bitmap.close();
    if (output) output.width = output.height = 0;
    if (scratch) scratch.width = scratch.height = 0;
  }
};
