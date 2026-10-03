const SAMPLE_MAX_SIDE = 256;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function sampleRgba(image, width, height) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
  if (!ctx) throw new Error('Fidelity sampling canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0;
  return data;
}

function luma(data, offset) {
  return data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
}

function metricsFor(data, width, height, mask = null) {
  let edge = 0;
  let texture = 0;
  let edgeCount = 0;
  let textureCount = 0;
  let clipped = 0;
  let pixels = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (mask && !mask[index]) continue;
      const center = index * 4;
      const left = center - 4;
      const right = center + 4;
      const up = center - width * 4;
      const down = center + width * 4;
      const cy = luma(data, center);

      edge += Math.abs(cy - luma(data, right)) + Math.abs(cy - luma(data, down));
      edgeCount += 2;

      const neighbour = (
        luma(data, left) +
        luma(data, right) +
        luma(data, up) +
        luma(data, down)
      ) * 0.25;
      texture += Math.abs(cy - neighbour);
      textureCount++;

      if (cy <= 4 || cy >= 251) clipped++;
      pixels++;
    }
  }

  return {
    edge: edgeCount ? edge / edgeCount : 0,
    texture: textureCount ? texture / textureCount : 0,
    clippedFraction: pixels ? clipped / pixels : 0,
    pixels
  };
}

function buildFaceMask(faces, sourceWidth, sourceHeight, sampleWidth, sampleHeight) {
  if (!faces?.length || !sourceWidth || !sourceHeight) return null;
  const mask = new Uint8Array(sampleWidth * sampleHeight);
  let marked = 0;

  for (const face of faces) {
    const expandX = face.width * 0.12;
    const expandY = face.height * 0.12;
    const x0 = Math.max(0, Math.floor((face.x - expandX) / sourceWidth * sampleWidth));
    const y0 = Math.max(0, Math.floor((face.y - expandY) / sourceHeight * sampleHeight));
    const x1 = Math.min(sampleWidth, Math.ceil((face.x + face.width + expandX) / sourceWidth * sampleWidth));
    const y1 = Math.min(sampleHeight, Math.ceil((face.y + face.height + expandY) / sourceHeight * sampleHeight));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * sampleWidth + x;
        if (!mask[i]) {
          mask[i] = 1;
          marked++;
        }
      }
    }
  }

  return marked >= 16 ? mask : null;
}

function maeBetween(source, result, mask = null) {
  let sum = 0;
  let count = 0;
  const pixels = Math.min(source.length, result.length) / 4;
  for (let i = 0; i < pixels; i++) {
    if (mask && !mask[i]) continue;
    const p = i * 4;
    sum += Math.abs(luma(source, p) - luma(result, p));
    count++;
  }
  return count ? sum / count : 0;
}

function thresholds(mode, degradation = null) {
  const confidence = degradation?.diagnosis?.confidence || {};
  const compression = clamp(Math.max(
    Number(confidence.compression) || 0,
    Number(degradation?.jpegArtifacts) || 0
  ));
  const noise = clamp(Math.max(
    Number(confidence.noise) || 0,
    Number(degradation?.noise) || 0
  ));
  const artifactSensitivity = clamp(compression * 2.5 + noise * 0.45);

  let base;
  if (mode === 'deblur') {
    base = { globalMae: 34, faceMae: 24, edgeInflation: 1.78, textureInflation: 1.88, detailFloor: 0.72 };
  } else if (mode === 'upscale') {
    base = { globalMae: 36, faceMae: 25, edgeInflation: 1.82, textureInflation: 1.92, detailFloor: 0.70 };
  } else {
    base = { globalMae: 30, faceMae: 22, edgeInflation: 1.72, textureInflation: 1.82, detailFloor: 0.74 };
  }

  return {
    ...base,
    compression,
    noise,
    artifactSensitivity,
    edgeInflationStart: clamp(1.28 - artifactSensitivity * 0.24, 1.04, 1.28),
    textureInflationStart: clamp(1.30 - artifactSensitivity * 0.32, 1.04, 1.30),
    edgeInflation: Math.max(1.18, base.edgeInflation - artifactSensitivity * 0.68),
    textureInflation: Math.max(1.20, base.textureInflation - artifactSensitivity * 0.80)
  };
}

