# Tasks 4/5 dependency and deblur investigation — 5 October 2026

Continued from PR #120 81eb3221efaa65fc7ac27b1339a5e99203ec9549, with user
approval to take ownership of Tasks 4/5 and dependencies. No later task work.

## Findings and decision

Eighteen synthetic motion/defocus/mixed cases on six source photographs compared
existing NAFNet deblur against WDN cleanup followed by that same deblur. Captured
raw reconstruction, unchanged PR #117 worker fusion, and unchanged final guard.
This is not the complete production finishing pipeline or a production baseline
quality score. No photographic acceptance claim is made.

Cleanup before deblur gave lower final RGB MAE in 11 cases, higher in 6, tied in 1.
All six motion-only cases worsened. It helped all six defocus cases relative to the
existing deblur comparator, but some still worsened relative to the input. Five
mixed cases improved relative to the comparator and one tied. These results reject
unconditional cleanup stacking. They do not select a defocus or mixed-damage route.

One aircraft/city input became a colored grid after cleanup then deblur. Raw error
rose to 133.307 (0–255 RGB MAE), and the unchanged final guard accepted a blend
still at 34.827 versus input error 11.814. Reproduced with the same pinned artifact
in native ORT 1.22.1 CPU and ORT Web 1.30 WASM: outputs agree to within one rounded
byte, mean absolute byte difference <0.0001. Unclipped output ranges from -114.875
to 278.5; 99.24% of channel samples are outside [0,1]. Original PyTorch parity and
root cause within the converted network remain unverified. Do not blame only WASM
or treat the current final guard as a guarantee against every numerical failure.

## Minimal application safety fix

`image-enhancer-deblur-validation.js` checks exact NCHW RGB shape, sample length,
finiteness and gross numerical explosion before clipping to display bytes.
Absolute values >16 are rejected (a deliberately broad corruption bound, not a
texture/identity acceptance threshold). Ordinary small reconstruction overshoot
is accepted. This is not a complete artifact detector.

`OnnxDeblurEngine.inferTile` invokes this check before worker bitmap conversion;
its existing error path handles rejection. It now releases input/output tensors
on success, failed inference, rejection, cancellation and failed conversion. No
restoration weights, fusion ceiling, final-guard threshold or protected UI changed.
Existing fallback remains local enhancement; it is not claimed byte-identical.
The test runner deliberately continues the rejected diagnostic output solely to
preserve before-fix evidence; the application does not convert that output.

## Verification

- PASS: 18 paired diagnostic comparisons, source hashes and dimension checks.
- PASS: isolated failure reproduces; validator rejects corrupted actual output
  and accepts direct deblur on the same input.
- PASS: 26 tests (7 output-validation/actual-engine lifecycle, 4 existing face
  fusion, 3 bounded-cleanup job, 12 orchestration).
- BLOCKED locally: Playwright Chromium binary unavailable. CI audit is configured
  for this stacked PR as well as main, with the new validation test included.
- Pending: exact-commit browser audit, full held-out quality, physical devices,
  user phone-editor comparison, and model route selection/conversion closure.

## Reproduce

Use Node, native canvas and ORT Web dependencies from the cleanup README. Fixtures
are the earlier two public development photos plus NASA intake IDs 081/084/088/097.
These four were visually inspected for suitability and their source records
reviewed. They contain lettering/logos and are private development examples, not
text-safe outputs or marketing assets. No acceptance admission, demographic labels,
or blanket consent is inferred. NASA source policy was rechecked:
https://www.nasa.gov/nasa-brand-center/images-and-media/
Photos and weights are not committed.

```sh
node tests/image-enhancer-deblur-trial/run.mjs /private/trial /private/nasa-intake /private/nafnet.onnx /private/wdn.onnx /absolute/onnxruntime-web /private/order-trial
# Optional final argument isolates the reproduced failure without rerunning all:
# nasa-088:motion
python tests/image-enhancer-deblur-trial/compare_runtime.py /private/nafnet.onnx /private/failure /private/runtime.json
node --test tests/image-enhancer-deblur-trial/validation.test.mjs tests/image-enhancer-fusion.test.mjs tests/image-enhancer-cleanup/bounded-job.test.mjs tests/image-enhancer-orchestration/orchestrator.test.mjs
```

Native comparison uses Python 3.12, numpy, Pillow and onnxruntime 1.22.1. Native
canvas is only a serial shim around the unchanged worker arithmetic, not proof of
browser OffscreenCanvas/worker transfer/cancellation behavior. Artificial motion
uses a horizontal five-sample box; defocus uses a radius-two disk. No severe-input
quality, identity or real-camera-degradation pass is claimed.

## Status and ownership

Task 4 remains partial: selected cleanup integration and category acceptance open.
Task 5 has begun with comparative evidence and a confirmed numerical-safety fix;
stronger motion/defocus routes and acceptance remain open. Tasks 6–12 untouched.
Engineering/model/provenance work remains assistant-owned. User input is needed
for their final phone-editor comparison; inaccessible physical hardware requires
real device evidence. The prior request for the user to review all 93 source
records is not a prerequisite for further engineering work.

Regression risk: application deblur now rejects grossly unstable outputs and
releases tensors deterministically; browser audits must verify worker transfers
and inference. No deployment or freeze is implied by a branch commit.

## CI baseline isolation correction

The first Task 1 harness run on 150593f failed its old whole-branch production
diff assertion: later-task safety changes were being treated as Task 1 baseline
mutations. The harness now checks out immutable PR #117 separately, overlays only
benchmark test files, and retains the production-diff assertion there. The current
candidate still receives the separate full enhancer audit. No quality threshold
or original baseline changed; baseline and candidate results remain distinct.

## Precision hypothesis tested

The existing graph contains 666 FP16 initializers. A local diagnostic promoted
those values, corresponding value-info and casts to FP32 and passed ONNX checker.
Native ORT still produced the same failure (range -114.843 to 278.469, raw error
133.302). Merely changing arithmetic precision does not repair this case. This
experiment cannot recover the original full-precision training weights and does
not rule out damage from earlier weight rounding or another export/model issue.
Do not replace the 36 MB artifact with the 70 MB promoted graph: it adds size
without fixing the reproduced failure. No derived weights are committed.
`precision_probe.py` reproduces this check using the same two captured model inputs;
`precision-results.json` pins the derived hash and observed values.
