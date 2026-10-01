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
    disclosure: 'Low-resolution route permits stronger reconstruction and reports it as reconstruction.'
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
    disclosure: 'Old-photo route strengthens recovery, but dedicated scratch, deblur and face-restoration models are not active.'
  })
});

function autoRoute(analysis) {
  if (analysis?.falseResolution || analysis?.lowResolution || (analysis?.recoveryScore || 0) >= 0.62) {
    return ROUTES['low-resolution'];
  }
  if ((analysis?.recoveryScore || 0) <= 0.28) return ROUTES['high-fidelity'];
  return ROUTES.general;
}

export function resolveContentRoute(requested, analysis, scale, caps) {
  const route = requested && requested !== 'auto' && ROUTES[requested]
    ? ROUTES[requested]
    : autoRoute(analysis);
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
