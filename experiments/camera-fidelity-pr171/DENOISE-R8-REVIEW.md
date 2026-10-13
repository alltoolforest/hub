# R8: reduced-noise R7 review candidate and freeze decision

2026-10-13. User requested noise control on the full R7 match and a visible result for a possible freeze.

**Result: medium cleanup is the preferred review candidate for this portrait. Freeze decision: NO-GO for automatic/general-purpose production.** This is offline experimental work; the active R5 worker/UI, production, PR171 and frozen tools are unchanged. The portrait-specific R7 curves are not general image-enhancement defaults.

## Implementation

`candidate/research/denoise-r8.js` performs bounded 5×5 bilateral cleanup in luminance and two chroma components before applying R7's RGB curves. Luma/color similarity and spatial weights preserve edges; a local-variance and coherence heuristic reduces filtering on structured regions. This is independently implemented conventional processing, not AI or non-local means.

Three fixed research strengths are compared. Cleanup is weaker inside the manually annotated face region: luminance mixing is multiplied by .4 and chroma by .65. Luminance correction is capped at ±1.5 pre-curve levels there (±4 outside); individual red/blue chroma correction is capped at ±5. Common gamut compression avoids independent channel clipping. Faces are not pixel-exact after denoising; natural-mark and identity preservation remain acceptance concerns. No automatic detector is introduced.

The filter uses 96-row strips with two halo rows. Source arrays, decoded alpha and hidden RGB are preserved; no coordinate changes or resizing occur. The processing starts from the earlier PR171-core output, which already contains its default processing. No additional sharpening is performed. The cleaned pixels then receive the same full R7 reference grading.

## Portrait findings

Full output and native face, hair, background and fabric regions were inspected. Medium cleanup reduces conspicuous grain while retaining the warmer reference colors. It does not recover missing detail or remove large print glare. Strong cleanup is smoother, but fine surface texture is more at risk. Facial softness remains.

| Region | R7 high-frequency RMS | Low | Medium | Strong |
|---|---:|---:|---:|---:|
| Face crop | 1.0198 | 1.0192 | 0.9876 | 0.9395 |
| Hair | 0.8184 | 0.7826 | 0.6878 | 0.6218 |
| Background | 0.9398 | 0.8753 | 0.7068 | 0.6076 |
| Fabric | 0.8960 | 0.8371 | 0.7086 | 0.6363 |

For medium, these decrease about 3.2%, 16.0%, 24.8% and 20.9% respectively. RMS includes true texture and quantization/artifacts, so these are not certified noise-reduction percentages or quality scores. Mean encoded luminance stays approximately 97.08–97.09, retaining the R7 tonal appearance. Native output remains 1102 × 1470.

## Verification and trade-off

- Four targeted tests pass: lower synthetic flat-color error and exact constant colors; preservation of a hard step and isolated dark mark; exact strip partitions, input/alpha/hidden RGB preservation; invalid inputs reject. A syntax error in the first local draft was corrected before successful evaluation.
- Three portrait outputs and 18 noise/JPEG calibration outputs pass catastrophic integrity checks (21 outputs). PNGs independently decode at native dimensions.
- All strengths lower reference RGB MSE on all six noise/JPEG cases. Medium noise cases: astronaut 33.23 → 28.26, coffee 30.84 → 25.54, chelsea 54.63 → 49.16. JPEG gains are smaller. These three small independent scenes are not held-out photographic preference evidence.
- Additional clean/blur tests compare 27 outputs (three strengths × three clean + six synthetic-blur cases). Each strength worsens RGB MSE on all six blur cases and two of three clean cases; the changes are small, but stronger cleanup generally increases gradient error. This prevents unconditional application. The extra texture checks are reference comparisons, not additional encoded/browser integrity runs.

Evidence: `benchmark/DENOISE-R8-EVIDENCE.json`. No private photograph or raw pixels are committed. Runtime observations are Node-only; they do not qualify mobile performance, real browser codecs, memory, export or native 32MP operation.

## Reproduction

- `node --test candidate/tests/denoise-r8.test.mjs`
- `node candidate/research/evaluate-r8.mjs R7_FIT_JSON CALIBRATION_CORPUS_JSON OUTPUT_DIRECTORY`
- `node candidate/research/check-texture-r8.mjs CALIBRATION_CORPUS_JSON TEXTURE_REPORT_JSON`

Run from the experiment directory. R7 fit input retains original/base raw paths/hashes and the fitted numeric curves. Reference images themselves are not used as clean restoration ground truth.

## Remaining freeze gates

1. Manual review of the supplied medium/strong results and existing detail, natural marks and color appearance.
2. Integration/verification of any selected optional noise treatment in the development interface; R8 is currently offline.
3. Reliable decisions about when cleanup should apply; existing heuristics still smooth some real texture.
4. Diverse held-out originals and matched phone-editor comparisons. Prior ≥70% blinded preference target remains unmeasured.
5. Browser and physical Android/iOS/desktop verification, including cancellation, repeated-job memory and native-size downloads.
6. Pre-deployment audit, separate production authorization and the remaining protected release sequence.

A good-looking single portrait does not satisfy these gates. Retain medium as a reviewable optional treatment, not a frozen universal engine.
