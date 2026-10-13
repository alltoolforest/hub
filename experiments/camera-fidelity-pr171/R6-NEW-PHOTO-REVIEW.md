# New everyday-photo diagnostic, without increased sharpening

2026-10-13. User supplied `1000133453.jpg` and explicitly excluded double sharpness. No increased sharpening level was tested at all.

The original local attachment is preserved. Native decoded dimensions are 864 × 1536. Source JPEG SHA256: `d49c9ee91a4b7daa270e4702b71d7ed14e37108e5bd8e1711853da6738166971`.

Five outputs were evaluated: original; PR171 Auto/balanced/default sharpness; Brilliance amount .5 over PR171; Vibrance amount 1 over PR171; and Brilliance .5 plus mild Vibrance .5. Only the existing PR171 default sharpening is present. R4 extra detail and 1.25×/1.5×/2× sharpening are not invoked. No runtime/UI or production change.

New-stage manual face rectangles cover both subjects. Vibrance leaves those regions unchanged relative to its input. Brilliance applies its tone curve there but excludes its extra local-contrast term. Baseline PR171 uses its unchanged default protection behavior; no face detector is claimed.

## Findings

Full original and native faces/fabric crops were inspected. The source already contains usable facial and clothing detail. Brilliance makes the face midtones slightly lighter and restrains highlights. Vibrance is visually subtle. The combined treatment gives modest tonal polish; it does not demonstrate meaningfully better hair, facial or fabric detail than PR171. No obvious geometric/feature changes are visible, but this is not a landmark or identity-validation study.

| Output | Mean luminance change from original | New clipped-high channels from original |
|---|---:|---:|
| PR171 | -3.752 | 312 |
| Brilliance | -2.353 | 217 |
| Vibrance | -3.755 | 355 |
| Combined | -2.352 | 217 |

Channel-clipping counts are not white-pixel counts or quality scores. There is no clean reference or phone-editor comparison. PR171 darkens the image slightly overall; Brilliance reduces that darkening, rather than universally brightening every pixel. No resolution increase or missing-detail recovery is claimed.

All five outputs pass catastrophic integrity checks, including native dimensions and decoded alpha. The source pixel hash is unchanged. Color management, real browser codec behavior and physical-device use were not newly qualified. The image is a diagnostic example and must not later be counted as an untuned held-out sample.

Evidence: `benchmark/R6-NEW-PHOTO-EVIDENCE.json`. Reproduce with `node candidate/research/evaluate-user-photo-r6.mjs INPUT_JSON OUTPUT_DIRECTORY` from this experiment folder. The input JSON has decoded raw RGBA path/hash, dimensions, original file hash and explicit reviewed face rectangles. Photographs and outputs remain outside Git.

Decision: review Brilliance or the mild combination as optional tone treatments. Do not label this a photographic-detail upgrade. R5 default and production release decision remain unchanged.
