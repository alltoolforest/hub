const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function resolveRegionRestorationPlan(analysis, mode = 'enhance') {
  const confidence = analysis?.diagnosis?.confidence || {};
  const blur = clamp(Number(confidence.blur) || Number(analysis?.blurScore) || 0);
  const noise = clamp(Number(confidence.noise) || Number(analysis?.noise) || 0);
  const compression = clamp(Number(confidence.compression) || Number(analysis?.jpegArtifacts) || 0);
  const underexposure = clamp(Number(confidence.underexposure) || 0);
  const overexposure = clamp(Number(confidence.overexposure) || 0);
  const lowContrast = clamp(Number(confidence.lowContrast) || 0);
  const lowResolution = clamp(Number(confidence.lowResolution) || (analysis?.lowResolution ? 1 : 0));
  const falseResolution = clamp(Number(confidence.falseResolution) || (analysis?.falseResolution ? 1 : 0));
  const badLighting = clamp(Number(confidence.badLighting) || 0);
  const meanLuma = Number(analysis?.exposure?.meanLuma);
  const validMeanLuma = Number.isFinite(meanLuma) ? meanLuma : 128;

  const detailDemand = clamp(
    blur * 0.46 +
    lowResolution * 0.26 +
    falseResolution * 0.18 +
    compression * 0.10
  );
  const cleanupDemand = clamp(noise * 0.68 + compression * 0.32);
  const toneDemand = clamp(Math.max(underexposure, overexposure, lowContrast, badLighting));

  const modeBase = mode === 'upscale' ? 0.88 : mode === 'deblur' ? 0.90 : 0.84;
  // General restoration models can exaggerate sensor noise/JPEG blocks. Keep
  // more photographed source when cleanup, rather than reconstruction, is the
  // dominant need.
  const fidelityAdjustedBase = clamp(
    modeBase - noise * 0.055 - compression * 0.10,
    mode === 'upscale' ? 0.72 : 0.68,
    modeBase
  );
  const darkBias = clamp((108 - validMeanLuma) / 78);
  const brightBias = clamp((validMeanLuma - 150) / 78);
  const exposureGain = clamp(
    1 + darkBias * 0.30 - brightBias * 0.20,
    0.80,
    1.30
  );
  const exposureOffset = clamp(
    darkBias * 4.5 - brightBias * 3.5,
    -3.5,
    4.5
  );
  const denoiseStrength = clamp(noise * 0.24 + compression * 0.08, 0, 0.24);
  const smoothRetention = clamp(
    (mode === 'upscale' ? 0.16 : 0.20) +
    noise * 0.12 +
    compression * 0.08,
    0.14,
    0.36
  );

  return Object.freeze({
    version: 1,
    mode,
    blur,
    noise,
    compression,
    underexposure,
    overexposure,
    lowContrast,
    lowResolution,
    falseResolution,
    badLighting,
    detailDemand,
    cleanupDemand,
    toneDemand,
    processedBase: fidelityAdjustedBase,
    smoothRetention,
    meanLuma: validMeanLuma,
    exposureGain,
    exposureOffset,
    denoiseStrength,
    maxEdgeBoost: clamp(2.5 + detailDemand * 5.5, 2.5, 8),
    shadowLift: clamp(underexposure * 10, 0, 10),
    highlightCompression: clamp(overexposure * 8, 0, 8),
    contrastGain: clamp(lowContrast * 0.035, 0, 0.035)
  });
}

export function classifyRestorationRegion(sourceEdge, sourceResidual, faceLimit = 1) {
  const structure = clamp((Number(sourceEdge) - 1.5) / 18);
  const texture = clamp((Number(sourceResidual) - 0.8) / 12);
  const faceProtected = Number(faceLimit) < 0.999;
  const detail = Math.max(structure, texture);
  return Object.freeze({
    faceProtected,
    structure,
    texture,
    detail,
    smooth: 1 - detail
  });
}

export function resolveRegionProcessedWeight({
  sourceEdge,
  sourceResidual,
  deviation,
  faceLimit = 1,
  plan
}) {
  const region = classifyRestorationRegion(sourceEdge, sourceResidual, faceLimit);
  const safePlan = plan || resolveRegionRestorationPlan(null);
  const deviationPenalty = clamp((Number(deviation) - 4) / 34);
  const cleanupDetailPenalty = safePlan.cleanupDemand * region.detail * 0.08;
  let weight =
    safePlan.processedBase +
    region.detail * (0.08 + safePlan.detailDemand * 0.06) -
    region.smooth * safePlan.smoothRetention * deviationPenalty -
    safePlan.cleanupDemand * region.smooth * 0.05 -
    cleanupDetailPenalty;

  if (region.faceProtected) {
    weight = Math.min(weight, clamp(Number(faceLimit), 0.5, 1));
  }

  return clamp(weight, 0.54, 0.98);
}

export function resolveRegionEdgeBoost({
  sourceEdge,
  resultEdge,
  faceLimit = 1,
  plan
}) {
  const safePlan = plan || resolveRegionRestorationPlan(null);
  if (Number(faceLimit) < 0.999) return 0;

  const structure = clamp((Number(sourceEdge) - 2) / 20);
  const recovered = clamp((Number(resultEdge) - Number(sourceEdge)) / 20);
  const missing = clamp((Number(sourceEdge) - Number(resultEdge)) / 16);
  const confidence = clamp(
    structure * 0.72 +
    missing * 0.26 -
    recovered * 0.12
  );

  return clamp(
    confidence * safePlan.detailDemand * (1 - safePlan.cleanupDemand * 0.70),
    0,
    1
  );
}
