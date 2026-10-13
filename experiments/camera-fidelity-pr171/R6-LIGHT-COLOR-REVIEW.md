# R6 isolated tests: Brilliance, Vibrance and increased sharpening

2026-10-13. User approved continuing the proposed isolated comparisons. The active R5 worker, UI and default processing were not modified. No deployment.

**Decision: Brilliance is worth further optional tone exploration. Vibrance is visually subtle at restrained strength. Do not double sharpening as an automatic default. None demonstrates a consistent photographic advantage.**

## Recovery and scope

Workspace maintenance removed the local checkout, raw images and intermediate outputs. The exact R5 branch at `e4f88777c89ca3168b3ef592d48dd7c105e0627a` was recovered from GitHub. The user's original JPEG, uploaded candidate PNG and saved R3 brighter PNG were recovered as unchanged files. Three public calibration images were recovered from the recorded URLs and verified against source hashes. This rebuilding was required for new comparisons, not a restart of completed engineering work. All 13 regenerated PR171 calibration outputs match their prior retained hashes.

Tests use one user portrait diagnostic, three public calibration scenes with original/noise/underexposure/JPEG variants, one alpha diagnostic, and six Gaussian-blur variants (Pillow encoded-RGB radii 0.8 and 1.6). Total: 20 cases, 120 separate outputs. This is only four independent photographs, with no held-out or phone-editor preference evidence.

## Tested techniques

`candidate/research/light-color-r6.js` independently prototypes Brilliance with a monotonic piecewise-linear luminance curve: deep blacks unchanged, bounded midtone lifting, highlight restraint and up to one additional local-contrast level. Amount .5 was tested. Extra local contrast is excluded from annotated face rectangles; face tone may change. Chroma is retained except for common gamut compression. It is not Apple's algorithm and cannot recover clipped highlights or missing detail.

Vibrance applies at most 5% extra chroma scaling, prioritizing less-saturated colors. Annotated face rectangles are unchanged; warm/red-dominant colors receive only 15% of the remaining boost. This warm-color heuristic is not a skin detector. Amount 1 was tested. It is not Adobe's algorithm. Eight-bit rounding means some colors show no change even when the floating-point calculation differs.

Sharpening tests multiply the **PR171 sharpening amount**, once, by 1, 1.25, 1.5 and 2. Radius, local-contrast settings, noise thresholds and the existing ±3 sharpening-term limit remain fixed. Extra face exclusion with a 12-pixel feather restores baseline pixels inside supplied rectangles. This is not doubling R4's broad clarity band or applying two sharpening passes. R5's JPEG detail-withholding policy is unchanged because these tests are offline only.

## Supplied portrait

| Variant | Mean luminance | Pixels changed versus PR171 | High-frequency RMS |
|---|---:|---:|---:|
| PR171 / sharpening 1× | 81.418 | 0 | 1.0605 |
| Brilliance only | 85.723 | 1,514,502 | 1.0708 |
| Vibrance only | 81.416 | 11,447 | 1.0602 |
| Sharpening 1.25× | 81.418 | 10,237 | 1.0709 |
| Sharpening 1.5× | 81.418 | 17,833 | 1.0810 |
| Sharpening 2× | 81.418 | 27,841 | 1.1000 |

Full image and native shirt crops were inspected. Brilliance has the clearest tonal effect but no demonstrated fine-detail recovery. Vibrance is barely visible at this restraint. Stronger sharpening produces small clothing-edge changes; it does not turn the portrait into a focused camera original. The 2× result changes only about 1.72% of pixels and raises high-frequency RMS about 3.73%. RMS mixes real texture and artifacts, so the increase is not a sharpness/quality score. The annotated face is deliberately unchanged in the sharpening and Vibrance comparisons. No facial detail improvement is claimed from these protected trials.

Brilliance does not add new clipped-high channels on this portrait compared with the baseline (34). Each stronger sharpening variant adds one additional clipped-high channel (35). These are channel counts, not white-pixel counts.

## Regression findings

- Brilliance lowers reference RGB MSE on all three underexposure cases but increases it on all six noise/JPEG cases and all six controlled blur cases. Tone mismatch contributes to these errors. This rejects unconditional application; it is not proof of preference or detail loss in each case.
- Vibrance produces tiny mixed reference changes and lacks a persuasive visible gain on the portrait. Retain as research, not a newly qualified color engine.
- Each stronger sharpening amount slightly lowers reference MSE on all six controlled blur cases. Each also increases it on all six noise/JPEG cases. Doubling is not a dependable automatic improvement, even with the original cap and face protection.
- Four targeted tests pass for curve monotonicity/endpoints/deep blacks, neutral and alpha/hidden RGB preservation, protected face/color behavior, and malformed inputs. All 120 outputs pass catastrophic integrity checks. These guards do not certify naturalness or subtle halo safety.

Full numeric evidence and output hashes: `benchmark/R6-LIGHT-COLOR-EVIDENCE.json`. Private photographs and raw pixels remain outside Git.

## Reproduction and next decision

Use the existing `benchmark/prepare.py` on the recorded public source images. Add the user original as a diagnostic with native decoded RGBA/hash, and six encoded-RGB GaussianBlur cases referencing the original clean calibration files. Then run:

- `node --test experiments/camera-fidelity-pr171/candidate/tests/light-color-r6.test.mjs`
- `node experiments/camera-fidelity-pr171/candidate/research/evaluate-r6.mjs CORPUS_JSON OUTPUT_DIRECTORY`

The evaluator rejects held-out tuning inputs and unknown scene identities and writes private output pixels outside the repository. Manual face rectangles are recorded, not detector outputs. Brilliance/Vibrance are full-image offline prototypes; they are not memory-qualified strip implementations for 32MP browser use.

R5 remains the development interface and default baseline. Future optional Brilliance would need coordinated tone controls to avoid stacking exposure changes; stronger sharpening would need better real-image degradation gating. No combination was promoted because individual regression gates remain unmet. Browser/mobile, broader held-out photographs, phone-editor pairs and blinded quality acceptance remain pending. Production release remains NO-GO.