export function analyzeArtifactFidelity(sourceImage, resultImage, faces = [], mode = 'enhance', degradation = null) {
  if (!sourceImage?.width || !sourceImage?.height || !resultImage?.width || !resultImage?.height) {
    throw new Error('Artifact/fidelity analysis requires valid source and result dimensions.');
  }

  const scale = Math.min(
    1,
    SAMPLE_MAX_SIDE / Math.max(resultImage.width, resultImage.height)
  );
  const width = Math.max(32, Math.round(resultImage.width * scale));
  const height = Math.max(32, Math.round(resultImage.height * scale));

  const source = sampleRgba(sourceImage, width, height);
  const result = sampleRgba(resultImage, width, height);
  const sourceMetrics = metricsFor(source, width, height);
  const resultMetrics = metricsFor(result, width, height);
  const faceMask = buildFaceMask(
    faces,
    sourceImage.width,
    sourceImage.height,
    width,
    height
  );
  const sourceFace = faceMask ? metricsFor(source, width, height, faceMask) : null;
  const resultFace = faceMask ? metricsFor(result, width, height, faceMask) : null;

  const globalMae = maeBetween(source, result);
  const faceMae = faceMask ? maeBetween(source, result, faceMask) : 0;
  const edgeRatio = sourceMetrics.edge > 0.001 ? resultMetrics.edge / sourceMetrics.edge : 1;
  const textureRatio = sourceMetrics.texture > 0.001 ? resultMetrics.texture / sourceMetrics.texture : 1;
  const faceEdgeRatio = sourceFace?.edge > 0.001 ? resultFace.edge / sourceFace.edge : 1;
  const faceTextureRatio = sourceFace?.texture > 0.001 ? resultFace.texture / sourceFace.texture : 1;
  const clippingIncrease = Math.max(0, resultMetrics.clippedFraction - sourceMetrics.clippedFraction);
  const limit = thresholds(mode, degradation);

  const globalDeviationRisk = clamp((globalMae - limit.globalMae * 0.65) / (limit.globalMae * 0.65));
  const faceDeviationRisk = faceMask
    ? clamp((faceMae - limit.faceMae * 0.65) / (limit.faceMae * 0.65))
    : 0;
  const edgeInflationRisk = clamp(
    (edgeRatio - limit.edgeInflationStart) /
    Math.max(0.08, limit.edgeInflation - limit.edgeInflationStart)
  );
  const textureInflationRisk = clamp(
    (textureRatio - limit.textureInflationStart) /
    Math.max(0.08, limit.textureInflation - limit.textureInflationStart)
  );
  const faceInflationRisk = faceMask
    ? Math.max(
        clamp((faceEdgeRatio - 1.22) / 0.50),
        clamp((faceTextureRatio - 1.25) / 0.55)
      )
    : 0;
  const clippingRisk = clamp(clippingIncrease / 0.07);
  const detailLossRisk = clamp((limit.detailFloor - Math.min(edgeRatio, textureRatio)) / 0.28);

  const riskComponents = [
    globalDeviationRisk * 0.82,
    faceDeviationRisk,
    edgeInflationRisk * 0.92,
    textureInflationRisk,
    faceInflationRisk,
    clippingRisk * 0.90,
    detailLossRisk
  ];
  const risk = clamp(Math.max(...riskComponents));
  const meanRisk = riskComponents.reduce((sum, value) => sum + value, 0) / riskComponents.length;
  // Severity intentionally remains unsaturated so progressive safety stages can
  // still be ranked when more than one artifact class has already reached risk 1.
  const severity = risk + meanRisk * 0.35;

  const reasons = [];
  if (faceDeviationRisk >= 0.58) reasons.push('face deviation');
  if (faceInflationRisk >= 0.58) reasons.push('face texture inflation');
  if (textureInflationRisk >= 0.62) reasons.push('texture inflation');
  if (edgeInflationRisk >= 0.68) reasons.push('edge/halo inflation');
  if (clippingRisk >= 0.65) reasons.push('highlight/shadow clipping');
  if (detailLossRisk >= 0.58) reasons.push('detail loss');
  if (globalDeviationRisk >= 0.78) reasons.push('excessive global deviation');

  return Object.freeze({
    mode,
    risk,
    severity,
    safe: risk < 0.58,
    reasons: Object.freeze(reasons),
    globalMae,
    faceMae,
    edgeRatio,
    textureRatio,
    faceEdgeRatio,
    faceTextureRatio,
    clippingIncrease,
    detailRatio: Math.min(edgeRatio, textureRatio),
    artifactSensitivity: limit.artifactSensitivity,
    sampleWidth: width,
    sampleHeight: height
  });
}

function blendCandidate(sourceImage, processedImage, processedAlpha) {
  const canvas = makeCanvas(processedImage.width, processedImage.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Progressive recovery canvas is unavailable.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = clamp(processedAlpha);
  ctx.drawImage(processedImage, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  return canvas;
}

export async function applyArtifactFidelityGuard({
  canvas,
  sourceImage,
  faces = [],
  mode = 'enhance',
  degradation = null,
  signal,
  onStage
}) {
  if (!canvas || !sourceImage) return { canvas, applied: false, stages: 0, analysis: null };
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');

  const initial = analyzeArtifactFidelity(sourceImage, canvas, faces, mode, degradation);
  if (initial.safe) {
    return { canvas, applied: false, stages: 0, analysis: initial };
  }

  // The final zero-alpha stage is an absolute trust fallback: if every
  // progressively weaker restoration still fails the fidelity gate, return a
  // source-faithful rendering rather than expose an artifacted reconstruction.
  const alphas = mode === 'deblur'
    ? [0.88, 0.74, 0.60, 0.46, 0.32, 0]
    : mode === 'upscale'
      ? [0.90, 0.76, 0.62, 0.48, 0.34, 0]
      : [0.84, 0.68, 0.52, 0.38, 0.24, 0];

  let bestCanvas = canvas;
  let bestAnalysis = initial;
  let stages = 0;

  for (const alpha of alphas) {
    if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError');
    stages++;
    onStage?.(stages, alpha, bestAnalysis);

    const candidate = blendCandidate(sourceImage, canvas, alpha);
    const analysis = analyzeArtifactFidelity(sourceImage, candidate, faces, mode, degradation);

    if (
      analysis.safe ||
      analysis.severity + 0.012 < bestAnalysis.severity ||
      (
        Math.abs(analysis.severity - bestAnalysis.severity) <= 0.012 &&
        analysis.faceMae + 0.5 < bestAnalysis.faceMae
      )
    ) {
      if (bestCanvas !== canvas) bestCanvas.width = bestCanvas.height = 0;
      bestCanvas = candidate;
      bestAnalysis = analysis;
    } else {
      candidate.width = candidate.height = 0;
    }

    if (bestAnalysis.safe) break;
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  if (bestCanvas !== canvas) {
    canvas.width = canvas.height = 0;
  }

  return {
    canvas: bestCanvas,
    applied: bestCanvas !== canvas,
    stages,
    analysis: bestAnalysis,
    initialAnalysis: initial
  };
}
