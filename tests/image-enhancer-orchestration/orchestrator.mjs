// Isolated Task 3 contract prototype. Not imported by production.
// Detector thresholds and model adapters await Tasks 1/2 evidence.
const ORDER = ['repair', 'cleanup', 'deblur', 'portrait', 'upscale', 'tone', 'colorize'];
const VALID = new Set(['present', 'absent', 'uncertain']);
const KEYS = ['scratch', 'noise', 'compression', 'blur', 'lowResolution', 'lighting', 'fading'];

export function planRestoration(evidence = {}, controls = {}) {
  const stages = new Set(), limitations = [];
  for (const key of KEYS) {
    const value = evidence[key] ?? 'uncertain';
    if (!VALID.has(value)) throw new TypeError(`Invalid evidence: ${key}`);
    if (value === 'uncertain') limitations.push(`uncertain:${key}`);
  }
  const present = key => evidence[key] === 'present';
  const scale = controls.scale ?? 1;
  if (!Number.isFinite(scale) || scale < 1) throw new TypeError('Invalid scale');
  if (evidence.severe === true) {
    limitations.push('severe:source-limited');
  } else {
    if (present('scratch')) stages.add('repair');
    if (present('noise') || present('compression')) stages.add('cleanup');
    if (present('blur')) stages.add('deblur');
    if (evidence.portrait === 'present' && (present('blur') || present('lowResolution'))) stages.add('portrait');
    if (present('lowResolution')) stages.add('upscale');
  }
  if (scale > 1 && !evidence.severe) stages.add('upscale');
  if (present('lighting') || present('fading')) stages.add('tone');
  // Request contract only: no new UI and no colorization implementation.
  if (controls.colorize === true) {
    if (evidence.grayscale === true && !evidence.severe) stages.add('colorize');
    else limitations.push('colorization:ineligible');
  }
  if (!['present', 'absent', 'unavailable'].includes(evidence.portrait)) {
    throw new TypeError('Portrait detector status required');
  }
  if (evidence.portrait === 'unavailable') limitations.push('portrait:detector-unavailable');
  return Object.freeze({
    stages: Object.freeze(ORDER.filter(id => stages.has(id))),
    limitations: Object.freeze(limitations),
    context: Object.freeze({
      alpha: evidence.alpha !== false,
      text: evidence.text !== false,
      portraitUnknown: evidence.portrait === 'unavailable',
      grayscale: evidence.grayscale === true,
      scale
    })
  });
}

function checkFrame(frame, maxPixels) {
  if (!frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > maxPixels ||
      !(frame.data instanceof Uint8ClampedArray) || frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('Invalid or over-budget RGBA frame');
  }
}
const copy = frame => ({width: frame.width, height: frame.height, data: frame.data.slice()});
function equal(a, b) {
  return a.width === b.width && a.height === b.height && a.data.every((v, i) => v === b.data[i]);
}
function abort(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name: 'AbortError'});
}

// Registry is injected, never discovered/fetched. Each loader owns its resources
// until it resolves; each returned adapter releases them in dispose().
export async function restore({source, evidence, controls, registry = {}, maxPixels, signal, onProgress}) {
  if (!Number.isSafeInteger(maxPixels) || maxPixels < 1) throw new TypeError('Explicit pixel budget required');
  checkFrame(source, maxPixels);
  const plan = planRestoration(evidence, controls);
  const original = copy(source);
  let current = copy(original);
  const diagnostics = [...plan.limitations], completed = [];
  let aiExecuted = false;
  const report = (stage, state) => {
    if (signal?.aborted && state !== 'cancelled') return;
    try { onProgress?.({stage, state, completed: completed.length, total: plan.stages.length + (plan.stages.length ? 1 : 0)}); }
    catch { /* A UI observer must not break processing or resource release. */ }
  };
  const finish = (status, image) => ({status, image, aiExecuted, completed, diagnostics});
  const eligible = (descriptor, id) => descriptor?.approved === true &&
    (!plan.context.alpha || descriptor.preservesAlpha === true) &&
    (!plan.context.text || descriptor.preservesText === true) &&
    (!plan.context.grayscale || id === 'colorize' || descriptor.preservesGrayscale === true) &&
    (!plan.context.portraitUnknown || descriptor.detectorIndependent === true);

  async function execute(id) {
    const descriptor = registry[id];
    if (!eligible(descriptor, id) || typeof descriptor.load !== 'function') {
      diagnostics.push(`unavailable:${id}`);
      return false;
    }
    abort(signal);
    let adapter;
    report(id, 'loading');
    try {
      adapter = await descriptor.load({signal});
      abort(signal);
      if (typeof adapter?.run !== 'function' || typeof adapter?.dispose !== 'function') throw new Error('Invalid adapter');
      report(id, 'running');
      // Neither the saved original nor the current accepted frame is exposed.
      const result = await adapter.run({image: copy(current), original: copy(original),
        signal, context: plan.context});
      abort(signal);
      if (!['processed', 'unchanged', 'limited', 'fallback'].includes(result?.status) ||
          typeof result.aiExecuted !== 'boolean') throw new Error('Invalid stage diagnostics');
      aiExecuted ||= result.aiExecuted;
      checkFrame(result.image, maxPixels);
      if (result.status === 'fallback') throw new Error('Stage fallback');
      if (result.status === 'unchanged' && !equal(current, result.image)) throw new Error('False unchanged status');
      if (id !== 'upscale' && (result.image.width !== current.width || result.image.height !== current.height)) {
        throw new Error('Unexpected resize');
      }
      if (id === 'upscale' && (result.image.width !== Math.round(original.width * plan.context.scale) ||
          result.image.height !== Math.round(original.height * plan.context.scale))) throw new Error('Wrong output dimensions');
      if (plan.context.alpha && result.image.width === current.width && result.image.height === current.height &&
          current.data.some((v, i) => i % 4 === 3 && v !== result.image.data[i])) throw new Error('Changed alpha');
      if (result.status === 'limited') diagnostics.push(`limited:${id}`);
      current = copy(result.image);
      completed.push(id);
      report(id, 'complete');
      return true;
    } finally {
      // Wait for cooperative cancellation; do not race and abandon active work.
      await adapter?.dispose?.();
    }
  }

  try {
    abort(signal);
    // The photographic dependency trial rejected unconditional cleanup/deblur
    // stacking. Neither individual adapter approval nor a final guard proves
    // their composition safe. Withhold this unresolved route before loading.
    if (plan.stages.includes('cleanup') && plan.stages.includes('deblur')) {
      diagnostics.push('unvalidated-composition:cleanup-deblur');
      return finish('fallback', original);
    }
    if (plan.stages.length && !eligible(registry.guard, 'guard')) {
      diagnostics.push('unavailable:guard');
      return finish('fallback', original);
    }
    for (const id of plan.stages) {
      if (!await execute(id)) return finish('fallback', original);
    }
    if (plan.stages.length && !await execute('guard')) return finish('fallback', original);
    abort(signal);
    const unchanged = equal(original, current);
    return finish(unchanged ? 'unchanged' : diagnostics.length ? 'limited' : 'success', current);
  } catch (error) {
    const cancelled = signal?.aborted || error?.name === 'AbortError';
    diagnostics.push(cancelled ? 'cancelled' : 'stage-failure');
    report(null, cancelled ? 'cancelled' : 'failed');
    return finish(cancelled ? 'cancelled' : 'fallback', original);
  }
}
