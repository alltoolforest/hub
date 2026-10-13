# R9: selective cleanup and coordinated tone on five supplied photographs

2026-10-13. **Offline review candidate; not accepted for freeze or production.** R5 UI/worker, PR171, main and frozen tools are unchanged. User authorized improving the experiment and inspecting new outputs.

## Changes

`candidate/research/selective-r9.js` introduces a conservative chroma-speckle treatment and two tone finishes, natural/brighter. It does not use R7's single-portrait RGB curves. It is not optical deconvolution, AI restoration or a qualified sensor-noise estimator.

Cleanup estimates chroma residuals in sampled low-luminance-range neighborhoods. It requires at least 64 samples and estimated sigma >=2, then treats only isolated chroma outliers in low-luminance-range 3x3 neighborhoods. Corrections are capped at three channel-component levels; no standalone luminance denoising is performed. Manual face rectangles exclude cleanup entirely. Sigma can underestimate spatially correlated JPEG/print noise; a zero estimate is not proof of no noise. The stage uses 96-row strips with one halo row and preserves alpha/hidden RGB.

Tone uses PR171's luminance output as a bounded guide, with lower influence on brighter sources and a smooth midtone lift. It retains the source's chroma rather than importing PR171 white-balance/color changes. The guide includes PR171 spatial processing, so this is not a claim of texture-exact output. Natural/brighter are research settings, not a proven automatic exposure classifier; image mean cannot establish scene intent. Black/white endpoints and existing saturated highlights are preserved. A channel-headroom limit avoids adding white clipping or compressing chroma simply to brighten pixels. No extra sharpening, resizing, face reconstruction or coordinate changes.

The first draft added highlight-channel clipping on several sources. That draft was rejected; the headroom limit was added and all five outputs regenerated. One intermediate portrait PNG was truncated; it was regenerated, and the final renderer now writes each native output through a temporary file and checks decoded RGBA byte equality. This was an artifact-export correction, not browser codec qualification.

## Supplied photographs and findings

| Diagnostic | Native resolution | Original mean Y | PR171 | Natural | Brighter |
|---|---:|---:|---:|---:|---:|
| Existing print portrait |1102x1470|53.07|81.42|84.78|87.22|
| Existing everyday photo |864x1536|155.03|151.28|158.02|160.93|
| New plaid-shirt portrait |717x721|134.97|134.79|139.12|142.44|
| New outdoor portrait |452x678|121.88|120.29|125.95|129.51|
| New event portrait |250x375|98.91|99.15|103.23|106.42|

Means are encoded luminance, not exposure stops or quality scores. Compared with PR171, the everyday/outdoor versions avoid its average darkening; the new portraits have modest midtone changes. Natural is the conservative review choice; brighter is supplied as an alternative, not a universal improvement. Full images and native face crops were inspected. No demonstrated recovery of fine facial features, print glare or missing detail. Original print color cast and luminance grain remain; R9 does not reproduce R7/R8's warmer reference grading. The small event image remains 250x375, with no upscaling claim.

Cleanup changed **zero pixels on all five supplied photographs** because the estimate did not exceed its activation threshold. These comparisons therefore demonstrate tone behavior only, not successful denoising of these photographs. Do not describe them as noise-free or texture restoration.

## Verification

- Five targeted tests pass: constant/low-noise preservation; isolated color-speckle reduction and face/dark-mark protection; strip partition and alpha/hidden RGB equality; neutral tone ordering/endpoints/input validation; colored-highlight headroom and chroma preservation.
- Twenty supplied-photo variants (including originals and PR171 controls) plus 18 isolated-cleanup calibration outputs pass catastrophic integrity checks.
- Twenty final PNGs decode at native dimensions with exact RGBA equality to their raw output arrays. Comparison panels are native side-by-side; overview is explicitly a resized display.
- Final natural/brighter variants add **zero clipped-high channels** relative to the five original decoded photographs. This does not establish overall highlight fidelity or visual quality.
- Isolated cleanup slightly lowers reference MSE on all three synthetic Gaussian-noise cases: deltas approximately -0.0593, -0.0243, -0.0134. It leaves all three clean, three JPEG, three underexposure and six blurred cases byte-exact. Thus earlier cleanup regressions are avoided on these cases by withholding most processing. The small noise gains are not a strong photographic advantage.
- Calibration does **not** qualify the full tone pipeline, clean real skin/texture preservation, automatic face detection, real optical blur, 32MP processing, browser export or Android/iOS performance.
- Protected baseline/source hashes and `git diff --check` pass. Private photograph pixels and raw files remain outside Git.

Evidence: `benchmark/SELECTIVE-R9-EVIDENCE.json`. These new photographs were inspected during development and cannot subsequently be described as untouched held-out samples.

## Reproduction and freeze decision

Run `node --test candidate/tests/selective-r9.test.mjs`, then `node candidate/research/evaluate-r9.mjs USER_INPUTS_JSON CALIBRATION_CORPUS_JSON OUTPUT_DIRECTORY` and `python candidate/research/render-r9.py OUTPUT_DIRECTORY` from this experiment directory. User input JSON contains dimensions, source/raw hashes, local RGBA paths and manual face rectangles. The renderer requires that input JSON copied to OUTPUT_DIRECTORY/inputs.json.

**NO-GO for freezing the general-purpose tool.** Manual review of these outputs can select a tone preference. Freeze additionally requires demonstrable advantage on diverse held-out originals and phone-editor pairs, reliable region/noise/face decisions, integration and browser/device qualification, pre-deployment audit, explicit production authorization, production audit/manual verification/regression. Preserve PR171 fallback. No candidate was promoted from this test.
