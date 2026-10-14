// Starlet ("a trous") multi-scale decomposition on Float32 planes.
//
// Why this transform: every level is a separable 5-tap B3-spline blur with holes, so the
// cost is linear in pixels, the support of a level-j detail band is a known fixed radius
// (needed for bounded strip processing), and the bands sum back EXACTLY to the input
// (c0 = c_J + sum(w_j)). Detail bands can therefore be shrunk (denoise) or boosted
// (texture/clarity) independently, per scale, with no resampling and no new content.
//
// Support radius of J levels = 2 + 4 + ... + 2^J = 2^(J+1) - 2  (J = 5 -> 62 px).

// Standard deviation of each starlet detail band for unit-variance WHITE noise.
export const STARLET_SIGMA = [0.8908, 0.2007, 0.0856, 0.0413, 0.0203, 0.0102];

export const supportRadius = levels => 2 ** (levels + 1) - 2;

// dst = B3 (x) B3 smoothing of src with hole spacing s (replicated borders).
// tmp is scratch of the same size. src and dst must be different arrays.
export function smoothAtrous(src, dst, tmp, w, h, s) {
  const s2 = 2 * s;
  const lo = Math.min(s2, w), hi = Math.max(lo, w - s2);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < lo; x++) {
      const a = x - s2 < 0 ? 0 : x - s2, b = x - s < 0 ? 0 : x - s;
      const c = x + s >= w ? w - 1 : x + s, d = x + s2 >= w ? w - 1 : x + s2;
      tmp[r + x] = (6 * src[r + x] + 4 * (src[r + b] + src[r + c]) + src[r + a] + src[r + d]) * 0.0625;
    }
    for (let x = lo; x < hi; x++) {
      const i = r + x;
      tmp[i] = (6 * src[i] + 4 * (src[i - s] + src[i + s]) + src[i - s2] + src[i + s2]) * 0.0625;
    }
    for (let x = hi; x < w; x++) {
      const a = x - s2 < 0 ? 0 : x - s2, b = x - s < 0 ? 0 : x - s;
      const c = x + s >= w ? w - 1 : x + s, d = x + s2 >= w ? w - 1 : x + s2;
      tmp[r + x] = (6 * src[r + x] + 4 * (src[r + b] + src[r + c]) + src[r + a] + src[r + d]) * 0.0625;
    }
  }
  for (let y = 0; y < h; y++) {
    const a = Math.max(0, y - s2) * w, b = Math.max(0, y - s) * w, c = y * w;
    const d = Math.min(h - 1, y + s) * w, e = Math.min(h - 1, y + s2) * w;
    for (let x = 0; x < w; x++) dst[c + x] = (6 * tmp[c + x] + 4 * (tmp[b + x] + tmp[d + x]) + tmp[a + x] + tmp[e + x]) * 0.0625;
  }
}

// Shrinkage used for denoising: non-negative garrote. Unlike soft thresholding it leaves
// large (real-structure) coefficients almost untouched, so edges are not dulled.
//   a = |w|, T = threshold -> multiplier in [0, 1]
export const garrote = (a, T) => (a > T ? 1 - (T * T) / (a * a) : 0);
