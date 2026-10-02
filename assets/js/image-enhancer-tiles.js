export function aiInferenceDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight, nativeScale = 4) {
  const values = [sourceWidth, sourceHeight, targetWidth, targetHeight, nativeScale].map(Number);
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('AI inference dimensions require positive finite sizes.');
  }
  const [, , outWidth, outHeight, scale] = values;
  return Object.freeze({
    width: Math.max(1, Math.ceil(outWidth / scale)),
    height: Math.max(1, Math.ceil(outHeight / scale))
  });
}

export function tileCorePlan(caps) {
  const candidates = caps?.webgpu
    ? [160, 112, 80, 56]
    : caps?.isMobile
      ? [96, 72, 56, 48]
      : [128, 96, 72, 48];
  return Object.freeze([...new Set(candidates.filter(value => Number.isFinite(value) && value >= 48))]);
}

export function estimateTileCount(width, height, tileCore) {
  const w = Number(width);
  const h = Number(height);
  const core = Number(tileCore);
  if (![w, h, core].every(value => Number.isFinite(value) && value > 0)) return Infinity;
  return Math.ceil(w / core) * Math.ceil(h / core);
}

export function isMemoryPressureError(error) {
  if (!error) return false;
  if (error instanceof RangeError) return true;
  const name = String(error.name || '').toLowerCase();
  const message = String(error.message || error).toLowerCase();
  if (name.includes('quota') || name.includes('memory')) return true;
  return /out of memory|\boom\b|memory pressure|allocat(?:e|ion)|array buffer|gpu buffer|texture allocation|resource exhausted|insufficient memory/.test(message);
}
