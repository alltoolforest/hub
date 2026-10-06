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
