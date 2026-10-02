const MIN_AI_SIDE = 16;

export function aiInferenceDimensions(
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  nativeScale = 4,
  options = {}
) {
  const values = [sourceWidth, sourceHeight, targetWidth, targetHeight, nativeScale].map(Number);
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('AI inference dimensions require positive finite sizes.');
  }

  const [srcWidth, srcHeight, outWidth, outHeight, scale] = values;
  const requestedScale = Math.max(outWidth / srcWidth, outHeight / srcHeight);
  const rawExactFactor = Math.min(1, requestedScale / scale);
  const mobile = !!options?.isMobile;
  const outputPixels = outWidth * outHeight;

  // Large 4× mobile jobs must not force the same native-x4 inference workload
  // as a desktop. The requested output dimensions remain unchanged; only the AI
  // working image is reduced, then tiled reconstruction is scaled to target and
  // source-detail preservation blends real texture back in.
  let exactFactor = rawExactFactor;
  if (mobile && requestedScale > 2.05) {
    const mobileCap = outputPixels > 6e6 ? 0.50 : outputPixels > 3e6 ? 0.68 : 0.80;
    exactFactor = Math.min(exactFactor, mobileCap);
  }

  const qualityFloor = requestedScale <= 1.05
    ? (mobile ? 0.40 : 0.50)
    : requestedScale <= 2.05
      ? (mobile ? 0.60 : 0.75)
      : (mobile ? (outputPixels > 6e6 ? 0.50 : 0.68) : 1);

  const minimumStableFactor = Math.min(1, MIN_AI_SIDE / Math.min(srcWidth, srcHeight));
  const factor = Math.max(exactFactor, qualityFloor, minimumStableFactor);

  return Object.freeze({
    width: Math.max(1, Math.min(Math.round(srcWidth), Math.round(srcWidth * factor))),
    height: Math.max(1, Math.min(Math.round(srcHeight), Math.round(srcHeight * factor)))
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
