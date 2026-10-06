# Deblur investigation — current checkpoint 6 October 2026

## Current result (supersedes the historical padding experiment)

The runner now sends native image dimensions, matching the application. The model
performs its own zero padding. The earlier runner added replicated-edge padding;
its aircraft-grid failure is not evidence of that failure on the normal application
input. Historical reports below are retained for traceability, not acceptance.

`native-ordering-results.json` records 18 corrected comparisons on six sources.
Two paths failed the existing numerical validator: mixed astronaut after cleanup,
and mixed NASA 081 with direct deblur. Their post-guard outputs are retained only
as diagnostic failure evidence, and excluded from comparative success counts.
Of 16 pairs with both paths numerically admitted, cleanup gave lower final RGB MAE
in 9 and higher in 7; all six motion-only cases worsened. Numerical admission and
lower MAE are neither visual acceptance nor evidence of identity preservation.

`original-checkpoint-results.json` compares the authors’ original GoPro width32
checkpoint with the current ONNX on the two exact mixed-portrait inputs. The
original also becomes unstable after cleanup (range -42.574 to 55.278; clipped
raw RGB MAE 124.967). The converted range is -42.0 to 56.313. Strict elementwise
comparison fails on both inputs; FP16 differences are present, but conversion
precision alone cannot explain this failure. No replacement artifact is selected.
The paired original/converted direct outputs also have poor raw error (~53).
The numerical safety check remains justified; unconditional stacking is rejected.

Reproduce the original-weight check with Python torch, numpy, Pillow and ORT:

```sh
python tests/image-enhancer-deblur-trial/original_checkpoint_probe.py /private/NAFNet-GoPro-width32.pth /private/nafnet.onnx /private/native-astronaut-mixed /private/original-parity.json
node --test tests/image-enhancer-deblur-trial/summarize.test.mjs
```

Capture the inputs using the corrected runner with final argument `astronaut:mixed`.
See `nafnet_ref/README.md` for pinned source, license and local modifications.
No photos or weights are committed. Full held-out quality, model rights closure,
real-device budgets and route selection remain open.

Both CI workflows passed at 45bb09b: full enhancer audit run 37325223878 and
immutable-baseline benchmark run 37325223853. This checkpoint changes diagnostic
code and evidence only; it does not modify the verified application.

## Alternative single-image defocus check

`restormer-results.json` records the official Restormer single-image defocus
checkpoint on the six exact defocus inputs from the corrected comparison.
`capture-defocus.mjs` verifies source-file and input-pixel hashes before capture.
`restormer_probe.py` verifies the upstream architecture Git blob and weight hash,
loads the state dictionary strictly with `weights_only=True`, and records raw
output range, error and native CPU time. No production routing changed.

Raw error improved against the degraded input in 4/6 cases and against the raw
NAFNet comparator in 5/6. NASA 097 foliage worsened from input MAE 13.274 to
19.316 (NAFNet raw 17.164). NASA 081 also worsened against input. All six outputs
were finite with modest overshoot. This is mixed preliminary evidence, not the
>=80% visible-usefulness gate or proof of natural texture/identity preservation.
No model is selected; do not infer motion recovery from a defocus checkpoint.

The checkpoint has 26,126,644 parameters and is 104,700,429 bytes. Local native
CPU time was 0.72–1.51 seconds on these tiny inputs; this is not a browser or
physical-device budget. Export/operator/parity, download/memory/tile/cancellation,
exact weight-rights and broad photographic quality gates remain open.

Pinned source: `swz30/Restormer` commit
`68dc6ac472db26f16361150cb7a96a1bc87da93f`,
`basicsr/models/archs/restormer_arch.py`, blob
`a41221ecf90294be5951b3019e6d0d600bd4a49a`.
The source repository declares MIT; its license must accompany any distributed
copy. Architecture and weights are external inputs to this probe, not bundled.
The authors’ `Defocus_Deblurring/README.md` links the Drive folder containing
`single_image_defocus_deblurring.pth`, file ID
`10v8BH3Gktl34TYzPy0x-pAKoRSYKnNZp`.
SHA-256: `7dce451f33f8f5e0faf7c4e3996e5dcc1bd425ecd1ada99b0f9750e490fd4c9e`.
Candidate adapter uses explicit reflect padding to multiples of eight and crops
to native dimensions; do not confuse this with NAFNet’s internal zero padding.

```sh
node tests/image-enhancer-deblur-trial/capture-defocus.mjs /private/trial /private/nasa-intake /private/defocus-inputs
# Python dependencies: torch 2.8.0+cpu, numpy, Pillow, einops 0.8.1
python tests/image-enhancer-deblur-trial/restormer_probe.py /private/restormer_arch.py /private/single_image_defocus_deblurring.pth /private/defocus-inputs /private/restormer-results.json
```

## Historical 5 October padded-input investigation

