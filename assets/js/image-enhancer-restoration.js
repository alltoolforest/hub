const SAMPLE_SIDE = 320;
const SHARPEN_TILE = 256;

function canvas(width, height) {
  const node = document.createElement('canvas');
  node.width = Math.max(1, Math.round(width));
  node.height = Math.max(1, Math.round(height));
  return node;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function extensionOf(file) {
  return String(file?.name || '').split('.').pop()?.toLowerCase() || '';
}

function labelLevel(value, low, high, labels = ['low', 'moderate', 'high']) {
  if (value < low) return labels[0];
  if (value < high) return labels[1];
  return labels[2];
}

function sampleImage(image) {
  const scale = Math.min(1, SAMPLE_SIDE / image.width, SAMPLE_SIDE / image.height);
  const width = Math.max(8, Math.round(image.width * scale));
  const height = Math.max(8, Math.round(image.height * scale));
  const node = canvas(width, height);
  const ctx = node.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Image analysis is unavailable in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  node.width = node.height = 0;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
  }
  return { gray, width, height };
}

function perceptualBlurMetric(gray, width, height, radius = 4) {
  const horizontal = new Float32Array(gray.length);
  const vertical = new Float32Array(gray.length);
  const kernel = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const x = Math.max(0, Math.min(width - 1, k));
      sum += gray[y * width + x];
    }
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / kernel;
      const removeX = Math.max(0, Math.min(width - 1, x - radius));
      const addX = Math.max(0, Math.min(width - 1, x + radius + 1));
      sum += gray[y * width + addX] - gray[y * width + removeX];
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const y = Math.max(0, Math.min(height - 1, k));
      sum += gray[y * width + x];
    }
    for (let y = 0; y < height; y++) {
      vertical[y * width + x] = sum / kernel;
      const removeY = Math.max(0, Math.min(height - 1, y - radius));
      const addY = Math.max(0, Math.min(height - 1, y + radius + 1));
      sum += gray[addY * width + x] - gray[removeY * width + x];
    }
  }

  let originalH = 0, removedH = 0;
  let originalV = 0, removedV = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      const left = i - 1;
      const up = i - width;

      const dH = Math.abs(gray[i] - gray[left]);
      const bH = Math.abs(horizontal[i] - horizontal[left]);
      originalH += dH;
      removedH += Math.max(0, dH - bH);

      const dV = Math.abs(gray[i] - gray[up]);
      const bV = Math.abs(vertical[i] - vertical[up]);
      originalV += dV;
      removedV += Math.max(0, dV - bV);
    }
  }

  const blurH = originalH > 0.001 ? 1 - removedH / originalH : 0;
  const blurV = originalV > 0.001 ? 1 - removedV / originalV : 0;
  return Math.max(blurH, blurV);
}

