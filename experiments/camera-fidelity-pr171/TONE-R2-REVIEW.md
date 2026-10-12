# Photographic-quality continuation: restrained tone trial

2026-10-12. Continues the prior checkpoint; completed Task 0–12 work was not restarted.

**Decision: retain for offline manual review only; reject as the new automatic default.** The active candidate, private comparison Site and production are unchanged. No fine-detail recovery, denoising improvement, phone parity or release acceptance is claimed.

## Finding and implementation

The supplied 1102 × 1470 portrait exposes excessive shadow lifting in a dark, soft photograph with visible print/glare and compression characteristics. The uploaded output raises average encoded luminance from 53.074 to 81.412. Hair becomes brighter with more visible mottling, while eyes and moustache remain soft. Source defects cannot safely be interpreted as missing facial detail.

`candidate/research/tone-r2.js` independently constrains the inherited PR171 tone plan before rendering. Positive corrections use 65% of the original requested lift, capped at 18 encoded-luma levels, 1.35× shadow gain and 30% of remaining highlight headroom. Negative correction is unchanged. These are provisional engineering bounds, not calibrated camera/noise parameters. The monotonic lookup table preserves tonal ordering and endpoints. The trial reuses the existing strip renderer: no additional blur, sharpening, white balance, face reconstruction, geometry changes or final-image blending.

The research module is not imported by the worker, UI or packaging dependency graph. It is intentionally inaccessible through ordinary enhancement options. The exact PR171 core and frozen baseline stay unchanged.

## Evidence

The evaluator reuses and verifies all 13 previously recorded baseline outputs rather than rerunning completed measurements. It renders only the new tone trial on these cases, and a new matched baseline/trial pair for the supplied portrait. The portrait is registered as diagnostic, not held-out or clean ground truth. User photographs and raw pixels are not committed or published.

| Portrait measurement | Original | Uploaded candidate | Matched PR171 baseline | Tone trial |
|---|---:|---:|---:|---:|
| Mean encoded luminance | 53.074 | 81.412 | 81.418 | 67.010 |
| Hair-region mean luminance | 8.021 | 17.471 | 17.444 | 10.775 |
| Hair-region high-frequency RMS | 0.387 | 0.791 | 0.777 | 0.510 |

The trial's brightness increase is 13.937 versus 28.344 for the matched baseline, approximately 51% smaller. Native crops visually retain deeper hair/background tones with less conspicuous grain. Facial geometry has no obvious visual change. Eyes and moustache remain soft; no texture recovery is demonstrated. High-frequency RMS includes real texture, noise, quantization and JPEG/print artifacts; its reduction here is predominantly associated with lower tonal amplification, not proof of better denoising.

Across nine synthetic-degradation reference pairs: RGB MSE improves in four, worsens in three and is unchanged in two. All three worsened cases are deliberately underexposed scenes: astronaut 875.102 → 1305.232, coffee 368.047 → 794.002, chelsea 628.536 → 975.175. This is a material regression in exposure recovery and prevents automatic activation. Small MSE improvements on the other scenes are not visual preference wins.

The matched baseline uses Pillow-decoded RGBA and explicit auto/balanced/auto options. The uploaded candidate's settings and browser decoding are not known, so it is reported separately. Similar measurements do not establish byte identity.

## Verification

- Three new targeted tests pass: monotonic/bounded curve and endpoint/input preservation; graphic bypass and malformed-curve rejection; exact full-frame versus 16/37/96-row strips with preserved alpha, hidden RGB and input data.
- All 14 new trial outputs pass existing catastrophic-integrity guards at native dimensions.
- All 13 retained baseline hashes and declared options match the existing calibration evidence.
- Baseline protection and repository scope check pass before and after work; diff whitespace check passes.
- New PNGs decode at native resolution. Native face, hair and background crops were visually reviewed.

No Android/iOS/browser performance qualification, blinded preference test or phone-editor comparison was added. Only three calibration scenes and one user diagnostic are available. Single-run processing times in the JSON are observations, not benchmarks.

## Reproduction and files

Run `node --test experiments/camera-fidelity-pr171/candidate/tests/tone-r2.test.mjs`.

Run `node experiments/camera-fidelity-pr171/candidate/research/evaluate-tone-r2.mjs CORPUS_JSON RETAINED_BASELINE_DIRECTORY OUTPUT_DIRECTORY`. The corpus uses the existing benchmark schema, with optional observedRaw/observed_sha256 for the separately measured user export. Private output must be outside the repository; held-out inputs are rejected. Obtain private photos from the user's supplied originals, never from this repository.

Changes are confined to this report, `benchmark/TONE-R2-EVIDENCE.json`, the research module/evaluator, its targeted test and the handoff addendum. Reverting these added research files restores the previous research checkpoint; the active engine needs no rollback.

## Next unresolved work

Separately validate noise versus actual hair/fabric structure and fine-detail processing. Establish when exposure correction is warranted without choosing solely from global mean brightness. Do not silently classify every dark image as an old print or override exposure recovery based on this single portrait. Obtain diverse originals and matched phone Auto exports, then held-out/blinded and physical-device evidence before considering promotion. Tasks 1, 3–11 retain their prior incomplete quality/device gates; Task 12 release decision remains NO-GO.

## Research context

Noise-aware tone mapping literature supports investigating the interaction between brightening and visible noise, but does not validate these chosen bounds or establish that a scanned/compressed print follows a raw sensor-noise model. No external implementation or discarded Rocket/Hybrid engine was imported.

- Eilertsen et al., *Real-time noise-aware tone mapping*: https://computergraphics.on.liu.se/rntm/
- Li et al., *Structure-Revealing Low-Light Image Enhancement Via Robust Retinex Model*: https://www.microsoft.com/en-us/research/wp-content/uploads/2018/04/2018-TIP-Structure-Revealing-Low-Light-Image-Enhancement-Via-Robust-Retinex-Model.pdf
