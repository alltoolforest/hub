// Offline, opt-in research only. Not imported by the worker or private preview.
// Reduce unsupported exposure changes before rendering, not by blending finished
// images (which would also undo denoising). No detail/denoise/geometry changes.
export const TONE_R2 = Object.freeze({
  id: 'restrained-tone-r2', correctionFraction: .65,
  maxLift: 18, maxShadowGain: 1.35, highlightHeadroomFraction: .30,
});

export function restrainedTonePlan(plan) {
  if (!plan || !(plan.tone instanceof Float32Array) || plan.tone.length !== 256)
    throw new TypeError('Expected a 256-entry photographic tone plan');
  for (let i = 0; i < 256; i++) {
    if (!Number.isFinite(plan.tone[i]) || plan.tone[i] < 0 || plan.tone[i] > 255 ||
        (i && plan.tone[i] < plan.tone[i - 1]))
      throw new RangeError('Tone curve must be finite, bounded and monotonic');
  }
  const tone = plan.tone.slice();
  if (!plan.graphic) for (let i = 0; i < 256; i++) {
    const lift = plan.tone[i] - i;
    // Negative correction is unchanged in this ablation. Each positive bound
    // describes a monotonic curve; their minimum preserves tonal ordering.
    if (lift > 0) tone[i] = i + Math.min(
      lift * TONE_R2.correctionFraction,
      TONE_R2.maxLift,
      i * (TONE_R2.maxShadowGain - 1),
      (255 - i) * TONE_R2.highlightHeadroomFraction,
    );
  }
  return {...plan, tone};
}
