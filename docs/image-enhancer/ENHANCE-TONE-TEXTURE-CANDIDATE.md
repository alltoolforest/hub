# Enhance-only tone and texture candidate — 2026-10-08

Status: IMPLEMENTED AND LOCALLY TESTED. Not deployed, not frozen. No claim of twice the quality.

## Checkpoint and scope
Resumed deployed PR151 processing (95831ca). Subsequent rejected restoration experiments remain recorded in ENHANCE-ONLY-RESTORATION-TRIAL.md. No neural model integrated. Only assets/js/image-enhancer-photo.js production code changes. Deblur, Upscale, UI, detector, workers and unrelated tools unchanged. Current main was checked for changes to the three photo pipeline modules: none since the deployed checkpoint.

## Findings and changes
- Full RGB multiplication during exposure lift amplified existing chroma, particularly pink/red skin casts. Separate luminance lift from chroma gain, retaining a quarter of extra chroma gain for Portrait and half for other photographic content. This preserves hue before necessary gamut compression; it does not assume a target complexion or infer the true original color from an old print.
- Hard subtraction of an estimated black point collapsed dark input tones. Replace that subtraction with a smooth toe, retaining shadow distinctions without inventing detail.
- Luminance-only noise analysis missed isolated color noise. Add a bounded 256-bin chroma residual histogram and allow stronger chroma cleanup while preserving the existing face luminance guard and edge range weights. No extra spatial filter pass; neighborhood remains 3x3. No sharpening increase.

## Validation
39/39 automated tests pass across photo numerical tests, worker lifecycle, reference-quality checks, budget tests and fusion tests. Includes three new behavior tests for exposure/chroma separation, monotonic shadow detail, and isolated color-noise removal with protected luminance structure. An initial color-noise test exposed an estimator issue (pooling a quiet channel with a noisy channel hid noise); fixed using the maximum channel residual per sample and retested.

Existing synthetic degradation benchmark, 256x256 natural fixture:
- Underexposure MAE to known reference: 51.873 -> 23.222.
- Added noise MAE: 8.512 -> 4.446.
- JPEG MAE: 1.016 -> 0.987 (small improvement only).
- Clean fixture change MAE: 0.145/255.
These are reference error checks, not a universal perceptual-quality score.

Local Chromium 140, Playwright 1.55, actual module worker + canvas + PNG encode/decode:
- User portrait, 1102x1470: desktop 573ms, mobile emulation 456ms.
- Synthetic smooth 4000x3000 image: desktop 1920ms, mobile emulation 1841ms.
- Output dimensions valid; all four runs exported decodable PNGs.
- Main-thread 25ms heartbeat maximum observed gap 25–27ms.
- Portrait smoke used whole-frame protection to isolate the Enhance pipeline; it did not test the detector.
- Not physical Android/iOS measurements, not texture-heavy 12MP or browser memory profiling.

Offline side-by-side review of two supplied portraits, using identical manually observed face boxes in baseline/candidate (not detector verification):
- Older portrait: visibly less amplified pink/red coloration, brightness improvement retained; original cast and softness remain. No obvious geometric change at inspected display scale, not a biometric identity guarantee.
- Sari portrait: modest tonal difference, dark tones less crushed; fine-pattern JPEG artifacts remain. No meaningful restoration of missing fine detail claimed.
- Color cleanup correctly stays inactive on these samples with low measured chroma noise. It does not conceal their remaining broad compression artifacts.
- User photographs and derived comparison images remain local and are not included in Git or CI.

## Outstanding acceptance gates and risk
Medium visual regression risk: limiting chroma lift can look less vivid in deliberately colorful low-light scenes; smooth toe can make shadows less dramatic; wider cleanup range on chroma-noisy images needs broader texture/skin review. Existing face protection remains, but preservation is not proof of unchanged perceived identity.

Still needed: broader natural-photo comparisons (textured low light, foliage, hair, fabric, multiple skin tones), real Android/iOS verification, Firefox/WebKit checks for this exact candidate, phone Auto Enhance reference where available, and user visual acceptance. This is a focused improvement candidate, not full freeze readiness. No deployment without explicit approval. No claim that browser processing has reached its universal quality ceiling.

Reproduce:
```
node --test tests/image-enhancer-photo.test.mjs tests/image-enhancer-photo-lifecycle.test.mjs tests/image-enhancer-reference-quality.test.mjs tests/image-enhancer-budget.test.mjs tests/image-enhancer-fusion.test.mjs
node tests/image-enhancer-photo-benchmark.mjs
node tests/image-enhancer-photo-browser-smoke.mjs /absolute/path/to/private/input.jpg
```
Browser smoke requires Playwright and Chromium locally; optional private image is served only on localhost. Never add user photos to the repository.