The following records describe the prior runner and must not be interpreted as
current native-input results or the current authorization scope. All remaining
blueprint work is now one combined launch-readiness task.


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

## Restormer conversion and WASM checkpoint — 6 October 2026

The isolated FP32 export passes ONNX checker and all four sampled comparisons
against original PyTorch: 32×32 and 64×80 synthetic inputs, padded coffee 128×88,
and astronaut 128×128. Maximum absolute difference is 1.073e-6, within the fixed
rtol 1e-4 / atol 1e-5 tolerance. The graph is 107,114,302 bytes, SHA-256
`3aae021fb8914cd5806d6129fd22d7d0a47869a073477397bde1409f20f937c7`.
The exporter/source/checkpoint are pinned; weights remain outside this repository.

ORT Web 1.30 single-thread Node WASM ran the same coffee tensor twice and matched
the native ONNX result within 6.259e-7; repeated outputs were byte-identical.
Session creation took 3.81 seconds; inference took 2.80 and 2.70 seconds. Peak
whole-process RSS was 534,108 KiB (~522 MiB) on Linux/AMD EPYC. These are tiny-image
host measurements, not mobile/browser budgets or model-only memory. Do not
extrapolate them into a full-image latency promise or claim a device-budget pass.

This closes sampled conversion and Node-WASM operator uncertainty for this exact
artifact. It does not remedy the earlier photographic regressions. Status remains
HOLD: no production integration, default download, paid server or upload flow.
Full-size, tile consistency, cancellation, physical-device budgets, weight-rights
closure, genuine defocus and held-out/manual photographic acceptance remain open.

```sh
python tests/image-enhancer-deblur-trial/restormer_export.py /private/restormer_arch.py /private/single_image_defocus_deblurring.pth /private/defocus-inputs /private/export
node tests/image-enhancer-deblur-trial/restormer_wasm.cjs /private/export /absolute/onnxruntime-web /private/wasm-results.json
```

Reports: `restormer-export-results.json`, `restormer-wasm-results.json`.
Python dependencies additionally include onnx 1.18.0 and onnxruntime 1.22.1.
The legacy torch exporter is explicitly selected for reproducibility; its
upstream deprecation warning is not an inference or parity failure.

## Larger-input and clean-control checkpoint — 6 October 2026

`resolution_probe.py` evaluates the same six development sources at maximum side
512, using original public sample files for coffee/astronaut and the previously
screened NASA files. It creates a fixed radius-four disk degradation and retains
clean controls. Different resolution/recipe means these are new diagnostic cases,
not directly interchangeable with the earlier 128px scores. No held-out images
were used. All 12 cases / 24 raw model runs finished; their source/input hashes,
output ranges, elapsed times and MAE appear in `resolution-results.json`.

On the six defocus cases, raw Restormer error is lower than input on 5/6 and lower
than raw NAFNet on 4/6. NAFNet is lower than input on 4/6. These metric counts are
not the 80% visible-usefulness gate. Both specialists alter clean controls; forced
NAFNet on clean coffee exhibits a visible colored grid despite passing the loose
numeric bound, while two other clean NAFNet outputs fail that bound and are not
scored. Restormer clean-source MAE spans 3.24–7.85. No clean-cohort acceptance or
manual identity result is claimed. Default clean bypass remains necessary.

Restormer native CPU inference took 19.4–30.0 seconds at these sizes. Whole-process
peak RSS was 3,505,964 KiB (~3.34 GiB), including both loaded models, Python, runtime
and intermediate allocations. This is not model-only or browser memory, nor a
measured phone budget. Full browser-only architecture remains unselected.

The raw full-frame NAFNet failure is NOT a production-path result. To resolve that
specific risk, `tiled_probe.mjs` executes the actual application class and worker
arithmetic with a serial native-canvas shim. Both 192px desktop and 128px mobile
core sizes reject the clean coffee input via the existing numeric validator before
bitmap conversion. `tiled-coffee-results.json` records the exact application hash.
It does not test automatic diagnosis, browser transfers or physical devices. No
production threshold was changed from this evidence.

```sh
python tests/image-enhancer-deblur-trial/resolution_probe.py /private/restormer_arch.py /private/single_image_defocus_deblurring.pth /private/nafnet.onnx /absolute/skimage/data /private/nasa-intake /private/resolution-trial
node tests/image-enhancer-deblur-trial/tiled_probe.mjs /private/resolution-trial/coffee-reference.png /private/nafnet.onnx /absolute/onnxruntime-web /private/tiled-coffee.json
```

The separate isolated orchestrator now withholds unvalidated cleanup+deblur
composition before loading models. This closes a confirmed dependency gap in the
prototype; it does not implement successful mixed restoration in production.
27 related orchestration, lifecycle, bounded-cleanup and fusion tests pass.
At preceding published checkpoint 7b9eae3 both full CI workflows passed (enhancer
audit 37410953740, benchmark harness 37410953796). The application is unchanged.
