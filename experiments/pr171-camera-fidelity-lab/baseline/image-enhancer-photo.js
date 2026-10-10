import { portraitProtectionAt } from './image-enhancer-portrait.js';
// Non-generative photographic enhancement. No neural reconstruction, resizing,
// deconvolution, geometry changes or model dependencies. Operates on native pixels.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Y = (d, p) => d[p] * .2126 + d[p + 1] * .7152 + d[p + 2] * .0722;
export const PHOTO_HALO = 10;
const blockAxis = () => ({ sum: new Float64Array(8), count: new Uint32Array(8) });
export function photoStatistics() {
  return { blocks: [blockAxis(), blockAxis()], histogram: new Uint32Array(256), count: 0, sum: 0, neutral: [0, 0, 0], neutrals: 0, neutralBands: Array.from({length:3}, () => ({count:0, rgb:[0,0,0]})), residuals: [], chromaResiduals: new Uint32Array(256), chromaCount: 0, shadowResiduals: new Uint32Array(256), shadowCount: 0 };
}
// Sample native pixels, not a resized preview: resizing conceals sensor noise.
export function collectPhotoStatistics(data, width, height, stats, step = 4, offsetY = 0) {
  // Odd strides sample every 8px phase instead of assuming the JPEG grid survived
  // cropping/orientation. Only weak boundaries with flat neighbors are evidence.
  const stride = (step * step) | 1;
  for (let i = width * 2 + 2; i < width * (height - 2) - 2; i += stride) {
    const x = i % width, y = Math.floor(i / width), p = i * 4;
    if (x < 2 || x >= width - 2 || data[p + 3] !== 255) continue;
    for (let axis = 0; axis < 2; axis++) {
      const d = axis ? width * 4 : 4;
      if ([p-d*2,p-d,p+d].some(q => data[q+3] !== 255)) continue;
      const jump = Math.abs(Y(data,p) - Y(data,p-d));
      const sides = Math.abs(Y(data,p-d)-Y(data,p-d*2)) + Math.abs(Y(data,p+d)-Y(data,p));
      if (jump < 18 && sides < 6) {
        const phase = (axis ? y + offsetY : x) % 8;
        stats.blocks[axis].sum[phase] += jump; stats.blocks[axis].count[phase]++;
      }
    }
  }
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1 + (y % step); x < width - 1; x += step) {
      const p = (y * width + x) * 4;
      if (data[p + 3] !== 255) continue;
      const l = Y(data, p);
      stats.histogram[Math.round(l)]++; stats.count++; stats.sum += l;
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
      const left = Y(data, p - 4), right = Y(data, p + 4);
      const up = Y(data, p - width * 4), down = Y(data, p + width * 4);
      if (Math.abs(left - right) + Math.abs(up - down) < 24 && l > 12 && l < 243 && stats.residuals.length < 100000) {
        const residual = Math.abs(l - (left + right + up + down) / 4);
        stats.residuals.push(residual);
        if (l < 80) {
          stats.shadowResiduals[Math.min(255, Math.round(residual * 4))]++;
          stats.shadowCount++;
        }
        // Estimate color speckle separately: low luminance noise does not imply
        // clean chroma, especially in phone JPEG shadows.
        const neighborY = (left + right + up + down) / 4;
        let chromaResidual = 0;
        for (const c of [0, 2]) {
          const neighbor = (data[p-4+c] + data[p+4+c] + data[p-width*4+c] + data[p+width*4+c]) / 4;
          chromaResidual = Math.max(chromaResidual, Math.abs((data[p+c]-l) - (neighbor-neighborY)));
        }
        stats.chromaResiduals[Math.min(255, Math.round(4 * chromaResidual))]++;
        stats.chromaCount++;
      }
    }
  }
}
export function makePhotoPlan(stats, options = {}) {
  const strength = ({ fidelity: .55, balanced: .85, recovery: 1.15 })[options.strength] || 1;
  const graphic = ['text-logo', 'illustration'].includes(options.content);
  function percentile(q) {
    let total = 0;
    for (let i = 0; i < 256; i++) { total += stats.histogram[i]; if (total > stats.count * q) return i; }
    return 255;
  }
  stats.residuals.sort((a, b) => a - b);
  const noise = clamp((stats.residuals[Math.floor(stats.residuals.length / 2)] || 0) / .754, 0, 16);
  let chromaMedian = 0, chromaCount = 0;
  for (let i = 0; i < 256 && stats.chromaCount; i++) {
    chromaCount += stats.chromaResiduals[i];
    if (chromaCount > stats.chromaCount / 2) { chromaMedian = i / 4; break; }
  }
  const chromaNoise = clamp(chromaMedian / .754, 0, 16);
  let shadowMedian = 0, shadowSamples = 0;
  for (let i = 0; i < 256 && stats.shadowCount; i++) {
    shadowSamples += stats.shadowResiduals[i];
    if (shadowSamples > stats.shadowCount / 2) { shadowMedian = i / 4; break; }
  }
  const shadowNoise = stats.shadowCount >= 32 ? clamp(shadowMedian / .754, 0, 16) : noise;
  const mean = stats.count ? stats.sum / stats.count : 128;
  const p05 = percentile(.05), p95 = percentile(.95);
  const range = p95 - p05;
  const blocks = stats.blocks.map(axis => {
    const means = Array.from(axis.sum, (v,i) => v / Math.max(1, axis.count[i]));
    const phase = means.indexOf(Math.max(...means));
    const floor = [...means].sort((a,b)=>a-b)[4];
    const ratio = means[phase] / Math.max(.15, floor);
    const strength = options.sourceMime === 'image/jpeg' && axis.count[phase] >= 40 && means[phase] >= .8 ? clamp((ratio - 1.8) / 3, 0, .75) : 0;
    return { phase, strength };
  });
  const blockStrength = Math.max(...blocks.map(b => b.strength));
  const wb = [1, 1, 1];
  // A neutral-looking midtone is not evidence of an illuminant. Require
  // consistent casts in midtones AND highlights before automatic correction.
  const bands = stats.neutralBands.slice(1);
  const gains = bands.map(b => b.rgb.map(v => b.rgb.reduce((a,c) => a+c, 0) / (3 * Math.max(1,v))));
  const consistentCast = bands.every(b => b.count >= 32) && gains[0].every((g,c) => Math.abs(g - gains[1][c]) < .025);
  if (!graphic && consistentCast && stats.neutrals > stats.count * .035) {
    const target = stats.neutral.reduce((a, b) => a + b, 0) / 3;
    for (let c = 0; c < 3; c++) wb[c] = 1 + (clamp(target / stats.neutral[c], .92, 1.08) - 1) * strength * .75;
  }
  // A bright background can dominate the mean and incorrectly darken an already
  // dark foreground. Require two substantial tonal groups with a midtone valley,
  // not just black hair, a few highlights, a night scene or a full-range gradient.
  const fraction = (lo, hi) => stats.histogram.slice(lo, hi).reduce((a,b) => a+b, 0) / Math.max(1, stats.count);
  const mixedLight = graphic ? 0 : clamp((fraction(12, 80) - .12) / .18, 0, 1)
    * clamp((fraction(192, 256) - .12) / .18, 0, 1)
    * clamp((.22 - fraction(96, 160)) / .12, 0, 1)
    * clamp((mean - 80) / 30, 0, 1)
    * clamp((range - 160) / 40, 0, 1);
  const shadowLift = 16 * mixedLight * clamp((6 - shadowNoise) / 4, 0, 1);
  // Conservative scene-adaptive tone curve. Never promise clipped detail recovery.
  const originalGamma = graphic ? 1 : mean < 100 ? clamp(Math.log(100 / 255) / Math.log(Math.max(mean, 20) / 255), .68, 1) : mean > 150 ? clamp(Math.log(150 / 255) / Math.log(Math.min(mean, 235) / 255), 1, 1.16) : 1;
  // Only relax global darkening when a useful, noise-safe shadow correction exists.
  const gamma = originalGamma > 1 ? 1 + (originalGamma - 1) * (1 - shadowLift / 16) : originalGamma;
  const contrast = graphic || range < Math.max(12, noise * 6) ? 0 : clamp((180 - range) / 130, 0, .65) * clamp((range - 50) / 50, 0, 1) * strength;
  const black = Math.min(45, p05 * .65) * contrast;
  const white = 255 - Math.min(35, (255 - p95) * .5) * contrast;
  const tone = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    // A smooth toe preserves distinctions in dark hair and clothing instead of
    // clipping every input below the estimated black point to the same value.
    const toe = black > 0 ? black * (1 - Math.exp(-i / (4 * black))) : 0;
    const stretched = clamp((i - toe) / (white - black), 0, 1);
    const mapped = 255 * Math.pow(stretched, gamma);
    const rise = clamp((i - 8) / 32, 0, 1), fall = clamp((144 - i) / 80, 0, 1);
    const lift = shadowLift * rise * rise * (3 - 2 * rise) * fall * fall * (3 - 2 * fall);
    // Strength controls correction, not an extra processing pass.
    tone[i] = clamp(i + (mapped + lift - i) * Math.min(1, strength), 0, 255);
  }
  const sharp = ({ off: 0, low: .14, medium: .28, auto: .18 })[options.sharpness || 'auto'] ?? .18;
  return { noise, chromaNoise, shadowNoise, shadowLift, wb, tone, strength, graphic, portrait: options.content === 'portrait', blocks, blockStrength, sharp: graphic ? 0 : sharp * (1 - blockStrength), local: graphic ? 0 : .10 * strength * (1 - blockStrength), mean, range };
}

