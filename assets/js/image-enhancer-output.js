function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Enter a valid ${label}.`);
  return number;
}

function optionalPositive(value, label) {
  if (value == null || String(value).trim() === '') return null;
  return finitePositive(value, label);
}

function roundDimension(value) {
  return Math.max(1, Math.round(value));
}

function fitAspect(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (targetWidth && targetHeight) {
    const factor = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    return { width: roundDimension(sourceWidth * factor), height: roundDimension(sourceHeight * factor) };
  }
  if (targetWidth) {
    const factor = targetWidth / sourceWidth;
    return { width: roundDimension(targetWidth), height: roundDimension(sourceHeight * factor) };
  }
  if (targetHeight) {
    const factor = targetHeight / sourceHeight;
    return { width: roundDimension(sourceWidth * factor), height: roundDimension(targetHeight) };
  }
  throw new Error('Enter a target width or height.');
}

export function safeOutputDimensions(image, width, height, caps) {
  const targetWidth = roundDimension(finitePositive(width, 'output width'));
  const targetHeight = roundDimension(finitePositive(height, 'output height'));
  const pixels = targetWidth * targetHeight;
  const maxSide = Number(caps?.maxSide) || 8192;
  const maxPixels = Number(caps?.maxPixels) || 8e6;

  if (targetWidth > maxSide || targetHeight > maxSide || pixels > maxPixels) {
    const sourceWidth = Number(image?.width) || targetWidth;
    const sourceHeight = Number(image?.height) || targetHeight;
    const sideScale = Math.min(maxSide / sourceWidth, maxSide / sourceHeight);
    const pixelScale = Math.sqrt(maxPixels / Math.max(1, sourceWidth * sourceHeight));
    const maxScale = Math.max(0.01, Math.min(sideScale, pixelScale));
    const safeWidth = Math.max(1, Math.floor(sourceWidth * maxScale));
    const safeHeight = Math.max(1, Math.floor(sourceHeight * maxScale));
    throw new Error(`This output is too large for the current safety limit. Maximum safe output is about ${safeWidth.toLocaleString()} × ${safeHeight.toLocaleString()} pixels.`);
  }

  return { width: targetWidth, height: targetHeight, pixels };
}

export function resolveOutputTarget({
  image,
  caps,
  mode = 'scale',
  scale = 2,
  width = '',
  height = '',
  longestEdge = '',
  lockAspect = true,
  printWidth = '',
  printHeight = '',
  printUnit = 'in',
  ppi = 300
}) {
  if (!image?.width || !image?.height) throw new Error('Open an image first.');
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  let target;
  let detail;

  if (mode === 'scale') {
    const factor = finitePositive(scale, 'scale');
    target = { width: roundDimension(sourceWidth * factor), height: roundDimension(sourceHeight * factor) };
    detail = `${factor}× scale`;
  } else if (mode === 'dimensions') {
    const requestedWidth = optionalPositive(width, 'target width');
    const requestedHeight = optionalPositive(height, 'target height');
    if (lockAspect) {
      target = fitAspect(sourceWidth, sourceHeight, requestedWidth, requestedHeight);
      detail = 'custom dimensions · aspect ratio locked';
    } else {
      if (!requestedWidth || !requestedHeight) throw new Error('Enter both target width and height when aspect ratio is unlocked.');
      target = { width: roundDimension(requestedWidth), height: roundDimension(requestedHeight) };
      detail = 'custom dimensions · aspect ratio unlocked';
    }
  } else if (mode === 'longest-edge') {
    const edge = finitePositive(longestEdge, 'longest edge');
    const factor = edge / Math.max(sourceWidth, sourceHeight);
    target = { width: roundDimension(sourceWidth * factor), height: roundDimension(sourceHeight * factor) };
    detail = `${roundDimension(edge).toLocaleString()} px longest edge`;
  } else if (mode === 'print') {
    const targetPpi = finitePositive(ppi, 'PPI');
    if (targetPpi < 36 || targetPpi > 1200) throw new Error('Enter a target PPI between 36 and 1200.');
    const requestedWidth = optionalPositive(printWidth, 'print width');
    const requestedHeight = optionalPositive(printHeight, 'print height');
    if (!requestedWidth && !requestedHeight) throw new Error('Enter a print width or height.');
    const unitFactor = printUnit === 'cm' ? 1 / 2.54 : 1;
    const pixelWidth = requestedWidth ? requestedWidth * unitFactor * targetPpi : null;
    const pixelHeight = requestedHeight ? requestedHeight * unitFactor * targetPpi : null;
    target = fitAspect(sourceWidth, sourceHeight, pixelWidth, pixelHeight);
    detail = `print target · ${targetPpi} PPI · aspect ratio locked`;
  } else {
    throw new Error('Choose a valid output sizing mode.');
  }

  const safe = safeOutputDimensions(image, target.width, target.height, caps);
  const scaleX = safe.width / sourceWidth;
  const scaleY = safe.height / sourceHeight;
  const effectiveScale = Math.max(scaleX, scaleY);
  if (effectiveScale < 0.999) {
    throw new Error('The requested output is smaller than the source. Use an image resize tool for downscaling; this tool is focused on enhancement and upscaling.');
  }

  const sourceMP = sourceWidth * sourceHeight / 1e6;
  const outputMP = safe.pixels / 1e6;
  return Object.freeze({
    ...safe,
    scaleX,
    scaleY,
    effectiveScale,
    mode,
    detail,
    sourceMP,
    outputMP,
    aspectPreserved: Math.abs(scaleX - scaleY) < 0.001,
    printNote: mode === 'print' ? 'PPI is used to calculate required pixel dimensions; changing PPI metadata alone does not create detail.' : ''
  });
}

export function outputSizingOptions() {
  return [
    ['scale', 'Scale multiplier'],
    ['dimensions', 'Custom width / height'],
    ['longest-edge', 'Longest edge'],
    ['print', 'Print size / PPI']
  ];
}