function analyzeGray({ gray, width, height }) {
  let lapSum = 0;
  let lapSq = 0;
  let lapCount = 0;
  let gradientSum = 0;
  let residualSum = 0;
  let residualCount = 0;
  let blockBoundary = 0;
  let blockBoundaryCount = 0;
  let normalBoundary = 0;
  let normalBoundaryCount = 0;
  let fineGradient = 0;
  let fineGradientCount = 0;
  let coarseGradient = 0;
  let coarseGradientCount = 0;

  const at = (x, y) => gray[y * width + x];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = at(x, y);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const u = at(x, y - 1);
      const d = at(x, y + 1);
      const lap = l + r + u + d - 4 * c;
      lapSum += lap;
      lapSq += lap * lap;
      lapCount++;
      gradientSum += (Math.abs(r - l) + Math.abs(d - u)) * 0.5;

      if (x + 1 < width && y + 1 < height) {
        fineGradient += Math.abs(at(x + 1, y) - c) + Math.abs(at(x, y + 1) - c);
        fineGradientCount += 2;
      }
      if (x + 4 < width && y + 4 < height) {
        coarseGradient += Math.abs(at(x + 4, y) - c) + Math.abs(at(x, y + 4) - c);
        coarseGradientCount += 2;
      }

      if ((x & 1) === 0 && (y & 1) === 0) {
        const localMean = (c + l + r + u + d) / 5;
        residualSum += Math.abs(c - localMean);
        residualCount++;
      }

      if (x < width - 2) {
        const diff = Math.abs(at(x + 1, y) - c);
        if (x % 8 === 7) {
          blockBoundary += diff;
          blockBoundaryCount++;
        } else if (x % 8 === 3) {
          normalBoundary += diff;
          normalBoundaryCount++;
        }
      }
      if (y < height - 2) {
        const diff = Math.abs(at(x, y + 1) - c);
        if (y % 8 === 7) {
          blockBoundary += diff;
          blockBoundaryCount++;
        } else if (y % 8 === 3) {
          normalBoundary += diff;
          normalBoundaryCount++;
        }
      }
    }
  }

  const lapMean = lapCount ? lapSum / lapCount : 0;
  const lapVariance = lapCount ? Math.max(0, lapSq / lapCount - lapMean * lapMean) : 0;
  const gradient = lapCount ? gradientSum / lapCount : 0;
  const noise = residualCount ? residualSum / residualCount : 0;
  const block = blockBoundaryCount ? blockBoundary / blockBoundaryCount : 0;
  const normal = normalBoundaryCount ? normalBoundary / normalBoundaryCount : 0;
  const blockingRatio = normal > 0.01 ? block / normal : 1;
  const fine = fineGradientCount ? fineGradient / fineGradientCount : 0;
  const coarse = coarseGradientCount ? coarseGradient / coarseGradientCount : 0;
  const edgeSpreadRatio = coarse > 0.01 ? fine / coarse : 1;

  return { lapVariance, gradient, noise, blockingRatio, fineGradient: fine, coarseGradient: coarse, edgeSpreadRatio };
}

export async function analyzeSourceImage(image, file) {
  const sampled = sampleImage(image);
  const metrics = analyzeGray(sampled);
  const megapixels = image.width * image.height / 1e6;
  const bytesPerPixel = file?.size ? file.size / Math.max(1, image.width * image.height) : 0;
  const ext = extensionOf(file);
  const jpeg = ext === 'jpg' || ext === 'jpeg' || file?.type === 'image/jpeg';

  const softness = clamp((150 - metrics.lapVariance) / 135);
  const noise = clamp((metrics.noise - 1.5) / 8.5);
  const jpegArtifacts = jpeg
    ? clamp((metrics.blockingRatio - 1.05) / 1.15 + (bytesPerPixel && bytesPerPixel < 0.18 ? 0.18 : 0))
    : 0;
  const lowDetail = clamp((8.5 - metrics.gradient) / 7.5);
  const lowResolution = Math.max(image.width, image.height) <= 960 || megapixels < 0.8;
  const falseResolution = megapixels >= 4 && lowDetail > 0.64 && softness > 0.48;
  const perceptualBlur = perceptualBlurMetric(sampled.gray, sampled.width, sampled.height);
  const blurScore = clamp((perceptualBlur - 0.24) / 0.16 - noise * 0.08);
  const recoverableBlurStructure =
    metrics.gradient >= 3.5 ||
    (
      perceptualBlur >= 0.45 &&
      metrics.gradient >= 1.5 &&
      softness >= 0.82
    );
  const likelyBlurred =
    blurScore >= 0.30 &&
    perceptualBlur >= 0.285 &&
    recoverableBlurStructure &&
    noise < 0.80;
  const recoveryScore = clamp(
    softness * 0.34 + noise * 0.22 + jpegArtifacts * 0.24 + lowDetail * 0.20 +
    (lowResolution ? 0.12 : 0) + (falseResolution ? 0.12 : 0)
  );
  const recommendedProfile = recoveryScore >= 0.62 ? 'recovery' : recoveryScore <= 0.28 ? 'fidelity' : 'balanced';

  const findings = [];
  if (softness > 0.58) findings.push(`${labelLevel(softness, 0.58, 0.78)} softness`);
  if (noise > 0.48) findings.push(`${labelLevel(noise, 0.48, 0.72)} noise`);
  if (jpegArtifacts > 0.42) findings.push(`${labelLevel(jpegArtifacts, 0.42, 0.68)} compression artifacts`);
  if (lowResolution) findings.push('low source resolution');
  if (falseResolution) findings.push('large dimensions with limited real detail');
  if (likelyBlurred) findings.push('likely motion / defocus blur');
  if (!findings.length) findings.push('generally clean source');

  return Object.freeze({
    ...metrics,
    softness,
    noise,
    jpegArtifacts,
    lowDetail,
    lowResolution,
    falseResolution,
    perceptualBlur,
    blurScore,
    likelyBlurred,
    recoveryScore,
    recommendedProfile,
    findings,
    note: `${findings.join(' · ')} · ${recommendedProfile === 'recovery' ? 'Recovery' : recommendedProfile === 'fidelity' ? 'Fidelity' : 'Balanced'} profile recommended`
  });
}