// Strip input includes a 10px halo; returns RGBA for only the requested rows.
// This bounds working arrays by width * strip height, rather than full-image area.
export function enhancePhotoStrip(data, width, height, startRow, rowCount, plan, { faces = [], offsetY = 0 } = {}) {
  if (data.length !== width * height * 4 || startRow < 0 || rowCount < 1 || startRow + rowCount > height) throw new RangeError('Invalid photo strip');
  const n = width * height;
  const clean = new Float32Array(n * 3);
  const lum = new Float32Array(n);
  const horizontal = new Float32Array(n);
  const output = new Uint8ClampedArray(width * rowCount * 4);
  const sigma = Math.max(4, Math.max(plan.noise, plan.chromaNoise || 0) * 2.2);
  const protectionMask = faces.length ? new Float32Array(n) : null;
  if (protectionMask) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) protectionMask[y * width + x] = portraitProtectionAt(x, y + offsetY, faces);
  const rangeWeight = new Float32Array(256);
  for (let i = 0; i < 256; i++) rangeWeight[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const cleanup = plan.graphic ? 0 : clamp((plan.noise - 1.2) / 10, 0, .78) * Math.min(1, plan.strength);
  const colorCleanup = plan.graphic ? 0 : Math.max(cleanup, clamp(((plan.chromaNoise || 0) - 1.2) / 8, 0, .78) * Math.min(1, plan.strength));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    let r = data[p], g = data[p + 1], b = data[p + 2];
    if (colorCleanup > 0 && data[p + 3] === 255) {
      let sr = 0, sg = 0, sb = 0, total = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)) * 4;
        if (data[q + 3] !== 255) continue;
        const diff = Math.max(Math.abs(data[q] - r), Math.abs(data[q + 1] - g), Math.abs(data[q + 2] - b));
        const weight = rangeWeight[Math.round(diff)] * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        sr += data[q] * weight; sg += data[q + 1] * weight; sb += data[q + 2] * weight; total += weight;
      }
      // Keep photographed luminance texture in faces; clean chroma more than
      // luminance so noise reduction does not erase pores and identifying marks.
      const dr = sr / total - r, dg = sg / total - g, db = sb / total - b;
      const dl = .2126 * dr + .7152 * dg + .0722 * db;
      const protectedAmount = protectionMask?.[i] || 0;
      const lumaCleanup = cleanup * (1 - .75 * protectedAmount);
      const chromaCleanup = colorCleanup * (1 - .25 * protectedAmount);
      r += dl * lumaCleanup + (dr - dl) * chromaCleanup;
      g += dl * lumaCleanup + (dg - dl) * chromaCleanup;
      b += dl * lumaCleanup + (db - dl) * chromaCleanup;
    }
    if (!plan.graphic && plan.blockStrength > 0 && data[p + 3] === 255) {
      let dr=0,dg=0,db=0,axes=0;
      for (let axis = 0; axis < 2; axis++) {
        const block = plan.blocks[axis], coordinate = axis ? y + offsetY : x;
        const phase = ((coordinate - block.phase) % 8 + 8) % 8;
        if (!block.strength || (phase !== 0 && phase !== 7)) continue;
        const direction = phase === 0 ? -1 : 1, d = axis ? width * 4 : 4;
        if (x < 2 || x >= width-2 || y < 2 || y >= height-2) continue;
        const other = p + direction*d, inner = p - direction*d, far = p + direction*d*2;
        if (data[other+3]!==255 || data[inner+3]!==255 || data[far+3]!==255) continue;
        const jump = Math.abs(Y(data,p)-Y(data,other));
        const sides = Math.abs(Y(data,p)-Y(data,inner)) + Math.abs(Y(data,other)-Y(data,far));
        if (jump >= 18 || sides >= 6) continue;
        dr += clamp((data[other]-data[p])*.35,-4,4)*block.strength;
        dg += clamp((data[other+1]-data[p+1])*.35,-4,4)*block.strength;
        db += clamp((data[other+2]-data[p+2])*.35,-4,4)*block.strength;
        axes++;
      }
      if (axes) {r+=dr/axes;g+=dg/axes;b+=db/axes;}
    }
    r *= plan.wb[0]; g *= plan.wb[1]; b *= plan.wb[2];
    const cleanedY = .2126 * r + .7152 * g + .0722 * b;
    const target = plan.tone[clamp(Math.round(cleanedY), 0, 255)];
    const gain = cleanedY > 0 ? clamp(target / cleanedY, .65, 2.8) : 1;
    lum[i] = cleanedY * gain;
    // Exposure is primarily luminance correction. Scaling all RGB channels by
    // the full lift also magnifies an existing color cast, especially on skin.
    // Retain hue and some chroma growth without assuming a target skin color.
    const chromaGain = gain > 1 ? 1 + (gain - 1) * (plan.portrait ? .25 : .5) : gain;
    clean[i * 3] = lum[i] + (r - cleanedY) * chromaGain;
    clean[i * 3 + 1] = lum[i] + (g - cleanedY) * chromaGain;
    clean[i * 3 + 2] = lum[i] + (b - cleanedY) * chromaGain;
  }
  // Separable 17px local mean, linear time. Strong boundaries suppress the detail
  // term; noise-level thresholds avoid using noise as texture/sharpening evidence.
  const radius = 8;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += lum[y * width + clamp(k, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / 17;
      sum += lum[y * width + clamp(x + radius + 1, 0, width - 1)] - lum[y * width + clamp(x - radius, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = startRow - radius; k <= startRow + radius; k++) sum += horizontal[clamp(k, 0, height - 1) * width + x];
    for (let y = startRow; y < startRow + rowCount; y++) {
      const i = y * width + x, p = i * 4, q = ((y - startRow) * width + x) * 4;
      const l = lum[i], detail = l - sum / 17;
      const skin = data[p] > data[p + 2] * 1.08 && data[p] > data[p + 1] * 1.02 && data[p + 1] > data[p + 2] * .95;
      const face = protectionMask?.[i] || 0;
      const protection = Math.min(skin ? .45 : 1, 1 - .85 * face);
      const boundary = Math.max(0, 1 - Math.abs(detail) / 36);
      const high = l - (lum[y * width + Math.max(0, x - 1)] + lum[y * width + Math.min(width - 1, x + 1)] + lum[Math.max(0, y - 1) * width + x] + lum[Math.min(height - 1, y + 1) * width + x]) / 4;
      const sharpen = Math.abs(high) > Math.max(2, plan.noise * 1.8) ? clamp(high * plan.sharp, -3, 3) : 0;
      const local = Math.abs(detail) > plan.noise * 1.5 ? clamp(detail * plan.local * (plan.portrait ? 1.5 : 1) * boundary, -3, 3) : 0;
      const target = clamp(l + (local + sharpen) * protection, 0, 255);
      const saturation = plan.graphic ? 1 : 1 + .035 * plan.strength * (1 - plan.blockStrength) * protection * Math.max(0, 1 - Math.abs(detail) / 60);
      let chromaScale = saturation;
      // Compress chroma only as needed to stay in gamut, avoiding per-channel clipping.
      for (let c = 0; c < 3; c++) {
        const chroma = clean[i * 3 + c] - l;
        if (chroma > 0) chromaScale = Math.min(chromaScale, (255 - target) / chroma);
        if (chroma < 0) chromaScale = Math.min(chromaScale, -target / chroma);
      }
      for (let c = 0; c < 3; c++) output[q + c] = data[p + 3] === 255 ? target + (clean[i * 3 + c] - l) * chromaScale : data[p + c];
      output[q + 3] = data[p + 3];
      sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x] - horizontal[clamp(y - radius, 0, height - 1) * width + x];
    }
  }
  return output;
}
