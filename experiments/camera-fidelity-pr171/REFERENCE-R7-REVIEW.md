# R7: measure and approximate the supplied AI reference's tone/color

2026-10-13. User supplied an AI-generated portrait reference and requested analysis of its values and an attempt to reproduce them in the current non-AI model.

**Result: the fitted color/tone treatment approaches the reference's measured regional appearance. It does not reproduce its fine detail or prove a general engine improvement. This is a single-image offline profile; active R5 processing and deployment are unchanged.**

## Inputs and method

The original portrait is 1102 × 1470; the previously uploaded PR171-based candidate is also 1102 × 1470. The AI reference is 1149 × 1536. The reference file has a PNG filename but its bytes decode as JPEG with an sRGB ICC profile; converting that profile to sRGB produced zero pixel change. No editor slider settings were recovered. Pixel shapes/composition differ, so normalized rectangular skin, shirt, hair and background regions are used for approximate color statistics, not exact pixel registration. The uploaded candidate's source settings are not independently established here; it is the prior PR171-core output used in this conversation, rather than a fresh controlled browser baseline export.

`candidate/research/reference-color-r7.js` fits three independent monotonic RGB curves from those four regional mean-color pairs, with black/white endpoints preserved and slopes constrained to 0.1–2.0. It applies these lookup curves pointwise to the PR171-based input at 75% and 100% strength. There is no resizing of output, denoising, extra sharpening, generative processing, coordinate remapping or transfer of reference pixels/textures. The AI image is resized only in the clearly labeled comparison display, not to generate output.

This is reference grading: the requested warmer skin, pinker shirt and greener background intentionally change color. It is not a universal white-balance correction or a qualified skin-color standard. Independent channel curves can shift hues and can amplify noise. The profile must not be applied automatically to unrelated photographs.

## Measured values

Values below are mean encoded luminance on a 0–255 scale; they are neither exposure stops nor scene-linear radiance.

| Region | Original | Prior PR171-based output | 75% match | Full match | AI reference |
|---|---:|---:|---:|---:|---:|
| Whole image | 53.07 | 81.41 | 93.16 | 97.08 | 94.77 |
| Skin sample | 66.69 | 97.62 | 113.51 | 118.79 | 119.30 |
| Shirt sample | 83.64 | 117.58 | 140.27 | 147.84 | 151.26 |
| Hair sample | 3.71 | 10.20 | 9.88 | 9.71 | 9.55 |
| Background sample | 27.67 | 52.50 | 54.07 | 54.65 | 54.13 |

The AI reference has average RGB approximately [125.27, 86.85, 83.46], versus [105.74, 73.93, 83.86] for the prior output. Skin-region RGB is [171.03, 107.55, 83.38] versus [133.41, 87.87, 88.80]. Thus the target needs warmer foreground colors and a stronger midtone lift while retaining dark hair and similar background brightness; merely increasing global exposure would not reproduce those relationships.

The full-match luminance 5th–95th percentiles are approximately 11.79–158.83, versus 11.87–161.19 in the AI image. These similar distribution values do not establish equivalent detail, identity or naturalness. They are measurements of the fitted grading target, not independent quality validation.

## Visual findings and limits

The full result has warmer skin, a brighter pink shirt and a greener background, visibly closer in tone/color to the reference. The 75% treatment is less strong. Native face crops still show the original softness. The AI image contains much crisper eyes, moustache, hair and fabric, and no comparable bright print glare. Those differences cannot be obtained from tone/color settings alone. The reference may have reconstructed identifying features or texture; it must not be treated as clean ground truth for restoration.

No facial geometry is changed by this pointwise module, but facial RGB/contrast changes and perceptual identity fidelity have not undergone landmark/blinded validation. The underlying original/source-core texture remains. Existing grain and print glare become more conspicuous in some areas after the stronger correction. No missing information is invented or recovered.

## Verification and boundaries

Four targeted tests pass: identity/zero-strength/input preservation; monotonic bounded curves and endpoints; alpha/hidden RGB preservation and pointwise partition equivalence; invalid reference/control rejection. Both new outputs pass catastrophic integrity checks against the original decoded image and independently decode at 1102 × 1470. Default R5 and production files were not edited. Baseline/source scope and diff checks pass.

Code: research curve module and evaluator, targeted test. Evidence: `benchmark/REFERENCE-R7-EVIDENCE.json`, containing measured statistics, numeric anchors, lookup values and hashes without photographs. The private input and generated output pixels remain outside Git. No broader corpus, device/browser performance or clean-reference detail comparison is claimed.

Reproduce with `node --test candidate/tests/reference-color-r7.test.mjs` and `node candidate/research/evaluate-reference-r7.mjs ANALYSIS_JSON OUTPUT_DIRECTORY` from this experiment folder. The analysis JSON contains normalized review rectangles, regional RGB means, input file/raw hashes, dimensions and local RGBA paths for original/base/reference. These images are tuning diagnostics, not held-out acceptance samples.

Next work is to decide whether the requested color/tone appearance is preferable, then test a generalizable control strategy on diverse images. Do not copy this portrait-specific curve into automatic defaults. The photographic-detail and production release gates remain unmet.
