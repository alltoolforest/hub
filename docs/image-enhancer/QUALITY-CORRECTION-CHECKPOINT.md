# Quality correction checkpoint — 7 October 2026

Continues PR131 at68e171d. The previous audit is historical; this file records the follow-up. No deployment is authorized or performed.

## Confirmed defects and changes

Ablation on the same natural reference isolated false automatic white balance and percentile contrast as the principal compressed/low-resolution fidelity regressions. Near-neutral midtones alone do not establish a lighting cast. White balance now requires consistent evidence in both midtones and highlights. A very narrow intensity range alone no longer triggers strong contrast stretching; it may reflect the photographed scene or missing information.

JPEG cleanup uses native-pixel weak-boundary statistics across all eight grid phases. It requires JPEG input provenance, enough samples, a repeated boundary excess and flat adjacent pixels. Correction is limited to boundary pixels, bounded to four channel levels before a maximum0.75 contribution. Strong edges, transparency, text/artwork mode and non-JPEG grids are protected. Automatic sharpening/saturation/local contrast are reduced where JPEG block evidence is high. This is conservative block cleanup, not recovery of erased details or a dedicated neural deblocking model.

The old noise metric compared output texture energy to noisy input. The new test-only exception is restricted to the known noisy fixture and an otherwise-only-detail-loss finding. It requires improvement toward the known clean reference, local SSIM improvement, strong-edge response/correlation and retained structured-region response. Adversarial flat, blurred and over-sharpened controls must fail. Production artifact/fidelity guards are unchanged; other benchmark cases retain their existing gates.

## Local results

42 numerical/lifecycle tests pass. The actual Chromium photographic-only browser benchmark passes, including the blurred-source Enhance isolation case. Dedicated Deblur is explicitly excluded from this local run; full CI retains the original dedicated Deblur checks. Mode switching/reset, no model requests for Enhance, original dimensions and worker cancellation also pass in Chromium.

Same192x128 browser reference, RGB mean absolute error (lower is closer to the clean reference):

| Case | Source error | Previous candidate output | Corrected output |
| --- | ---: | ---: | ---: |
| Clean |0.00|5.41|0.14|
| Noise |12.03|7.37|6.63|
| Underexposure |42.36|35.68|22.42|
| Overexposure |41.36|36.25|30.67|
| Compression |3.04|6.73|3.00|
| Low resolution |1.81|5.75|1.77|
| Mixed damage |30.61|23.56|23.50|

Noise local SSIM0.399→0.651, strong-edge response0.903, gradient correlation0.776 and structured-region retention91.1%. Compression/low-resolution improvement is small; do not describe it as advanced restoration or established visible phone-editor parity.

## Preserved scope and open gates

The mode UI, dedicated Deblur engine, Upscale function, production safety guard and all unrelated/frozen tool code are preserved. Main enhancer changes only pass input MIME type into the photographic engine. New code/tests are restricted to photographic correction and its validation.

Full CI, integration with current main and broader visual/device acceptance must be recorded after this candidate is published. Physical Android/iOS, phone Auto Enhance comparisons, broad motion/defocus/blurred-face restoration and large mobile deblur remain unverified. This checkpoint fixes reproducible regressions; it does not by itself certify the requested launch quality.

## Verified audit completion

Code candidate **df1f9a92188909b33092a8a30430eb7504a7f672**, tree **c64834bb56b4b8cdebb6f76b32db4482d14d0af5**.

- Pre-deployment workflow37633073437: **PASS**, both Chrome and Firefox/WebKit jobs.
- HEIC/HEIF workflow37633073354: **PASS**, both jobs.
- The formerly failing full quality benchmark now passes with the documented reference-based noise test. Unlike the local photographic-only run, CI also executes the retained dedicated Deblur tests.
- Functional checks passed for mode isolation, no restoration-model requests during Enhance, cancellation, original dimensions, exports, inspection, safety guards, responsiveness, memory retries and compatibility.42 numerical/lifecycle/quality tests passed. Upscale source-function equality and frozen-file hashes passed.
- A12MP synthetic JPEG-grid workload measured2436ms and188MiB host RSS for arithmetic/strip processing. It excludes browser decode, canvas allocation and PNG export; it is not a physical mobile result.
- The user's two photo copies were processed privately for visual review. The night photo shows brighter shadows; the group photo has stronger contrast. Neither observation proves phone-editor parity or recovery of blurred facial detail. No private image was committed or uploaded to CI.

### Deployment assessment

The reproducible enhancement regressions are resolved on the tested benchmark. The image-processing algorithms have not acquired advanced facial reconstruction or verified defocus restoration. The JPEG and low-resolution reference gains are modest. Full product acceptance still requires the requested held-out photo cohorts, a phone Auto Enhance comparison, physical Android/iOS validation and a viable strategy for large mobile Deblur. The existing64-tile mobile Deblur ceiling is unchanged and rejects some ordinary full-resolution phone photos; this is a known limitation, not merely an unrun test.

**Automated pre-deployment audit: PASS. Full launch readiness: NOT YET CERTIFIED.** PR131 remains a draft. No merge, deployment, production audit or freeze was performed. The next work must target those remaining acceptance gaps, not rebuild the completed modes or rerun unchanged UI work without reason.
