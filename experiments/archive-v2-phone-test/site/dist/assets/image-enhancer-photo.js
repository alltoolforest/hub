import { portraitProtectionAt } from './image-enhancer-portrait.js';
import { smoothAtrous, STARLET_SIGMA, garrote, supportRadius } from './image-enhancer-wavelet.js';
// Non-generative photographic enhancement, v2. No neural reconstruction, resizing,
// deconvolution, geometry changes or model dependencies. Operates on native pixels.
//
// What changed relative to v1 (see ENGINE_V2_DESIGN.md for measurements):
//  * Detail is handled by a 5-level starlet decomposition: noise-adaptive shrinkage
//    (denoise) and amplitude-compressive per-scale gain (sharpen / texture / clarity)
//    replace the 3x3 bilateral + 4-neighbour sharpen capped at +-3 levels.
//  * Chroma noise is removed at coarse scales (where 4:2:0 / demosaic blotches live),
//    guarded by luma edges so real colour boundaries are not smeared.
//  * Noise is estimated from a histogram over the WHOLE image (v1 used the first 100k
//    samples, i.e. only the top of the frame) and per luminance band.
//  * A bilateral-grid local exposure term replaces the narrow mixed-light special case.
//  * Vibrance replaces the fixed +3.5 % saturation; a gentle S-curve adds midtone punch.
//  * Face protection is graded per scale instead of multiplying everything by 0.15.
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const Y = (d, p) => d[p] * .2126 + d[p + 1] * .7152 + d[p + 2] * .0722;
const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export const LUMA_LEVELS = 5, CHROMA_LEVELS = 4;
// Strip halo: 62 px wavelet support + 2 px for block-edge filtering.
export const PHOTO_HALO = supportRadius(LUMA_LEVELS) + 2;
// Strip height keeps (rows + 2*halo) * width near 1.3-1.9 MP so working planes stay bounded.
export function photoStripRows(width) { return clamp(Math.floor(1.5e6 / Math.max(1, width)) - 2 * PHOTO_HALO, 32, 192); }

const NOISE_Q = 0.25;          // lower quantile of local residuals: biased to flat areas on purpose
const K_LUMA = 0.3562;         // quantile -> sigma for |N(0,1.118 sigma)| at q = .25
const K_CHROMA = 0.55;         // calibrated on synthetic chroma noise (bench/calibrate_noise.py)
const NOISE_BINS = [32, 96, 160, 224];

const blockAxis = () => ({ sum: new Float64Array(8), count: new Uint32Array(8) });
export function photoStatistics({ width = 0, height = 0 } = {}) {
  const cell = Math.max(16, Math.ceil(Math.max(width, height, 1) / 24));
  const gw = Math.max(1, Math.ceil(width / cell)), gh = Math.max(1, Math.ceil(height / cell));
  return {
    size: { width, height },
    blocks: [blockAxis(), blockAxis()], histogram: new Uint32Array(256), count: 0, sum: 0,
    neutral: [0, 0, 0], neutrals: 0, neutralBands: Array.from({ length: 3 }, () => ({ count: 0, rgb: [0, 0, 0] })),
    residualHist: new Uint32Array(256), residualCount: 0, residualHist2: new Uint32Array(256), residualCount2: 0,
    binHist: Array.from({ length: 4 }, () => new Uint32Array(256)), binCount: new Uint32Array(4),
    chromaHist: new Uint32Array(256), chromaCount: 0,
    shadowHist: new Uint32Array(256), shadowCount: 0,
    grid: { cell, gw, gh, sum: new Float64Array(gw * gh), count: new Uint32Array(gw * gh) }
  };
}

