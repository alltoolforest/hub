# Archive V2 isolated phone test

User authorized deployment of the supplied `files (1).zip` into a testing branch on 2026-10-14. This build is isolated from AllToolForest main and Natural R9. It is not frozen or qualified for general release.

The archive's numeric core, wavelet module and worker are preserved byte-exact under `dist/assets/original/`. The default candidate uses the revised core; the engine selector can run either version. The missing `image-enhancer-portrait.js` dependency is taken from PR171 source commit `a672855f9c4047dafe31cd0823cfeb7de2bb04f7`, blob `58a368490eb60d06bfc23753ec475935aa10f45c`. The HTML/CSS/adapter are new test scaffolding, with browser-local upload, original/output comparison, cancellation and native PNG download. No photographs are uploaded to a server.

General photograph uses archive defaults (balanced/auto/standard). Portrait uses strict protection across the whole frame because no face detector is packaged; this still permits changes and is not an exact facial lock. The test accepts decoded images up to 12MP and files up to 50MiB, with a two-minute worker timeout. These are harness limits, not a claim of reliable 12MP behavior on every device.

Known archive issues remain visible: overshoot on synthetic edges; transparent-image strip differences; fine-sharpness off still boosts broader bands; possible texture loss; unverified reported benchmark metrics. The test wrapper checks encoded output dimensions and decode success; this does not detect subtle halos, identity changes, all-black corruption or every damaged image. Failure/cancellation does not export an output. No production acceptance or phone verification claim.

Checks: module syntax passes. Numeric smoke checks pass on the archive's 512x512 original astronaut panel: opaque strip/whole equality, source immutability, native buffer length, real portrait dependency, modules-off and graphic pass-through, exact alpha/hidden RGB, exact supplied engine/worker files. Browser OffscreenCanvas/UI flow is not executed in this environment; manual Android/iOS testing is pending.

Reproduce numeric checks with `node check-core.mjs SOURCE_RGBA_512X512 ARCHIVE_EXTRACT_DIRECTORY`. Keep private photographs outside source control. Buildless static site: publish `dist/`.

Manual checks: upload the same photographs used for R9; compare Balanced and Fidelity; inspect faces, clothing, hair, highlights and halos at native size; download PNG; cancel a running job and rerun; note phone/browser and settings for failures. Inspect transparency separately with an alpha PNG. No freeze after deployment.

## Revision test2 — 2026-10-14

Changes: all-scale sharpness-off; a source-neighborhood bound on added luma detail (denoised base remains allowed); deterministic finite-support alpha handling; alpha-safe noise samples. Tone, vibrance, denoise thresholds and exposure defaults are unchanged. Original V2 remains selectable. No AI or doubled sharpness.

Transparency policy: copy source RGBA inside a 64-pixel square support around nonopaque pixels. This intentionally leaves some opaque boundary pixels unenhanced, potentially most of a small transparent image. An alpha-normalized filter is future work. Additional working storage: one Float32 detail plane (4 bytes per strip pixel), plus a temporary one-byte alpha guard only on transparent strips; existing smoothing scratch is reused.

Tests and settings: `node check-revision.mjs [PRIVATE_FIXTURE_DIRECTORY]`. Fixtures contain cases.json ({name,width,height} array) and NAME.rgba; outputs remain private. Balanced/auto/general, JPEG source, statistics stride 2. These controlled reruns do not claim to reproduce the user's uploaded outputs with unknown settings. Worker statistics sampling can differ. Desktop Node timings are not mobile measurements.

Results are recorded in `evidence/`. The neutral edge overshoot test passes in both orientations (original 72..168; revised 80..160 for source 80..160). Transparent-gap full/strip equivalence at 17/32/96/192 rows, hidden RGB independence, and all-scale sharpness-off identity pass. Both supplied original photos pass native-size, input immutability and full/96-row equivalence. Earlier smoke checks also pass. Visual inspection: modest reduction in harsh edge rendition; old-print softness and color cast persist. No demonstrated detail recovery or general photographic superiority.

Remaining work: noise/texture validation, shadow noise amplification, tonal clipping, actual face regions, broader held-out comparisons and physical Android/iOS testing. Managed-environment Sites instructions require skipping browser QA without the supported browser-control skill; no worker/UI verification is claimed. No freeze or main-site modification.

## Revision test3 — shadow color trial

Preserves test2 byte-exact under `dist/assets/safety/` and original archive under `dist/assets/original/`. All three are selectable. No upscaling. Process unedited originals, not previous enhanced outputs.

Retained change: multiply extra chroma gain and vibrance by smoothstep((processed luma - 8)/56), clamped to 0..1. This restrains added color amplification in shadows and restores prior color treatment by luma 64. It does not alter the luma filtering or tone/exposure curve, or remove blur. Integer RGB rounding can change reconstructed luma by less than one code value on the tested photographs. Colored shadows may look less saturated; this needs user review. No extra working buffers or stronger denoise are introduced.

Rejected experiments: a direct dark-value exposure cap increased background fine variation; coarse-guide residual limiting and stronger fine-band denoising increased the synthetic noisy-vs-clean composite error. These implementations were removed. Their measurements are retained under evidence/rejected-* as research, not acceptance evidence.

Validation: `node check-shadows.mjs PRIVATE_FIXTURE_DIRECTORY` uses the worker's sample stride, strip size and offset scheme. Two original photographs retain native dimensions and full/strip equality. Switching the guard off reproduces test2 exactly. On two deterministic Gaussian-noise shadow patterns (means 12 and 24), composite output error versus independently processed clean patterns decreased about 2%; a mean-100 pattern was unchanged. Clean neutral texture adjacent differences were exactly unchanged. This is a narrow synthetic result, not a real-photo noise-reduction percentage: noisy and clean images each receive automatic analysis and the error includes tone and denoise effects. Real-photo luma differences, samples and single-run desktop timings are in evidence/test3-*. No 32MP/mobile/browser acceptance is claimed.

The old portrait still has blur, colored cast, broad mottling and print glare. This trial is not a demonstrated overall photographic advantage and is not ready for freeze. Physical phone testing, held-out photos, spatial noise confidence and face-specific protection remain pending. Browser QA remains unavailable under the managed Sites workflow; numeric and syntax checks do not substitute for phone verification.
