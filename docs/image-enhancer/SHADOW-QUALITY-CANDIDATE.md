# Enhance mixed-light shadow correction — 2026-10-09

Status: implemented candidate, not deployed and not frozen. Baseline is deployed PR165 (`a17605e52f9efc6fd71385368cac0247c9070254`). Failed ML cleanup remains outside the product.

## Confirmed problem and change
A bright background can push the mean luminance above the engine's overexposure threshold, causing global darkening of an already-dark foreground. The current candidate adds a bounded tone correction only when the histogram contains substantial dark and bright groups with a midtone valley. The correction does not target a particular complexion or synthesize detail.

- Estimate shadow noise separately using a fixed 256-bin histogram from the existing analysis pass.
- Require significant dark and bright populations, wide tonal range, and sufficient scene brightness before considering shadow lift. Continuous confidence avoids a hard activation threshold.
- Reduce or disable lift when shadow noise is high; do not brighten absolute black.
- Apply a smooth shadow adjustment of at most 16 luminance levels before the existing strength control. Relax erroneous global darkening in proportion to that correction.
- Keep existing color-gain restraint, face protection, noise cleanup, sharpening and spatial processing unchanged. No extra image filtering pass, model download or infrastructure.

Production code changes only `assets/js/image-enhancer-photo.js`. Tests extend `tests/image-enhancer-photo.test.mjs`, with an optional offline comparison runner `tests/image-enhancer-photo-shadow-benchmark.mjs`. Deblur, Upscale, UI, worker lifecycle, frozen tools and shared site files are untouched.

## Quality evidence
44/44 local numerical, lifecycle, reference, budget and fusion tests passed. Five new tests cover mixed-light foreground improvement, noisy-shadow suppression, excluded scenes/graphics, monotonic tone curves, and bounded skin-color amplification. A first color test expected a six-level gain despite partial confidence; it was corrected to require a smaller positive gain plus color preservation, rather than increasing processing strength merely to meet that assertion.

36 baseline/candidate comparisons: 17 public natural images as originals and with synthetic mixed-exposure degradation, plus two supplied portraits at native dimensions. Synthetic degradation lowers existing darker tones without resampling. It is not a substitute for real backlit-photo validation.

- Six of 17 degraded cases activate the new correction; all six reduce error against the enhanced clean reference. Eleven are unchanged because evidence is insufficient.
- Three of 17 original public images receive slight correction: mean absolute differences versus deployed output of 0.349, 0.940 and 0.060 out of 255. Fourteen are unchanged.
- Both supplied portraits are byte-identical in the comparison. This candidate does not solve their residual compression or softness and is not represented as twice the quality.
- Example paired reference MAE: baby 18.991 -> 14.288; butterfly 21.177 -> 18.304; woman 17.014 -> 15.827. These are error measurements, not perceptual quality percentages.
- Side-by-side review shows better dark fabric/shadow visibility in selected simulated cases. No added reconstruction or stronger sharpening. No claim of biometric identity verification.
- Existing natural-fixture benchmark remains unchanged: underexposure MAE 51.873 -> 23.222; noise 8.512 -> 4.446; JPEG 1.016 -> 0.987; clean-image change 0.145.

Private portrait comparisons used whole-frame protection to isolate tone behavior, not face-detector verification. User images and derived images remain outside Git; saved JSON contains only metrics and generic private identifiers.

## Browser/performance evidence
Local Chromium worker + canvas + PNG export passed on desktop and mobile emulation:
- 1102x1470 supplied image: 545–577ms.
- Synthetic 4000x3000 image: 2625–2645ms.
- Heartbeat maximum gaps: 26–34ms; output dimensions and decoding valid.
These timings do not establish physical Android/Windows performance. A subsequent matched baseline/candidate check is recorded below.

## Remaining risks and decision
The histogram recognizes a tonal distribution, not photographic intent. It can gently lift intentionally dramatic lighting. High-noise shadows are conservatively skipped; missing/clipped detail cannot be recovered. This is a narrow exposure correction, not a completed broad quality upgrade or a substitute for better compression restoration. Real mixed-light photos and physical phone/manual verification are still needed before freeze. No deployment without explicit approval after the pre-deployment report.

Reproduce local tests with:
```
node --test tests/image-enhancer-photo.test.mjs tests/image-enhancer-photo-lifecycle.test.mjs tests/image-enhancer-reference-quality.test.mjs tests/image-enhancer-budget.test.mjs tests/image-enhancer-fusion.test.mjs
PHOTO_QA_OUTPUT=/external/output node tests/image-enhancer-photo-shadow-benchmark.mjs /external/input1.png /external/input2.jpg
node tests/image-enhancer-photo-browser-smoke.mjs /external/private-photo.jpg
```

## Matched performance check
Repeated the existing browser smoke against the same synthetic 12MP input in baseline/candidate/candidate/baseline order, with a fresh browser per run. The localhost server served the immutable PR165 module for baseline and the candidate module otherwise; all other files and browser settings were identical. Each run included desktop and mobile emulation.

- Baseline: 1849, 1962, 1970, 1865ms (median 1913.5ms).
- Candidate: 1907, 1838, 1889, 1881ms (median 1885ms).
- All output dimensions and PNG decoding passed; heartbeat gaps 25–28ms.
- No material slowdown observed in this small matched sample; this is not evidence of a speedup or physical-phone performance. The earlier 2.6s observation was not reproduced as a candidate-specific regression.
- Data: `SHADOW-PERFORMANCE-RESULTS.json`.