// Sample native pixels, not a resized preview: resizing conceals sensor noise.
export function collectPhotoStatistics(data, width, height, stats, step = 4, offsetY = 0) {
  // Odd strides sample every 8px phase instead of assuming the JPEG grid survived cropping.
  const stride = (step * step) | 1;
  for (let i = width * 2 + 2; i < width * (height - 2) - 2; i += stride) {
    const x = i % width, y = Math.floor(i / width), p = i * 4;
    if (x < 2 || x >= width - 2 || data[p + 3] !== 255) continue;
    for (let axis = 0; axis < 2; axis++) {
      const d = axis ? width * 4 : 4;
      if ([p - d * 2, p - d, p + d].some(q => data[q + 3] !== 255)) continue;
      const jump = Math.abs(Y(data, p) - Y(data, p - d));
      const sides = Math.abs(Y(data, p - d) - Y(data, p - d * 2)) + Math.abs(Y(data, p + d) - Y(data, p));
      if (jump < 18 && sides < 6) {
        const phase = (axis ? y + offsetY : x) % 8;
        stats.blocks[axis].sum[phase] += jump; stats.blocks[axis].count[phase]++;
      }
    }
  }
  const g = stats.grid;
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1 + (y % step); x < width - 1; x += step) {
      const p = (y * width + x) * 4;
      if (data[p + 3] !== 255) continue;
      const l = Y(data, p);
      stats.histogram[Math.round(l)]++; stats.count++; stats.sum += l;
      const gi = Math.min(g.gh - 1, ((y + offsetY) / g.cell) | 0) * g.gw + Math.min(g.gw - 1, (x / g.cell) | 0);
      g.sum[gi] += l; g.count[gi]++;
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      const low = Math.min(data[p], data[p + 1], data[p + 2]);
      // Weak neutral evidence only. Do not gray-world neutralize sunsets/foliage.
      if (l > 45 && l < 220 && high - low < l * .20) {
        for (let c = 0; c < 3; c++) stats.neutral[c] += data[p + c];
        stats.neutrals++;
        const band = stats.neutralBands[Math.min(2, Math.floor((l - 45) / 60))];
        band.count++;
        for (let c = 0; c < 3; c++) band.rgb[c] += data[p + c];
      }
      if (!(l > 4 && l < 251)) continue;
      if ([p-4,p+4,p-width*4,p+width*4].some(q => data[q+3] !== 255)) continue;
      const left = Y(data, p - 4), right = Y(data, p + 4), up = Y(data, p - width * 4), down = Y(data, p + width * 4);
      const neighborY = (left + right + up + down) / 4;
      const bucket = Math.min(255, Math.round(Math.abs(l - neighborY) * 4));
      stats.residualHist[bucket]++; stats.residualCount++;
      const bin = l < 64 ? 0 : l < 128 ? 1 : l < 192 ? 2 : 3;
      stats.binHist[bin][bucket]++; stats.binCount[bin]++;
      if (l < 80) { stats.shadowHist[bucket]++; stats.shadowCount++; }
      // Second-scale residual (neighbours at +-2 px): correlated noise (JPEG, demosaic, phone NR)
      // hides from the 1 px test but shows here. White noise reads the same at both scales.
      if (x >= 2 && x < width - 2 && y >= 2 && y < height - 2 && [p-8,p+8,p-width*8,p+width*8].every(q => data[q+3] === 255)) {
        const n2 = (Y(data, p - 8) + Y(data, p + 8) + Y(data, p - width * 8) + Y(data, p + width * 8)) / 4;
        stats.residualHist2[Math.min(255, Math.round(Math.abs(l - n2) * 4))]++; stats.residualCount2++;
      }
      // Colour speckle is estimated separately from luminance noise.
      let chromaResidual = 0;
      for (const c of [0, 2]) {
        const neighbor = (data[p - 4 + c] + data[p + 4 + c] + data[p - width * 4 + c] + data[p + width * 4 + c]) / 4;
        chromaResidual += Math.abs((data[p + c] - l) - (neighbor - neighborY)) / 2;
      }
      stats.chromaHist[Math.min(255, Math.round(4 * chromaResidual))]++; stats.chromaCount++;
    }
  }
}

const quantile = (hist, total, q) => {
  if (!total) return 0;
  let run = 0;
  for (let i = 0; i < 256; i++) { run += hist[i]; if (run > total * q) return i / 4; }
  return 63.75;
};

// Per-scale constants. CORR_* account for the fact that real noise is spatially correlated
// (demosaic, denoise, JPEG) so its energy sits in coarser bands than white noise would put it.
const CORR_LUMA = [1, 1, 1, 1, 1];
const CORR_CHROMA = [1, 1, 1, 1];
const KNEE = [10, 14, 18, 24, 30], CAP = [10, 12, 14, 16, 18];