export function resolveRestorationProfile(requested, analysis, scale) {
  const requestedProfile = requested === 'auto' ? analysis?.recommendedProfile || 'balanced' : requested;
  const profile = ['fidelity', 'balanced', 'recovery'].includes(requestedProfile) ? requestedProfile : 'balanced';
  const scaleFactor = Number(scale) || 1;

  const oneX = scaleFactor <= 1.05;
  if (profile === 'fidelity') {
    return Object.freeze({
      id: 'fidelity',
      label: 'Fidelity',
      preclean: oneX ? 0 : (analysis?.noise > 0.78 ? 0.04 : 0),
      aiBlend: oneX ? 0.32 : 0.80,
      minDetailRatio: oneX ? 0.94 : 0.86,
      minRegionalDetailRatio: oneX ? 0.96 : 0.86,
      disclosure: 'Source-detail-first restoration with conservative AI blending.'
    });
  }
  if (profile === 'recovery') {
    const severeNoise = (analysis?.noise || 0) > 0.78 || (analysis?.jpegArtifacts || 0) > 0.78;
    return Object.freeze({
      id: 'recovery',
      label: 'Recovery',
      preclean: oneX ? (severeNoise ? 0.02 : 0) : (severeNoise ? 0.08 : 0.03),
      aiBlend: oneX ? 0.48 : 0.94,
      minDetailRatio: oneX ? 0.92 : 0.82,
      minRegionalDetailRatio: oneX ? 0.93 : 0.82,
      disclosure: 'Stronger restoration while retaining measurable source texture.'
    });
  }
  return Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    preclean: oneX ? 0 : ((analysis?.noise || 0) > 0.72 || (analysis?.jpegArtifacts || 0) > 0.72 ? 0.05 : 0),
    aiBlend: oneX ? 0.40 : 0.88,
    minDetailRatio: oneX ? 0.93 : 0.84,
    minRegionalDetailRatio: oneX ? 0.94 : 0.84,
    disclosure: 'Balanced restoration with source-detail protection.'
  });
}

export async function prepareRestorationInput(image, profile, signal) {
  if (!profile?.preclean) return { image, temporary: null, applied: false };
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

  const shrink = 1 - clamp(profile.preclean, 0, 0.18);
  const small = canvas(image.width * shrink, image.height * shrink);
  const smallCtx = small.getContext('2d', { alpha: false });
  if (!smallCtx) throw new Error('Restoration pre-clean canvas is unavailable.');
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.drawImage(image, 0, 0, small.width, small.height);

  const restored = canvas(image.width, image.height);
  const restoredCtx = restored.getContext('2d', { alpha: false });
  if (!restoredCtx) {
    small.width = small.height = 0;
    throw new Error('Restoration canvas is unavailable.');
  }
  restoredCtx.imageSmoothingEnabled = true;
  restoredCtx.imageSmoothingQuality = 'high';
  restoredCtx.drawImage(small, 0, 0, restored.width, restored.height);
  small.width = small.height = 0;

  if (signal?.aborted) {
    restored.width = restored.height = 0;
    throw new DOMException('Processing cancelled.', 'AbortError');
  }
  return { image: restored, temporary: restored, applied: true };
}

