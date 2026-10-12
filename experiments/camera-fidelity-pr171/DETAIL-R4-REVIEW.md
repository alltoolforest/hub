# R4: source-guided photographic definition experiment

2026-10-12. User requested implementing techniques for photographic clarity and definition. Work continues from R3, without rerunning the retained enhancement pipeline.

**Decision: retain an opt-in offline sharpening stage for further evaluation. Not accepted as an automatic upgrade; no deployment or production change.**

## Implemented technique

`candidate/research/detail-r4.js` combines two-scale luminance unsharp masking with structure-tensor edge confidence calculated from the original decoded photo. Fine and broader detail bands use separable binomial kernels. The fine band has a noise dead zone. The coarse band fades near strong boundaries. Total changes are limited to ±4 byte levels per channel and constrained by neighboring luminance and RGB gamut. The added luminance adjustment is common to RGB, avoiding intentional hue rotation.

This is independently implemented non-generative filtering. It is not AI reconstruction, optical deconvolution, face recovery, Local Laplacian filtering or a reproduction of WLS filtering. No Rocket/Hybrid implementation was reused. Multi-scale edge-aware processing research informed the separation of scale and boundary control, not a claim that the published methods have been implemented in full.

Actual face regions in these known diagnostic scenes are explicitly annotated. This new detail stage leaves each annotated rectangle pixel-exact relative to its input, with a 12-pixel outer feather. It refuses execution without explicit face-review acknowledgment. The runner rejects unknown scene IDs. These are manual diagnostic annotations, NOT an automatic face detector or a guarantee for arbitrary uploads. No claim that facial pixels match the original unenhanced photograph: R3 already changes tone.

The strip stage needs four halo rows and uses bounded width × strip-height arrays. Output alpha and hidden RGB are preserved. Neighbors containing transparency suppress the detail stage. Mobile memory and performance are not qualified.

## Supplied photo and validation

The user portrait was processed from retained R3 brighter pixels, using the original JPEG-decoded pixels as structural guidance. The new stage changes 6,621 of 1,619,940 pixels (about 0.41%), with a maximum four-level change and zero changed pixels in the annotated face rectangle. Native shirt/hair crops were reviewed. Clothing edge definition changes subtly; dark hair is nearly unchanged. Existing facial softness remains deliberately unresolved. This is not a transformation into a newly captured camera image.

Four targeted tests pass: a synthetic soft edge has a narrower interpolated 20–80% transition without overshoot; flat/hard-step/high-noise uncertain test cases remain unchanged; full-image and 16/31-row strip outputs match with preserved alpha/input/face pixels; malformed/unreviewed inputs reject. An initial two-pixel center-slope assertion did not detect the improvement due to byte quantization; inspection showed changes at the edge shoulders. The test now measures the interpolated transition width, and this correction did not change filter parameters.

27 outputs pass catastrophic integrity checks: 13 retained baseline cases and 14 retained R3 brighter cases. The portrait had no cached baseline in the first directory, so only its R3 case was processed. Completed baseline/R3 outputs were hash-verified and reused. All annotated face interiors remain unchanged by R4.

## Quality evidence and limits

The first nine degraded-reference comparisons on top of PR171 show RGB MSE improvement in three underexposure cases and worsening in all six noise/JPEG cases. Gradient MAE improves in only one of nine. These results reject indiscriminate automatic sharpening and show why brightness-error changes cannot be called detail recovery.

Separately, six controlled softness tests were added: three existing calibration originals Gaussian-blurred in encoded RGB using Pillow radii 0.8 and 1.6. R4 processes only these blurred inputs, with no tone change. Reference RGB MSE decreases in all six by approximately 4.0–15.9%. These tests demonstrate useful behavior for synthetic mild softness, not held-out photographic preference, facial restoration, real optical blur recovery or phone-editor parity. They do not override the noise/JPEG regressions.

Both source coherence and the fixed/global noise floors remain heuristics. Structured JPEG boundaries or print artifacts can still pass them. The R3 branch uses a conservative fixed 1.5 noise floor; the baseline branch uses retained PR171 noise estimates. These choices are recorded in evidence, not claimed to be calibrated noise intelligence.

Evidence: `benchmark/DETAIL-R4-EVIDENCE.json`. Source images, private photos and rendered outputs remain outside Git. No new browser, Android/iOS, 32MP memory, genuine face-detector or blinded comparison qualification was performed.

## Reproduction and remaining work

- `node --test experiments/camera-fidelity-pr171/candidate/tests/detail-r4.test.mjs`
- `node experiments/camera-fidelity-pr171/candidate/research/render-detail-r4.mjs CORPUS_JSON BASELINE_DIRECTORY R3_DIRECTORY OUTPUT_DIRECTORY`
- `node experiments/camera-fidelity-pr171/candidate/research/evaluate-softness-r4.mjs SOFTNESS_CORPUS_JSON REPORT_JSON`

The softness corpus contains raw RGBA paths/hashes, clean reference paths/hashes, dimensions and reviewed face rectangles. Its generator is Pillow GaussianBlur on encoded RGB, radii 0.8/1.6, with RGBA output. The three original calibration scene identities are astronaut, coffee and chelsea. Reserve any future held-out photos from this tuning process.

Next gates are reliable real-image softness/noise/JPEG discrimination, qualified face protection, broader held-out photo/phone comparisons, and device verification. Keep this stage offline until those gates justify wider use. The hosted lab, active worker, PR171 and frozen tools remain unchanged. Reverting these research additions needs no production rollback.

Research context: [Edge-Preserving Decompositions for Multi-Scale Tone and Detail Manipulation](https://www.microsoft.com/en-us/research/publication/edge-preserving-decompositions-for-multi-scale-tone-and-detail-manipulation/) and [Local Laplacian Filters](https://people.csail.mit.edu/sparis/publi/2011/siggraph/). Neither external implementation was imported.
