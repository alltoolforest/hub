// NAFNet reconstructs normalized RGB. Small overshoot is legitimate; numerical
// explosions are not. This deliberately loose bound (16x the signal range) is
// a corruption check, not a restoration-strength or photographic-quality gate.
export function validateDeblurOutput(output, width, height) {
  if (!output?.data || output.dims?.length !== 4 ||
      output.dims[0] !== 1 || output.dims[1] !== 3 ||
      output.dims[2] !== height || output.dims[3] !== width ||
      output.data.length !== 3 * width * height) {
    throw new Error('Deblur model returned an unexpected output.');
  }
  for (const value of output.data) {
    if (!Number.isFinite(value) || Math.abs(value) > 16) {
      throw new Error('Deblur model returned unstable pixel values.');
    }
  }
}

// Catastrophic tile changes must be rejected before downsampling, clipping or
// face blending can hide them. These are conservative failure thresholds,
// not proof of recovered detail, identity, or photographic quality.
export function validateDeblurFidelity(result, source, width, height) {
  const plane = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 1024 || height > 1024 || result.length !== plane * 3 || source.length !== plane * 3) {
    throw new Error('Invalid deblur fidelity buffers.');
  }
  // Independent 32px regions catch localized damage hidden by a tile average.
  for (let y = 0; y < height; y += 32) {
    for (let x = 0; x < width; x += 32) {
      let total = 0, extreme = 0, n = 0;
      for (let yy = y; yy < Math.min(y + 32, height); yy++) {
        for (let xx = x; xx < Math.min(x + 32, width); xx++) {
          for (let c = 0; c < 3; c++) {
            const i = c * plane + yy * width + xx;
            if (!Number.isFinite(result[i]) || !Number.isFinite(source[i])) throw new Error('Unstable deblur fidelity input.');
            const delta = Math.abs(Math.max(0, Math.min(1, result[i])) - source[i]);
            total += delta; extreme += delta > 0.5 ? 1 : 0; n++;
          }
        }
      }
      if (total / n > 0.20 || extreme / n > 0.10) {
        throw new Error('Deblur produced excessive local distortion; no restored image was exported.');
      }
    }
  }
}

