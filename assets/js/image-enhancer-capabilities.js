const BASE_LIMITS = Object.freeze({
  mobile: Object.freeze({
    maxPixels: 16e6,
    maxSide: 8192,
    maxFileMB: 120,
    maxSourcePixels: 48e6
  }),
  desktop: Object.freeze({
    maxPixels: 64e6,
    maxSide: 16384,
    maxFileMB: 500,
    maxSourcePixels: 120e6
  })
});

function mobileViewport() {
  return globalThis.matchMedia?.('(max-width:700px)').matches ?? false;
}

export function detectEnhancerCapabilities() {
  const navigatorRef = globalThis.navigator || {};
  const isMobile = mobileViewport();
  const baseline = BASE_LIMITS[isMobile ? 'mobile' : 'desktop'];
  const ua = String(navigatorRef.userAgent || '');
  const iosLike = /iPad|iPhone|iPod/i.test(ua) ||
    (navigatorRef.platform === 'MacIntel' && Number(navigatorRef.maxTouchPoints) > 1);
  const safariLike = /Safari/i.test(ua) &&
    !/(Chrome|Chromium|Edg|OPR|CriOS|FxiOS)/i.test(ua);
  const deviceMemory = Number(navigatorRef.deviceMemory) || 0;
  const cores = Math.max(1, Number(navigatorRef.hardwareConcurrency) || 2);

  let maxPixels = baseline.maxPixels;
  let maxFileMB = baseline.maxFileMB;
  let maxSourcePixels = baseline.maxSourcePixels;

  if (isMobile) {
    if (iosLike) {
      maxPixels = cores >= 8 ? 24e6 : cores >= 6 ? 20e6 : 16e6;
      maxSourcePixels = cores >= 8 ? 64e6 : 48e6;
      maxFileMB = 160;
    } else if (deviceMemory >= 8) {
      maxPixels = 28e6;
      maxSourcePixels = 72e6;
      maxFileMB = 220;
    } else if (deviceMemory >= 4) {
      maxPixels = 20e6;
      maxSourcePixels = 56e6;
      maxFileMB = 160;
    }
  } else {
    if (deviceMemory >= 16) {
      maxPixels = 100e6;
      maxSourcePixels = 180e6;
      maxFileMB = 750;
    } else if (deviceMemory >= 8) {
      maxPixels = 80e6;
      maxSourcePixels = 150e6;
      maxFileMB = 600;
    } else if (deviceMemory > 0 && deviceMemory <= 4) {
      maxPixels = 48e6;
      maxSourcePixels = 96e6;
      maxFileMB = 350;
    } else if (safariLike) {
      maxPixels = 64e6;
      maxSourcePixels = 120e6;
      maxFileMB = 500;
    }
  }

  return Object.freeze({
    isMobile,
    iosLike,
    safariLike,
    deviceMemory,
    cores,
    webgpu: false,
    wasm: typeof WebAssembly !== 'undefined',
    workers: typeof Worker !== 'undefined',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    createImageBitmap: typeof createImageBitmap === 'function',
    maxTextureDimension2D: null,
    maxPixels,
    maxSide: iosLike ? Math.min(8192, baseline.maxSide) : baseline.maxSide,
    maxFileMB,
    maxSourcePixels
  });
}

export function enhancerPlannerCaps() {
  const caps = detectEnhancerCapabilities();
  return Object.freeze({
    maxPixels: caps.maxPixels,
    maxSide: caps.maxSide
  });
}
