// NAFNet-only normalized RGB contract. Never guess range from image content.
export function unpackDeblurPixels(values, paddedWidth, paddedHeight, width, height) {
  validateSize(paddedWidth, paddedHeight);
  validateSize(width, height);
  if (width > paddedWidth || height > paddedHeight || values.length !== 3 * paddedWidth * paddedHeight) {
    throw new Error('Invalid deblur output buffer.');
  }
  // Inspect all channels, including the cropped padding, before exporting.
  for (const value of values) {
    if (!Number.isFinite(value) || Math.abs(value) > 16) throw new Error('Unstable deblur output.');
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  const plane = paddedWidth * paddedHeight;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * paddedWidth + x, p = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) rgba[p + c] = Math.round(Math.max(0, Math.min(1, values[c * plane + i])) * 255);
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

function validateSize(width, height) {
  // These buffers belong to bounded inference tiles, never whole photographs.
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024) {
    throw new Error('Invalid deblur tile dimensions.');
  }
}