export function blendForFidelity(aiCanvas, sourceImage, scale, profile) {
  if (!profile || profile.aiBlend >= 0.999) return aiCanvas;
  const blended = canvas(aiCanvas.width, aiCanvas.height);
  const ctx = blended.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Fidelity blend canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, 0, 0, blended.width, blended.height);
  ctx.globalAlpha = clamp(profile.aiBlend, 0, 1);
  ctx.drawImage(aiCanvas, 0, 0);
  ctx.globalAlpha = 1;
  aiCanvas.width = aiCanvas.height = 0;
  return blended;
}

export async function applyLocalEnhancement(inputCanvas, analysis, signal, onProgress) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
  const ctx = inputCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Local enhancement canvas is unavailable.');

  const softness = analysis?.softness || 0;
  const lowDetail = analysis?.lowDetail || 0;
  const noise = analysis?.noise || 0;
  const contrast = clamp(1.045 + softness * 0.025 + lowDetail * 0.02 - noise * 0.01, 1.04, 1.09);
  const saturation = clamp(1.025 + lowDetail * 0.02, 1.02, 1.05);
  const tile = 256;
  const cols = Math.ceil(inputCanvas.width / tile);
  const rows = Math.ceil(inputCanvas.height / tile);
  const total = cols * rows;
  let index = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
      const x = col * tile;
      const y = row * tile;
      const width = Math.min(tile, inputCanvas.width - x);
      const height = Math.min(tile, inputCanvas.height - y);
      const pixels = ctx.getImageData(x, y, width, height);
      const data = pixels.data;

      for (let p = 0; p < data.length; p += 4) {
        const red = data[p];
        const green = data[p + 1];
        const blue = data[p + 2];
        const y0 = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const y1 = clamp((y0 - 128) * contrast + 128, 0, 255);
        data[p] = clampByte(y1 + (red - y0) * saturation);
        data[p + 1] = clampByte(y1 + (green - y0) * saturation);
        data[p + 2] = clampByte(y1 + (blue - y0) * saturation);
      }

      ctx.putImageData(pixels, x, y);
      index++;
      onProgress?.(`Finishing enhancement ${index} of ${total}…`);
      if ((index & 3) === 0) await new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
  }

  return {
    canvas: inputCanvas,
    applied: true,
    label: 'Local contrast / colour finish',
    contrast,
    saturation
  };
}

export function resolveSharpening(requested, analysis, profile) {
  if (requested === 'off') return Object.freeze({ id: 'off', label: 'Off', amount: 0, threshold: 255, maxDelta: 0 });
  if (requested === 'low') return Object.freeze({ id: 'low', label: 'Low', amount: 0.26, threshold: 4.5, maxDelta: 10 });
  if (requested === 'medium') return Object.freeze({ id: 'medium', label: 'Medium', amount: 0.46, threshold: 3.5, maxDelta: 15 });

  const softness = analysis?.softness || 0;
  const noise = analysis?.noise || 0;
  const recoveryBias = profile?.id === 'recovery' ? 0.06 : profile?.id === 'fidelity' ? -0.02 : 0;
  const amount = clamp(0.26 + softness * 0.24 + recoveryBias - noise * 0.08, 0.18, 0.52);
  const threshold = clamp(3.5 + noise * 9, 3.5, 12);
  const maxDelta = clamp(10 + softness * 7 - noise * 2, 9, 17);
  return Object.freeze({ id: 'auto', label: 'Auto', amount, threshold, maxDelta });
}

