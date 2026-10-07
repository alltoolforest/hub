// Non-generative photographic enhancement. No neural reconstruction, resizing,
// deconvolution, geometry changes or model dependencies. Operates on native pixels.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Y = (d, p) => d[p] * .2126 + d[p + 1] * .7152 + d[p + 2] * .0722;
export const PHOTO_HALO = 10;
export function photoStatistics() {
  return { histogram: new Uint32Array(256), count: 0, sum: 0, neutral: [0, 0, 0], neutrals: 0, residuals: [] };
}
// Sample native pixels, not a resized preview: resizing conceals sensor noise.
export function collectPhotoStatistics(data, width, height, stats, step = 4) {
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
      }
      const left = Y(data, p - 4), right = Y(data, p + 4);
      const up = Y(data, p - width * 4), down = Y(data, p + width * 4);
      if (Math.abs(left - right) + Math.abs(up - down) < 24 && l > 12 && l < 243 && stats.residuals.length < 100000) {
        stats.residuals.push(Math.abs(l - (left + right + up + down) / 4));
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
  const mean = stats.count ? stats.sum / stats.count : 128;
  const p05 = percentile(.05), p95 = percentile(.95);
  const range = p95 - p05;
  const wb = [1, 1, 1];
  if (!graphic && stats.neutrals > 64 && stats.neutrals > stats.count * .035) {
    const target = stats.neutral.reduce((a, b) => a + b, 0) / 3;
    for (let c = 0; c < 3; c++) wb[c] = 1 + (clamp(target / stats.neutral[c], .92, 1.08) - 1) * strength * .75;
  }
  // Conservative scene-adaptive tone curve. Never promise clipped detail recovery.
  const gamma = graphic ? 1 : mean < 100 ? clamp(Math.log(100 / 255) / Math.log(Math.max(mean, 20) / 255), .68, 1) : mean > 150 ? clamp(Math.log(150 / 255) / Math.log(Math.min(mean, 235) / 255), 1, 1.16) : 1;
  const contrast = graphic || range < Math.max(12, noise * 6) ? 0 : clamp((180 - range) / 130, 0, .65) * strength;
  const black = Math.min(45, p05 * .65) * contrast;
  const white = 255 - Math.min(35, (255 - p95) * .5) * contrast;
  const tone = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const stretched = clamp((i - black) / (white - black), 0, 1);
    const mapped = 255 * Math.pow(stretched, gamma);
    // Strength controls correction, not an extra processing pass.
    tone[i] = clamp(i + (mapped - i) * Math.min(1, strength), 0, 255);
  }
  const sharp = ({ off: 0, low: .14, medium: .28, auto: .18 })[options.sharpness || 'auto'] ?? .18;
  return { noise, wb, tone, strength, graphic, sharp: graphic ? 0 : sharp, local: graphic ? 0 : .10 * strength, mean, range };
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
  const sigma = Math.max(4, plan.noise * 2.2);
  const rangeWeight = new Float32Array(256);
  for (let i = 0; i < 256; i++) rangeWeight[i] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const cleanup = plan.graphic ? 0 : clamp((plan.noise - 1.2) / 10, 0, .78) * Math.min(1, plan.strength);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    let r = data[p], g = data[p + 1], b = data[p + 2];
    if (cleanup > 0 && data[p + 3] === 255) {
      let sr = 0, sg = 0, sb = 0, total = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = (clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)) * 4;
        if (data[q + 3] !== 255) continue;
        const diff = Math.max(Math.abs(data[q] - r), Math.abs(data[q + 1] - g), Math.abs(data[q + 2] - b));
        const weight = rangeWeight[Math.round(diff)] * (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
        sr += data[q] * weight; sg += data[q + 1] * weight; sb += data[q + 2] * weight; total += weight;
      }
      r += (sr / total - r) * cleanup; g += (sg / total - g) * cleanup; b += (sb / total - b) * cleanup;
    }
    r *= plan.wb[0]; g *= plan.wb[1]; b *= plan.wb[2];
    const cleanedY = .2126 * r + .7152 * g + .0722 * b;
    const target = plan.tone[clamp(Math.round(cleanedY), 0, 255)];
    const gain = cleanedY > 0 ? clamp(target / cleanedY, .65, 2.8) : 1;
    clean[i * 3] = r * gain; clean[i * 3 + 1] = g * gain; clean[i * 3 + 2] = b * gain;
    lum[i] = cleanedY * gain;
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
      const face = faces.some(f => x >= f.x && x < f.x + f.width && y + offsetY >= f.y && y + offsetY < f.y + f.height);
      const protection = face || skin ? .45 : 1;
      const boundary = Math.max(0, 1 - Math.abs(detail) / 36);
      const high = l - (lum[y * width + Math.max(0, x - 1)] + lum[y * width + Math.min(width - 1, x + 1)] + lum[Math.max(0, y - 1) * width + x] + lum[Math.min(height - 1, y + 1) * width + x]) / 4;
      const sharpen = Math.abs(high) > Math.max(2, plan.noise * 1.8) ? clamp(high * plan.sharp, -3, 3) : 0;
      const local = Math.abs(detail) > plan.noise * 1.5 ? clamp(detail * plan.local * boundary, -3, 3) : 0;
      const target = clamp(l + (local + sharpen) * protection, 0, 255);
      const saturation = plan.graphic ? 1 : 1 + .035 * plan.strength * protection * Math.max(0, 1 - Math.abs(detail) / 60);
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
