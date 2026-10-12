// Opt-in, offline photographic finishing experiment. Operates AFTER the retained
// R2 output: no spatial filtering, sharpening, denoising or face reconstruction.
export const FINISH_R3 = Object.freeze({
  balanced: Object.freeze({brightness: .10, contrast: .38}),
  brighter: Object.freeze({brightness: .13, contrast: .42}),
});

export function validateFinish({brightness, contrast}) {
  // Positive derivative everywhere: the derivative is concave in t, so its
  // minimum occurs at an endpoint. Reserve at least .05 slope at white.
  if (!Number.isFinite(brightness) || !Number.isFinite(contrast) ||
      brightness < 0 || contrast < 0 || 4 * brightness + contrast > .95)
    throw new RangeError('Finish must preserve monotonic tone ordering');
}

export function finishLuma(y, settings) {
  const t = y / 255;
  return y + 255 * t * (1 - t) *
    (4 * settings.brightness + settings.contrast * (2 * t - 1));
}

export function finishStrip(data, settings) {
  validateFinish(settings);
  if (!(data instanceof Uint8ClampedArray) || data.length % 4)
    throw new TypeError('Expected RGBA bytes');
  const out = data.slice();
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] !== 255) continue;
    const y = .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
    const target = finishLuma(y, settings);
    // Preserve existing chroma rather than intensifying the red cast. A common
    // scale only when necessary avoids independent channel clipping/hue shifts.
    let scale = 1;
    for (let c = 0; c < 3; c++) {
      const chroma = data[p + c] - y;
      if (chroma > 0) scale = Math.min(scale, (255 - target) / chroma);
      if (chroma < 0) scale = Math.min(scale, -target / chroma);
    }
    for (let c = 0; c < 3; c++) out[p + c] = target + (data[p + c] - y) * scale;
  }
  return out;
}