export function makePhotoPlan(stats, options = {}) {
  const strength = ({ fidelity: .55, balanced: .85, recovery: 1.15 })[options.strength] || 1;
  const sf = clamp(strength / .85, .4, 1.35);
  const graphic = ['text-logo', 'illustration'].includes(options.content);
  const mod = { wb: true, denoise: true, detail: true, deblock: true, local: true, vibrance: true, punch: true, tone: true, ...(options.modules || {}) };
  function percentile(q) {
    let total = 0;
    for (let i = 0; i < 256; i++) { total += stats.histogram[i]; if (total > stats.count * q) return i; }
    return 255;
  }
  const noise1 = quantile(stats.residualHist, stats.residualCount, NOISE_Q) / K_LUMA;
  const noise2 = quantile(stats.residualHist2, stats.residualCount2, NOISE_Q) / K_LUMA;
  const noise = clamp(Math.max(noise1, noise2 * (options.noise2Weight ?? .75)), 0, 14);
  const chromaNoise = clamp(quantile(stats.chromaHist, stats.chromaCount, NOISE_Q) / K_CHROMA, 0, 14);
  const shadowNoise = stats.shadowCount >= 64 ? clamp(quantile(stats.shadowHist, stats.shadowCount, NOISE_Q) / K_LUMA, 0, 14) : noise;
  // Signal-dependent noise: relative multiplier per luminance, interpolated between band centres.
  const binNoise = stats.binHist.map((h, i) => stats.binCount[i] >= 300 ? clamp(quantile(h, stats.binCount[i], NOISE_Q) / K_LUMA, 0, 14) : noise);
  const noiseRel = new Float32Array(256);
  for (let l = 0; l < 256; l++) {
    let a = 0; while (a < 3 && l > NOISE_BINS[a + 1]) a++;
    const b = Math.min(3, a + 1), t = a === b ? 0 : clamp((l - NOISE_BINS[a]) / (NOISE_BINS[b] - NOISE_BINS[a]), 0, 1);
    const v = binNoise[a] * (1 - t) + binNoise[b] * t;
    noiseRel[l] = noise > .05 ? clamp(v / noise, .5, 2.2) : 1;
  }
  const mean = stats.count ? stats.sum / stats.count : 128;
  const p05 = percentile(.05), p95 = percentile(.95);
  const range = p95 - p05;
  const isJpeg = options.sourceMime === 'image/jpeg';
  const blocks = stats.blocks.map(axis => {
    const means = Array.from(axis.sum, (v, i) => v / Math.max(1, axis.count[i]));
    const phase = means.indexOf(Math.max(...means));
    const floor = [...means].sort((a, b) => a - b)[4];
    const ratio = means[phase] / Math.max(.15, floor);
    const s = isJpeg && axis.count[phase] >= 40 && means[phase] >= .8 ? clamp((ratio - 1.8) / 3, 0, .75) : 0;
    return { phase, strength: s };
  });
  const blockStrength = mod.deblock ? Math.max(...blocks.map(b => b.strength)) : 0;
  // ---- white balance (unchanged v1 logic: needs consistent cast in midtones AND highlights)
  const wb = [1, 1, 1];
  const bands = stats.neutralBands.slice(1);
  const gains = bands.map(b => b.rgb.map(v => b.rgb.reduce((a, c) => a + c, 0) / (3 * Math.max(1, v))));
  const consistentCast = bands.every(b => b.count >= 32) && gains[0].every((g, c) => Math.abs(g - gains[1][c]) < .025);
  if (mod.wb && !graphic && consistentCast && stats.neutrals > stats.count * .035) {
    const target = stats.neutral.reduce((a, b) => a + b, 0) / 3;
    for (let c = 0; c < 3; c++) wb[c] = 1 + (clamp(target / stats.neutral[c], .92, 1.08) - 1) * strength * .75;
  }
  // ---- global tone (v1 logic) + gentle S-curve
  const fraction = (lo, hi) => { let s = 0; for (let i = lo; i < hi; i++) s += stats.histogram[i]; return s / Math.max(1, stats.count); };
  const mixedLight = graphic ? 0 : clamp((fraction(12, 80) - .12) / .18, 0, 1) * clamp((fraction(192, 256) - .12) / .18, 0, 1)
    * clamp((.22 - fraction(96, 160)) / .12, 0, 1) * clamp((mean - 80) / 30, 0, 1) * clamp((range - 160) / 40, 0, 1);
  const shadowLift = 16 * mixedLight * clamp((6 - shadowNoise) / 4, 0, 1);
  const originalGamma = graphic ? 1 : mean < 100 ? clamp(Math.log(100 / 255) / Math.log(Math.max(mean, 20) / 255), .68, 1) : mean > 150 ? clamp(Math.log(150 / 255) / Math.log(Math.min(mean, 235) / 255), 1, 1.16) : 1;
  const gamma = originalGamma > 1 ? 1 + (originalGamma - 1) * (1 - shadowLift / 16) : originalGamma;
  const contrast = graphic || range < Math.max(12, noise * 6) ? 0 : clamp((180 - range) / 130, 0, .65) * clamp((range - 50) / 50, 0, 1) * strength;
  const black = Math.min(45, p05 * .65) * contrast;
  const white = 255 - Math.min(35, (255 - p95) * .5) * contrast;
  const punchK = graphic || !mod.punch ? 0 : .30 * sf * clamp((mean - 55) / 50, 0, 1) * (range > 235 ? .5 : 1);
  const tone = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const toe = black > 0 ? black * (1 - Math.exp(-i / (4 * black))) : 0;
    const stretched = clamp((i - toe) / (white - black), 0, 1);
    let m = Math.pow(stretched, gamma);
    m += punchK * m * (1 - m) * (2 * m - 1);
    const rise = clamp((i - 8) / 32, 0, 1), fall = clamp((144 - i) / 80, 0, 1);
    const lift = shadowLift * rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall);
    tone[i] = mod.tone ? clamp(i + (255 * m + lift - i) * Math.min(1, strength), 0, 255) : i;
  }
  const toneAt = v => { const k = Math.min(254, Math.max(0, v | 0)); return tone[k] + (tone[k + 1] - tone[k]) * (v - k); };
  // ---- local exposure: per-cell exponent on the tone-mapped signal, applied with a bilateral
  // (range-aware) upsample so dark pixels near bright regions do not inherit the bright gain.
  const G = stats.grid, cells = G.gw * G.gh;
  const cellMean = new Float32Array(cells), cellExpo = new Float32Array(cells).fill(1);
  for (let i = 0; i < cells; i++) cellMean[i] = G.count[i] >= 4 ? G.sum[i] / G.count[i] : mean;
  let sd = 0; for (let i = 0; i < cells; i++) sd += (cellMean[i] - mean) ** 2; sd = Math.sqrt(sd / cells);
  // Lifting shadows multiplies their noise; stop lifting as shadow noise approaches the visible range.
  const noiseGate = clamp((5 - shadowNoise) / 3.5, .1, 1);
  const localAmount = graphic || !mod.local || options.localExposure === 'off' ? 0 : .32 * Math.min(1, sf) * clamp((sd - 18) / 22, 0, 1);
  if (localAmount > 0) {
    const tm = toneAt(clamp(mean, 0, 255)), key = clamp(tm, 100, 125);
    for (let i = 0; i < cells; i++) {
      const mt = clamp(toneAt(clamp(cellMean[i], 0, 254.9)), 8, 247);
      let target = mt;
      // Cells that are intentionally near-black (dark clothing, night sky) are left alone.
      if (mt < key) target = mt + (key - mt) * localAmount * noiseGate * smooth01((mt - 22) / 38);
      else if (mt > key + 35 && mt < 225) target = mt - (mt - (key + 35)) * localAmount * .35;
      cellExpo[i] = clamp(Math.log(target / 255) / Math.log(mt / 255), .7, 1.12);
    }
    for (let pass = 0; pass < 2; pass++) { // 3x3 smoothing of the exponent field
      const src = Float32Array.from(cellExpo);
      for (let gy = 0; gy < G.gh; gy++) for (let gx = 0; gx < G.gw; gx++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= G.gw || y >= G.gh) continue;
          s += src[y * G.gw + x]; c++;
        }
        cellExpo[gy * G.gw + gx] = s / c;
      }
    }
  }
  const rangeWeight = new Float32Array(256);
  for (let d = 0; d < 256; d++) rangeWeight[d] = Math.exp(-(d * d) / (2 * 30 * 30));
  let maxSlope = 1; for (let i = 0; i < 255; i++) maxSlope = Math.max(maxSlope, tone[i + 1] - tone[i]);
  const ditherAmp = graphic ? 0 : .35 * clamp((maxSlope - 1.1) / .4, 0, 1) + (localAmount > 0 ? .25 : 0);
  // ---- luma bands
  const maxDim = Math.max(stats.size.width, stats.size.height) || 1800;
  const shift = clamp(Math.round(Math.log2(maxDim / 1800)), 0, 2);
  const sharpG = ({ off: 0, low: .35, medium: .75, auto: .55 })[options.sharpness || 'auto'] ?? .55;
  const virtualGain = sharpG === 0 ? [0, 0, 0, 0, 0] : [sharpG, sharpG * .7, .30, .22, .14];
  const strictFace = options.faceProtection === 'strict';
  const faceGain = [.45, .45, .30, .20, .15].map(v => strictFace ? v * .35 : v);
  const dz = ({ fidelity: .8, balanced: 1, recovery: 1.15 })[options.strength] || 1;
  const z = 2.4 * dz * (options.denoiseScale ?? 1);
  const ring = isJpeg && blockStrength > 0 ? 2 + 6 * blockStrength : 0;
  const active = !graphic;
  const levels = Array.from({ length: LUMA_LEVELS }, (_, k) => {
    const v = k + 1 - shift;
    const g = !active || !mod.detail ? 0 : (v >= 1 ? virtualGain[v - 1] : v === 0 ? virtualGain[0] * .2 : 0) * sf * (1 - .6 * blockStrength);
    return {
      T: active && mod.denoise ? Math.max(.3, z * noise * STARLET_SIGMA[k] * (options.corrLuma || CORR_LUMA)[k]) : 0,
      retain: .12, faceRetain: strictFace ? .6 : .4, gain: g, faceGain: faceGain[k],
      knee: KNEE[k], cap: CAP[k], ringOn: k < 2 ? ring : 0
    };
  });
  const chromaStrength = active && mod.denoise ? clamp((chromaNoise - .8) / 1.5, 0, 1) : 0;
  const chromaLevels = Array.from({ length: CHROMA_LEVELS }, (_, k) => ({ T: Math.max(.3, 2.4 * dz * (options.denoiseScale ?? 1) * chromaNoise * STARLET_SIGMA[k] * (options.corrChroma || CORR_CHROMA)[k]) * chromaStrength }));
  const vibrance = graphic || !mod.vibrance ? 0 : .22 * sf * (1 - .5 * blockStrength);
  return {
    noise, chromaNoise, shadowNoise, shadowLift, wb, tone, strength, graphic, portrait: options.content === 'portrait',
    blocks, blockStrength, mean, range, noiseRel, noise1, noise2, levels, chromaLevels, chromaOn: chromaStrength > 0, vibrance,
    ditherAmp, shift, ring,
    shadowGuard: active && options.shadowGuard !== false,
    local: localAmount > 0 ? { cell: G.cell, gw: G.gw, gh: G.gh, mean: cellMean, expo: cellExpo, rangeWeight } : null
  };
}

