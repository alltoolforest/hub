const ROUTES = Object.freeze({
  general: Object.freeze({
    id: 'general',
    label: 'General Photo',
    engine: 'ai',
    restoration: 'auto',
    sharpen: 'auto',
    disclosure: 'General-photo route using the verified browser AI core.'
  }),
  'high-fidelity': Object.freeze({
    id: 'high-fidelity',
    label: 'High-Fidelity Photo',
    engine: 'ai',
    restoration: 'fidelity',
    sharpen: 'low',
    disclosure: 'High-fidelity route favors source structure over aggressive reconstruction.'
  }),
  'low-resolution': Object.freeze({
    id: 'low-resolution',
    label: 'Low-Resolution Recovery',
    engine: 'ai',
    restoration: 'recovery',
    sharpen: 'auto',
    disclosure: 'Low-resolution route uses dedicated deblurring when blur is detected, otherwise the verified restoration path.'
  }),
  portrait: Object.freeze({
    id: 'portrait',
    label: 'Portrait / Face',
    engine: 'ai',
    restoration: 'fidelity',
    sharpen: 'low',
    disclosure: 'Portrait route is identity-preserving and conservative. Dedicated face restoration is not active.'
  }),
  'text-logo': Object.freeze({
    id: 'text-logo',
    label: 'Text / Logo',
    engine: 'standard',
    restoration: 'fidelity',
    sharpen: 'off',
    disclosure: 'Text/logo route deliberately uses standard high-quality resampling until a text-safe AI model is verified, reducing the risk of invented characters.'
  }),
  illustration: Object.freeze({
    id: 'illustration',
    label: 'Illustration / Digital Art',
    engine: 'ai',
    restoration: 'balanced',
    sharpen: 'low',
    disclosure: 'Illustration route uses conservative settings on the verified general AI model; no anime-specialist model is claimed.'
  }),
  'old-photo': Object.freeze({
    id: 'old-photo',
    label: 'Old / Damaged Photo',
    engine: 'ai',
    restoration: 'recovery',
    sharpen: 'auto',
    disclosure: 'Old-photo route strengthens recovery and can use dedicated deblurring when blur is detected. Scratch repair and dedicated face restoration are not active.'
  })
});

function autoRoute(analysis, scale) {
  const recoveryScore = analysis?.recoveryScore || 0;
  const softness = analysis?.softness || 0;
  const lowDetail = analysis?.lowDetail || 0;
  const jpegArtifacts = analysis?.jpegArtifacts || 0;
  const noise = analysis?.noise || 0;
  const targetScale = Number(scale) || 1;

  if (
    analysis?.falseResolution ||
    analysis?.lowResolution ||
    recoveryScore >= 0.55 ||
    softness >= 0.62 ||
    jpegArtifacts >= 0.68 ||
    (targetScale <= 1.05 && (softness >= 0.46 || lowDetail >= 0.58))
  ) {
    return ROUTES['low-resolution'];
  }

  const genuinelyClean =
    recoveryScore <= 0.20 &&
    softness < 0.32 &&
    lowDetail < 0.38 &&
    jpegArtifacts < 0.30 &&
    noise < 0.42;

  if (genuinelyClean) return ROUTES['high-fidelity'];
  return ROUTES.general;
}

export function resolveContentRoute(requested, analysis, scale, caps) {
  const route = requested && requested !== 'auto' && ROUTES[requested]
    ? ROUTES[requested]
    : autoRoute(analysis, scale);
  const auto = !requested || requested === 'auto';
  const device = caps?.isMobile ? 'mobile' : 'desktop';
  const acceleration = caps?.webgpu ? 'WebGPU available' : caps?.wasm ? 'WASM compatibility path' : 'standard fallback only';
  return Object.freeze({
    ...route,
    requested: requested || 'auto',
    auto,
    targetScale: Number(scale) || 1,
    device,
    acceleration,
    label: auto ? `Auto → ${route.label}` : route.label
  });
}

export function resolveRouteControls(route, requestedRestoration, requestedSharpen) {
  return Object.freeze({
    restoration: requestedRestoration === 'auto' ? route.restoration : requestedRestoration,
    sharpen: requestedSharpen === 'auto' ? route.sharpen : requestedSharpen
  });
}

export function contentRouteOptions() {
  return [
    ['auto', 'Auto — quality-aware routing'],
    ['general', 'General Photo'],
    ['high-fidelity', 'High-Fidelity Photo'],
    ['low-resolution', 'Low-Resolution Recovery'],
    ['portrait', 'Portrait / Face — conservative'],
    ['text-logo', 'Text / Logo — preserve characters'],
    ['illustration', 'Illustration / Digital Art'],
    ['old-photo', 'Old / Damaged Photo']
  ];
}

// A user-selected label is not evidence that a source is undamaged.
export function canRefineLocally(requested, analysis, scale = 1) {
  return requested === 'high-fidelity' && Number(scale) === 1 &&
    !!analysis?.diagnosis && !analysis.likelyBlurred &&
    ['blur', 'noise', 'compression', 'underexposure', 'overexposure', 'lowResolution', 'falseResolution', 'badLighting'].every(key =>
      Number.isFinite(analysis.diagnosis.confidence?.[key])) &&
    Object.values(analysis.diagnosis.confidence || {}).every(value => Number.isFinite(value) && value < 0.30) &&
    autoRoute(analysis, scale).id === 'high-fidelity';
}
