# Deblur quality checkpoint — 2026-10-15

Status: experimental, not deployed, not frozen. No claim of consistent photographic superiority.

Baseline: alltoolforest/hub main e2bf00e6e4794d24bca74717d8e162943589d325.
Branch: experiment/deblur-quality-20261015.

## Findings and changes

The existing deblur pipeline uses the checksum-pinned NAFNet GoPro width32 FP16 ONNX model, 24px context around cropped tiles, region/face-aware blending, and a final 256px-side artifact assessment. It is separate from the approved photographic enhancer.

1. Shared tensor conversion guessed the numeric range from sampled maximum values: >2 switched the multiplier from 255 to 1. A normalized overshoot could darken a whole tile. Added a deblur-specific normalized conversion path, full finite-value checks and local clipping. Upscale conversion remains unchanged.
2. Existing numerical bounds allowed finite but severely distorted results. Added checks against source pixels in native 32px regions before clipping/blending: reject mean absolute RGB deviation >0.20 or >10% of channel samples changing by >0.5. This is a conservative catastrophic-distortion gate, not an identity or quality guarantee. False rejections on severe but valid restoration remain possible and require broader validation.
3. Runtime-owned output data are copied before worker transfer, then tensors are disposed in finally. Failure produces no exported result. Face limits, blend weights, model, tile sizes, and enhancement settings are unchanged.

## Rejected experiment

An aligned-size edge-padding experiment and a 32px-context variant improved one controlled motion-blur sample but regressed noisy, sharp and defocused inputs. Neither is wired into the candidate. The benchmark script retains those variants only as explicitly rejected research cases.

## Evidence and limits

Exact model SHA256 verified: 05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204.

Partial ONNX Runtime CPU results on a 285x397 resized event photograph with synthetic degradations, before face blending/final guards:

| Case | Input PSNR | Existing raw model PSNR | Edge-padded raw model PSNR |
| --- | ---: | ---: | ---: |
| Motion | 20.80 dB | 23.81 dB | 24.52 dB |
| Defocus | 24.76 dB | 9.40 dB | 8.87 dB |
| Blur + noise | 27.97 dB | 24.34 dB | 18.79 dB |
| Already sharp | exact reference | 36.70 dB | 16.85 dB |

The baseline defocus output was visually inspected and showed severe colored grid-like corruption. The new gate rejected that saved result, while accepting the saved baseline motion/noise/sharp outputs. Accepting an output does not establish improvement: the noise example still worsened. These are partial single-photo CPU measurements, not end-to-end browser measurements or a representative held-out corpus. They do not prove the deployed WASM backend has the same failure frequency. Original source photographs may already contain softness; controlled blur tests measure recovery toward the available reference, not an ideal camera ground truth.

Automatic approval review stopped the benchmark because ONNX Runtime attempted an external Microsoft telemetry connection. Calling disable_telemetry_events() did not resolve the block. Further model runs were stopped. The payload was not established as metadata-only; do not retry or bypass this restriction without resolving authorization/safety. No user photographs or model binaries are included in this branch.

## Verification

- PASS: normalized overshoot reproducer; malformed dimensions and buffers; NaN/Infinity/extreme values; crop bounds.
- PASS: six mocked inference scenarios (valid, local corruption, nonfinite, dimensions, cancellation, conversion failure), with both input/output tensor disposal and blocked conversion on invalid output.
- PASS: synthetic edge recovery accepted; localized catastrophic distortion rejected.
- PASS: modified JavaScript syntax checks.
- PASS: existing V2 main adapter lifecycle suite (mocked), including HEIC and message decoding.
- NOT RUN: complete model corpus, candidate end-to-end browser execution, Android/iOS, native-resolution timing and device-memory validation.

## Next checkpoint

Resolve model execution telemetry restriction, reproduce actual WASM results, then benchmark motion, defocus, noisy blur and already-sharp inputs independently. Retain source when recovery is unreliable; do not weaken face protection to increase apparent sharpness. Evaluate model/backend stability before blend tuning. Only provide a phone test deployment after the candidate passes those checks. Production deployment and freeze are not authorized by this checkpoint.


## Checkpoint 2 — completed after telemetry authorization

The user explicitly approved the previously blocked runtime connection. Model benchmarking resumed successfully. No further permission is needed for that authorized benchmark connection.

Completed comparisons: eight controlled inputs (two photographs × motion blur, Gaussian defocus, blur plus noise, and already-sharp reference). Inputs were also quantized to 8-bit RGB to match browser canvas packing. Full-precision arithmetic conversion, edge padding, larger cores and larger context margins were investigated. None produced a consistent advantage, so none were adopted.

A WebAssembly numerical probe using onnxruntime-web 1.30.0 (Node host, single thread, no browser UI) reproduced the failure on a 176×176 defocus tile: output range approximately -13.55 to 11.04, mean absolute raw deviation 1.67. The old absolute-value bound of 16 could accept it. The motion probe stayed approximately -0.049 to 1.025, with mean deviation 0.034. This strengthens the reason for local distortion checks but does not replace end-to-end mobile testing.

### Implemented bounded fallback

When a model tile raises DeblurDistortionError, discard the entire learned result and release its model session. Reprocess the original whole frame in a worker using four regularized luminance residual-backprojection iterations. This is a mild isotropic-blur assumption, not an estimated motion kernel. Correction is gated by local structure/high-frequency residual and limited to ±12/255. It adds no model-generated content. It can still alter texture and must pass the unchanged face blend and final fidelity guard. Unexpected dimensions, unrelated errors and cancellation do not silently trigger fallback.

Process 256px cores with 9px overlap; temporary numerical buffers remain tile-bounded. Source/output bitmaps and canvases still scale with image size. A 120-second fallback deadline and task-level yields support cancellation. The final status truthfully identifies conservative blur reduction when used. No mixed learned/fallback tile boundaries are exported.

| Controlled defocus case | Input PSNR | Raw fallback PSNR | Gain |
| --- | ---: | ---: | ---: |
| Event photo | 24.76 dB | 25.71 dB | +0.95 dB |
| Print photo | 39.93 dB | 40.44 dB | +0.52 dB |

These numbers are for the fallback before face blending/final safety processing. They are not end-to-end candidate scores. On already-sharp images the fallback changes pixels and does not improve the exact reference, so it is not applied as a blanket enhancement. Motion recovery remains with the existing model when its output passes checks. Noise cases can still pass a corruption gate while losing fidelity; the gate is not a quality estimator.

### Additional verification

PASS: fallback whole-image/tiled numerical equivalence (541×319; maximum difference zero), flat black/gray/white invariance, source immutability, correction bounds, finite output, invalid-source rejection. PASS: whole-frame fallback routing, cancellation, malformed model rejection and fallback-failure propagation. PASS: actual worker dispatch with pixel-only canvas mocks, 285×271 output equivalence, bitmap cleanup, mid-job cancellation and subsequent rerun. Existing conversion and inference cleanup tests remain passing.

Not yet verified: real browser canvas execution, Android/iOS performance, face identity review, representative held-out native-resolution photographs, latency when the last model tile fails, and final output quality after all protection passes. Model failure late in processing may cause a full extra image pass; that cost must be measured before release.

Next step: prepare an isolated phone comparison deployment after browser integration checks. Do not promote or freeze this experiment based on these limited measurements. Main and the approved V2 photographic enhancer remain unchanged.