// ---------------------------------------------------------------------------------------------
let pool = null;
function workspace(n) {
  if (!pool || pool.capacity < n) {
    const mk = () => new Float32Array(n);
    pool = { capacity: n, Y: mk(), cb: mk(), cr: mk(), a: mk(), b: mk(), tmp: mk(), acc: mk(), edge: mk(), w1: mk(), w2: mk(), prot: mk(), detail: mk() };
  }
  const v = {}; for (const k of Object.keys(pool)) if (k !== 'capacity') v[k] = pool[k].subarray(0, n);
  return v;
}
export function releasePhotoWorkspace() { pool = null; }

function deblock(Yp, width, height, offsetY, plan) {
  const beta = Math.max(5, 2 * plan.noise + 3), alpha = 14;
  for (let axis = 0; axis < 2; axis++) {
    const block = plan.blocks[axis]; if (!block.strength) continue;
    const k = block.strength;
    if (axis === 0) {
      for (let y = 0; y < height; y++) for (let x = 2 + ((block.phase - 2) % 8 + 8) % 8; x < width - 2; x += 8) {
        const i = y * width + x, p1 = Yp[i - 2], p0 = Yp[i - 1], q0 = Yp[i], q1 = Yp[i + 1], d = q0 - p0;
        if (Math.abs(d) >= alpha || Math.abs(p0 - p1) >= beta || Math.abs(q1 - q0) >= beta) continue;
        Yp[i - 1] = p0 + k * d * .5; Yp[i] = q0 - k * d * .5; Yp[i - 2] = p1 + k * d / 6; Yp[i + 1] = q1 - k * d / 6;
      }
    } else {
      for (let y = 2; y < height - 2; y++) {
        if ((((y + offsetY - block.phase) % 8) + 8) % 8 !== 0) continue;
        for (let x = 0; x < width; x++) {
          const i = y * width + x, p1 = Yp[i - 2 * width], p0 = Yp[i - width], q0 = Yp[i], q1 = Yp[i + width], d = q0 - p0;
          if (Math.abs(d) >= alpha || Math.abs(p0 - p1) >= beta || Math.abs(q1 - q0) >= beta) continue;
          Yp[i - width] = p0 + k * d * .5; Yp[i] = q0 - k * d * .5; Yp[i - 2 * width] = p1 + k * d / 6; Yp[i + width] = q1 - k * d / 6;
        }
      }
    }
  }
}