function luma(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

export async function applyIntelligentSharpen(inputCanvas, settings, signal, onProgress) {
  if (!settings?.amount) return { canvas: inputCanvas, applied: false, label: settings?.label || 'Off' };
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

  let source = null;
  let sourceCanvas = null;
  if (typeof createImageBitmap === 'function') {
    source = await createImageBitmap(inputCanvas);
  } else if (inputCanvas.width * inputCanvas.height <= 8e6) {
    sourceCanvas = canvas(inputCanvas.width, inputCanvas.height);
    const copyCtx = sourceCanvas.getContext('2d', { alpha: false });
    if (!copyCtx) throw new Error('Sharpening snapshot could not be created.');
    copyCtx.drawImage(inputCanvas, 0, 0);
    source = sourceCanvas;
  } else {
    return { canvas: inputCanvas, applied: false, label: 'Skipped for memory safety' };
  }

  const targetCtx = inputCanvas.getContext('2d', { alpha: false });
  if (!targetCtx) {
    source?.close?.();
    if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 0;
    throw new Error('Sharpening output canvas is unavailable.');
  }

  const scratch = canvas(SHARPEN_TILE + 2, SHARPEN_TILE + 2);
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!scratchCtx) {
    source?.close?.();
    if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 0;
    throw new Error('Sharpening workspace is unavailable.');
  }

  const cols = Math.ceil(inputCanvas.width / SHARPEN_TILE);
  const rows = Math.ceil(inputCanvas.height / SHARPEN_TILE);
  const total = cols * rows;
  let tileIndex = 0;

  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
        const x = col * SHARPEN_TILE;
        const y = row * SHARPEN_TILE;
        const coreW = Math.min(SHARPEN_TILE, inputCanvas.width - x);
        const coreH = Math.min(SHARPEN_TILE, inputCanvas.height - y);
        const sx = Math.max(0, x - 1);
        const sy = Math.max(0, y - 1);
        const ex = Math.min(inputCanvas.width, x + coreW + 1);
        const ey = Math.min(inputCanvas.height, y + coreH + 1);
        const readW = ex - sx;
        const readH = ey - sy;
        const offsetX = x - sx;
        const offsetY = y - sy;

        scratch.width = readW;
        scratch.height = readH;
        scratchCtx.drawImage(source, sx, sy, readW, readH, 0, 0, readW, readH);
        const sampled = scratchCtx.getImageData(0, 0, readW, readH);
        const src = sampled.data;
        const core = targetCtx.createImageData(coreW, coreH);
        const dst = core.data;

        for (let cy = 0; cy < coreH; cy++) {
          const py = cy + offsetY;
          for (let cx = 0; cx < coreW; cx++) {
            const px = cx + offsetX;
            const center = (py * readW + px) * 4;
            const out = (cy * coreW + cx) * 4;
            const left = (py * readW + Math.max(0, px - 1)) * 4;
            const right = (py * readW + Math.min(readW - 1, px + 1)) * 4;
            const up = (Math.max(0, py - 1) * readW + px) * 4;
            const down = (Math.min(readH - 1, py + 1) * readW + px) * 4;
            const centerY = luma(src, center);
            const blurY = (luma(src, left) + luma(src, right) + luma(src, up) + luma(src, down)) * 0.25;
            const edge = centerY - blurY;
            const correction = Math.abs(edge) >= settings.threshold
              ? clamp(edge * settings.amount, -settings.maxDelta, settings.maxDelta)
              : 0;
            dst[out] = clampByte(src[center] + correction);
            dst[out + 1] = clampByte(src[center + 1] + correction);
            dst[out + 2] = clampByte(src[center + 2] + correction);
            dst[out + 3] = src[center + 3];
          }
        }
        targetCtx.putImageData(core, x, y);
        tileIndex++;
        onProgress?.(`Sharpening tile ${tileIndex} of ${total}…`);
        if ((tileIndex & 3) === 0) await new Promise(resolve => requestAnimationFrame(() => resolve()));
      }
    }
  } finally {
    source?.close?.();
    if (sourceCanvas) sourceCanvas.width = sourceCanvas.height = 0;
    scratch.width = scratch.height = 0;
  }

  return { canvas: inputCanvas, applied: true, label: settings.label };
}
