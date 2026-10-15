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

An aligned-size edge-padding experiment and a 32px-context variant improved one controlled motion-blur sample but regressed noisy, sharp and defocused inputs. Neither is wired into the candidate. The local benchmark retained those variants only as rejected research cases; they are not included in this branch.

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