// Strip input includes a halo; returns RGBA for only the requested rows.
export function enhancePhotoStrip(data, width, height, startRow, rowCount, plan, { faces = [], offsetY = 0 } = {}) {
  if (data.length !== width * height * 4 || startRow < 0 || rowCount < 1 || startRow + rowCount > height) throw new RangeError('Invalid photo strip');
  const output = new Uint8ClampedArray(width * rowCount * 4);
  if (plan.graphic) { output.set(data.subarray(startRow * width * 4, (startRow + rowCount) * width * 4)); return output; }
  const n = width * height, W = workspace(n);
  const { Y: Yp, cb, cr, prot } = W;
  const [wr, wg, wbl] = plan.wb;
  // Finite-support alpha guard: hidden RGB never enters filtering. Preserve source
  // pixels within the complete wavelet/deblock support of nonopaque pixels.
  // This conservative boundary policy is independent of strip partitioning.
  let alphaGuard = null;
  for (let i = 0; i < n; i++) if (data[i*4+3] !== 255) { alphaGuard = new Uint8Array(n); break; }
  if (alphaGuard) {
    const radius = PHOTO_HALO, horizontal = W.tmp;
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x <= Math.min(radius,width-1); x++) count += data[(y*width+x)*4+3] !== 255;
      for (let x = 0; x < width; x++) {
        horizontal[y*width+x] = count > 0 ? 1 : 0;
        if (x-radius >= 0) count -= data[(y*width+x-radius)*4+3] !== 255;
        if (x+radius+1 < width) count += data[(y*width+x+radius+1)*4+3] !== 255;
      }
    }
    for (let x = 0; x < width; x++) {
      let count = 0;
      for (let y = 0; y <= Math.min(radius,height-1); y++) count += horizontal[y*width+x];
      for (let y = 0; y < height; y++) {
        alphaGuard[y*width+x] = count > 0 ? 1 : 0;
        if (y-radius >= 0) count -= horizontal[(y-radius)*width+x];
        if (y+radius+1 < height) count += horizontal[(y+radius+1)*width+x];
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const p = i*4;
    if (data[p+3] !== 255) { Yp[i] = 128; cb[i] = 0; cr[i] = 0; continue; }
    const r = data[p]*wr, g = data[p+1]*wg, b = data[p+2]*wbl;
    const l = .2126*r + .7152*g + .0722*b;
    Yp[i] = l; cb[i] = b-l; cr[i] = r-l;
  }
  // Protection plane: face rectangles (feathered) and, in Portrait mode, skin-coloured pixels.
  const useProt = faces.length > 0 || plan.portrait;
  if (useProt) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      let v = faces.length ? portraitProtectionAt(x, y + offsetY, faces) : 0;
      if (plan.portrait && data[p] > data[p + 2] * 1.08 && data[p] > data[p + 1] * 1.02 && data[p + 1] > data[p + 2] * .95) v = Math.max(v, .5);
      prot[i] = v;
    }
  }
  if (plan.blockStrength > 0) deblock(Yp, width, height, offsetY, plan);

  // ---- luma: shrink noise, shape detail, per scale
  let cur = W.a, nxt = W.b;
  const { tmp, acc, edge, w1, w2 } = W;
  cur.set(Yp); acc.fill(0); edge.fill(0); W.detail.fill(0);
  const L = plan.levels, noiseRel = plan.noiseRel;
  const doLevel = (j, wv, c, i, ringT) => {
    const lv = L[j];
    const a = wv < 0 ? -wv : wv;
    const f = useProt ? prot[i] : 0;
    const nf = noiseRel[clamp(c + .5, 0, 255) | 0];
    let T = lv.T * nf;
    if (ringT > 0) T = Math.hypot(T, ringT);
    let sh = a > T ? 1 - (T * T) / (a * a) : 0;
    const retain = lv.retain + (lv.faceRetain - lv.retain) * f;
    sh = retain + (1 - retain) * sh;
    let o = wv * sh;
    if (lv.gain > 0 && a > T) {
      const g = lv.gain * (1 - f * (1 - lv.faceGain));
      const ramp = smooth01((a - T) / (1.5 * T + .5));
      const k2 = lv.knee * lv.knee;
      const inc = wv * sh * g * ramp * k2 / (a * a + k2);
      const added = clamp(inc, -lv.cap, lv.cap);
      o += added; W.detail[i] += added;
    }
    return o;
  };
  for (let j = 0; j < LUMA_LEVELS; j++) {
    smoothAtrous(cur, nxt, tmp, width, height, 1 << j);
    if (j < 2) {
      const store = j === 0 ? w1 : w2;
      for (let i = 0; i < n; i++) store[i] = cur[i] - nxt[i];
    } else {
      for (let i = 0; i < n; i++) {
        const wv = cur[i] - nxt[i];
        acc[i] += doLevel(j, wv, nxt[i], i, 0);
        if (j < 4) edge[i] += wv < 0 ? -wv : wv;
      }
    }
    const t = cur; cur = nxt; nxt = t;
  }
  // `cur` is now the coarse residual c_L. Fine bands are processed last so the ring guard can use edge strength.
  const ringBase = plan.ring;
  for (let i = 0; i < n; i++) {
    const prox = ringBase > 0 ? smooth01((edge[i] - 8) / 24) : 0;
    const c1 = cur[i];
    const rt = ringBase * prox;
    const a1 = w1[i], a2 = w2[i];
    edge[i] += (a1 < 0 ? -a1 : a1) * .5 + (a2 < 0 ? -a2 : a2) * .75;
    acc[i] += doLevel(0, a1, c1, i, rt) + doLevel(1, a2, c1, i, rt);
    Yp[i] = c1 + acc[i];
  }
  // Limit only added detail to local source extrema, allowing the denoised
  // value itself. This removes sharpening overshoot without undoing denoising.
  if (L.some(lv => lv.gain > 0)) {
    for (let i = 0; i < n; i++) {
      const q = i*4; tmp[i] = .2126*data[q]*wr + .7152*data[q+1]*wg + .0722*data[q+2]*wbl;
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y*width+x, base = Yp[i]-W.detail[i];
      let lo = base, hi = base;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (clamp(y+dy,0,height-1)*width+clamp(x+dx,0,width-1))*4;
        if (data[q+3] !== 255) continue;
        const l = tmp[q/4];
        lo = Math.min(lo,l); hi = Math.max(hi,l);
      }
      Yp[i] = clamp(Yp[i],lo,hi);
    }
  }
  // ---- chroma: coarse-scale shrinkage, relaxed where luma shows a real edge
  if (plan.chromaOn) {
    const CL = plan.chromaLevels;
    const sNoise = Math.max(plan.noise, .5) * 2 + 4;
    for (const plane of [cb, cr]) {
      cur.set(plane); acc.fill(0);
      for (let j = 0; j < CHROMA_LEVELS; j++) {
        smoothAtrous(cur, nxt, tmp, width, height, 1 << j);
        const T = CL[j].T;
        for (let i = 0; i < n; i++) {
          const wv = cur[i] - nxt[i], a = wv < 0 ? -wv : wv;
          let sh = a > T ? 1 - (T * T) / (a * a) : 0;
          const guard = smooth01((edge[i] - sNoise) / (3 * sNoise));
          sh += (1 - sh) * .6 * guard;
          acc[i] += wv * sh;
        }
        const t = cur; cur = nxt; nxt = t;
      }
      for (let i = 0; i < n; i++) plane[i] = cur[i] + acc[i];
    }
  }
  // ---- tone, local exposure, vibrance, gamut-safe reconstruction
  const tone = plan.tone, loc = plan.local, vib = plan.vibrance, dAmp = plan.ditherAmp;
  for (let y = startRow; y < startRow + rowCount; y++) {
    const yAbs = y + offsetY;
    let gy = 0, iy = 0, fy = 0;
    if (loc) { gy = (yAbs + .5) / loc.cell - .5; iy = Math.floor(gy); fy = gy - iy; }
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4, q = ((y - startRow) * width + x) * 4;
      if (data[p + 3] !== 255 || (alphaGuard && alphaGuard[i])) { output[q] = data[p]; output[q + 1] = data[p + 1]; output[q + 2] = data[p + 2]; output[q + 3] = data[p + 3]; continue; }
      const yd = clamp(Yp[i], 0, 254.99);
      const k = yd | 0;
      let yt = tone[k] + (tone[k + 1] - tone[k]) * (yd - k);
      if (loc) {
        const gx = (x + .5) / loc.cell - .5, ix = Math.floor(gx), fx = gx - ix;
        let sw = 0, se = 0;
        for (let c = 0; c < 4; c++) {
          const cx = clamp(ix + (c & 1), 0, loc.gw - 1), cy = clamp(iy + (c >> 1), 0, loc.gh - 1), ci = cy * loc.gw + cx;
          const bil = ((c & 1) ? fx : 1 - fx) * ((c >> 1) ? fy : 1 - fy);
          const w = bil * (loc.rangeWeight[Math.min(255, Math.abs(yd - loc.mean[ci]) | 0)] + .03);
          sw += w; se += w * loc.expo[ci];
        }
        const e = sw > 0 ? se / sw : 1;
        if (e !== 1) yt = 255 * Math.pow(yt / 255, e);
      }
      if (dAmp > 0) {
        let h = Math.imul(x, 374761393) + Math.imul(yAbs, 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177); const u1 = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        h = Math.imul(h ^ 0x9e3779b9, 2246822519); const u2 = ((h ^ (h >>> 15)) >>> 0) / 4294967296;
        yt += (u1 + u2 - 1) * dAmp;
      }
      yt = clamp(yt, 0, 255);
      const gain = yd > .5 ? clamp(yt / yd, .5, 3) : 1;
      // Restrain amplification of shadow color fluctuations while preserving luma.
      // Smoothly restore the archive color treatment by luma 64.
      const shadowColor = plan.shadowGuard ? smooth01((yd-8)/56) : 1;
      const chromaGain = gain > 1 ? 1 + (gain - 1) * (plan.portrait ? .25 : .5) * shadowColor : gain;
      let cbv = cb[i] * chromaGain, crv = cr[i] * chromaGain;
      if (vib > 0) {
        const c = Math.hypot(cbv, crv);
        const v = vib * shadowColor * smooth01(c / 10) * (1 - clamp(c / 100, 0, 1)) ** 2 * (1 - (useProt ? .5 * prot[i] : 0));
        cbv *= 1 + v; crv *= 1 + v;
      }
      let cg = -(.2126 * crv + .0722 * cbv) / .7152, s = 1;
      for (const ch of [crv, cbv, cg]) {
        if (ch > 0) s = Math.min(s, (255 - yt) / ch); else if (ch < 0) s = Math.min(s, -yt / ch);
      }
      s = clamp(s, 0, 1);
      output[q] = yt + crv * s; output[q + 1] = yt + cg * s; output[q + 2] = yt + cbv * s; output[q + 3] = 255;
    }
  }
  return output;
}
