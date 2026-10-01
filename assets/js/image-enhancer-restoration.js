const SAMPLE_SIDE = 320;

function canvas(width, height) {
  const node = document.createElement('canvas');
  node.width = Math.max(1, Math.round(width));
  node.height = Math.max(1, Math.round(height));
  return node;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
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

  return { lapVariance, gradient, noise, blockingRatio };
}

export async function analyzeSourceImage(image, file) {
  const metrics = analyzeGray(sampleImage(image));
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
  if (!findings.length) findings.push('generally clean source');

  return Object.freeze({
    ...metrics,
    softness,
    noise,
    jpegArtifacts,
    lowDetail,
    lowResolution,
    falseResolution,
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

  if (profile === 'fidelity') {
    return Object.freeze({
      id: 'fidelity',
      label: 'Fidelity',
      preclean: analysis?.noise > 0.72 ? 0.06 : 0,
      aiBlend: scaleFactor === 1 ? 0.68 : 0.80,
      disclosure: 'Fidelity-focused AI restoration with source-detail blending.'
    });
  }
  if (profile === 'recovery') {
    return Object.freeze({
      id: 'recovery',
      label: 'Recovery',
      preclean: analysis?.noise > 0.48 || analysis?.jpegArtifacts > 0.55 ? 0.12 : 0.04,
      aiBlend: 1,
      disclosure: 'Recovery-focused AI reconstruction; some fine detail may be reconstructed.'
    });
  }
  return Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    preclean: analysis?.noise > 0.62 || analysis?.jpegArtifacts > 0.62 ? 0.08 : 0,
    aiBlend: scaleFactor === 1 ? 0.84 : 0.92,
    disclosure: 'Balanced AI restoration with conservative source-detail blending.'
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
