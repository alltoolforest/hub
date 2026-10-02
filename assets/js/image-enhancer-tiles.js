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
  const mobile = !!options?.isMobile;
  const memory = Number(options?.deviceMemory) || 0;
  const cores = Math.max(1, Number(options?.cores) || 2);
  const iosLike = !!options?.iosLike;

  let exactFactor = Math.min(1, requestedScale / scale);

  // Mobile 4× uses AI on a bounded high-detail working image, then composes the
  // model output into the exact requested canvas. This avoids hundreds of seconds
  // of full-source x4 inference on phones while retaining worker responsiveness.
  if (mobile && requestedScale >= 3.5) {
    const capable = memory >= 6 || cores >= 8;
    const mid = memory >= 4 || cores >= 6;
    // Keep final output dimensions unchanged, but bound the expensive x4 AI
    // working image on phones. Low-capability browsers use half-resolution
    // source inference and let the final compositor reach the requested size.
    // This keeps 4× practical instead of spending minutes on full-source WASM.
    exactFactor = iosLike
      ? (capable ? 0.50 : mid ? 0.47 : 0.43)
      : (capable ? 0.52 : mid ? 0.49 : 0.45);
  }

  // Keep enough source information for restoration without forcing every device
  // to run the x4 model on the full original image.
  const qualityFloor = requestedScale <= 1.05
    ? (mobile ? 0.40 : 0.50)
    : requestedScale <= 2.05
      ? (mobile ? 0.60 : 0.75)
      : mobile
        ? Math.min(exactFactor, 0.86)
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
      ? (iosLike ? [208, 176, 144, 112, 88, 64, 48] : [224, 192, 160, 128, 96, 72, 48])
      : midMobile
        ? [208, 176, 144, 112, 80, 56, 48]
        : [192, 160, 128, 96, 72, 48];
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
