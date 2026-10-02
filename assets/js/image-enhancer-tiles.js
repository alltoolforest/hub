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
  const exactFactor = Math.min(1, requestedScale / scale);

  // The previous responsiveness hotfix used only exactFactor. That kept the UI
  // responsive, but 1×/2× paths could discard too much real source detail before
  // Real-ESRGAN saw the image. Keep a bounded quality floor while still avoiding
  // full-resolution x4 inference for the smaller output modes.
  const mobile = !!options?.isMobile;
  const qualityFloor = requestedScale <= 1.05
    ? (mobile ? 0.40 : 0.50)
    : requestedScale <= 2.05
      ? (mobile ? 0.60 : 0.75)
      : 1;

  const minimumStableFactor = Math.min(1, MIN_AI_SIDE / Math.min(srcWidth, srcHeight));
  const factor = Math.max(exactFactor, qualityFloor, minimumStableFactor);

  return Object.freeze({
    width: Math.max(1, Math.min(Math.round(srcWidth), Math.round(srcWidth * factor))),
    height: Math.max(1, Math.min(Math.round(srcHeight), Math.round(srcHeight * factor)))
  });
}

export function tileCorePlan(caps) {
  const memory = Number(caps?.deviceMemory) || 0;
  const cores = Math.max(1, Number(caps?.cores) || 2);
  const mobile = !!caps?.isMobile;
  const iosLike = !!caps?.iosLike;

  let candidates;
  if (caps?.webgpu) {
    candidates = [192, 160, 128, 96, 72, 56];
  } else if (mobile) {
    const capableMobile = memory >= 6 || cores >= 8;
    const midMobile = memory >= 4 || cores >= 6;
    candidates = capableMobile
      ? (iosLike ? [144, 112, 88, 64, 48] : [160, 128, 96, 72, 48])
      : midMobile
        ? [128, 104, 80, 60, 48]
        : [104, 80, 60, 48];
  } else {
    candidates = memory >= 8 || cores >= 8
      ? [176, 144, 112, 88, 64, 48]
      : [144, 112, 88, 64, 48];
  }

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
