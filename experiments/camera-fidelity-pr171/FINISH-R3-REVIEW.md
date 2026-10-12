# R3 brightness and contrast finishing experiment

2026-10-12. User requested increasing brightness and contrast while retaining the detail they liked. This continues R2; completed enhancement processing was reused, not rerun.

**Status: two optional offline treatments ready for user review. Not enabled in the worker or deployed. No general photographic superiority or production readiness claimed.**

## What changed

`candidate/research/finish-r3.js` applies a pointwise luminance curve to retained R2 pixels. It performs no new sharpening, smoothing, denoising, resizing, geometry operation or face reconstruction. Tone changes affect the visibility of existing texture; they do not recover lost detail.

Normalized luminance t maps to `t + t*(1-t)*(4*brightness + contrast*(2*t-1))`. Balanced uses brightness .10 / contrast .38; brighter uses .13 / .42. Parameter validation enforces nonnegative controls and `4*brightness + contrast <= .95`, preserving a strictly monotonic curve with black/white endpoints. The midtone slope increases for greater contrast, while the highlight shoulder rolls off. Chroma remains unchanged except for a shared gamut-compression factor when necessary; there is no additional saturation or automatic skin-color target. Semi-transparent pixels and hidden RGB pass through unchanged.

The renderer verifies and reuses the stored R2 hashes. Measurement keeps the supplied original and uploaded candidate distinct: the uploaded candidate is a comparison, not clean ground truth. Only this one original/output pair is available in the current upload directory. Thirteen additional retained calibration/diagnostic cases were used as regression checks.

## Supplied portrait

| Measurement | Previous R2 | R3 balanced | R3 brighter |
|---|---:|---:|---:|
| Mean encoded luminance, 0–255 | 67.010 | 78.553 | 83.282 |
| Luminance p95 minus p05 | 106.024 | 128.024 | 135.024 |
| Fully white pixels | 5 | 5 | 6 |
| Dimensions | 1102 × 1470 | 1102 × 1470 | 1102 × 1470 |

Brighter raises mean luminance approximately 24% and percentile tonal range approximately 27% versus R2. These measure exposure/contrast, not photographic quality or recovered detail. Native face crops and the full brighter output were inspected. Facial proportions show no obvious visual change; the face and clothing are more legible while hair remains dark. Existing softness, reddish cast, print glare and grain remain. One additional white pixel appears in the brighter setting; no claim of zero clipping is made.

## Tests and regressions

- Four targeted tests pass: monotonic tone/endpoints/midtone contrast, pointwise/strip equivalence and input/alpha preservation, neutral/chroma behavior, malformed setting/buffer rejection.
- All 28 outputs (two treatments × 14 cases) pass existing catastrophic-integrity checks. This is not a visual-quality certificate.
- Native PNG output dimensions verified. Seven protected baseline files and repository scope verified before/after work; no active runtime module changed.
- Both settings lower reference RGB MSE on all three synthetically underexposed scenes versus R2. Brighter also lowers it relative to the retained PR171 measurements on those three cases, but this is not a preference or detail-fidelity verdict.
- Applying either setting indiscriminately worsens reference RGB MSE on all six noise/JPEG pairs whose reference exposure was already normal. Therefore these cannot become unconditional automatic defaults. They are explicit brightness/contrast experiments for a requested brighter rendering.

Full numbers and output hashes: `benchmark/FINISH-R3-EVIDENCE.json`. Private photographs remain outside Git. No mobile/browser timing or memory certification was performed. Finishing durations only measure this extra stage, not the entire pipeline.

## Reproduction and boundary

Run `node --test experiments/camera-fidelity-pr171/candidate/tests/finish-r3.test.mjs`.

Run `node experiments/camera-fidelity-pr171/candidate/research/render-finish-r3.mjs CORPUS_JSON R2_DIRECTORY OUTPUT_DIRECTORY`, then `python experiments/camera-fidelity-pr171/candidate/research/measure-finish-r3.py CORPUS_JSON R2_DIRECTORY OUTPUT_DIRECTORY`.

Added files: research module, renderer, measurement script, targeted tests, numeric evidence and this report. The handoff links this checkpoint. PR171, main, frozen tools and the hosted private test page are unchanged. Reverting these research-only additions needs no production rollback. The earlier release NO-GO and outstanding held-out/phone/device gates remain.
