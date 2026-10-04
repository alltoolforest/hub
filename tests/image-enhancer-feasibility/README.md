# Task 2 — specialist-model/runtime feasibility checkpoint

2026-10-04. **PARTIAL / NOT APPROVED FOR INTEGRATION.** Source: Launch Completion Blueprint v1.0, Task 2. User authorized addressing Task 1 dependencies in this task. No production code, Task 1 contract, fixtures or gates changed. No Task 3 routing implemented. No upload service or paid dependency introduced.

## Exact scope and evidence boundary

Shortlist deblur, denoise/deblocking, super-resolution, portrait recovery, scratch repair and colorization. Verify exact code AND weight rights, redistribution, origins/hashes, conversion parity and operators. Prototype separately. Measure preview/full latency, download, memory, seams and cancellation on actual Android/iOS/Windows/macOS hardware/browser versions. Deliver scorecard, architecture decision, device budgets and fallback matrix. A server route requires a concrete provider/upload/retention/cost/limits proposal and explicit approval before adoption.

Task 1 still has 0 admitted photographic sources. Quality, identity, category usefulness and held-out comparison remain NOT EVALUATED. Existing geometric harness success is not photographic evidence. No human permission, diversity or portrait review was invented. Source intake can proceed under the user's approval, but no corpus has been completed at this checkpoint.

## Shortlist and rights findings

`scorecard.json` records eight entries and seven immutable upstream code-license references. Current manifest, not the older `docs/image-enhancer-model-benchmark.md`, identifies the existing NAFNet and compact Real-ESRGAN comparators. The stale OpenCV Zoo NAFNet path returned 404; it is not used as artifact provenance.

| Candidate | Role | Decision at this checkpoint |
|---|---|---|
| Existing NAFNet GoPro width32 FP16 | Motion-deblur comparator | Download/hash/graph/Node WASM checked. Defocus quality not established. Exporter card declares Apache-2.0 and parity, but independent export parity and complete rights chain remain unresolved. |
| Existing Real-ESRGAN general x4v3 | SR comparator | Download/hash/graph/Node WASM checked. Existing source retained; no quality win assumed. Exact export provenance/parity review open. |
| Real-ESRGAN WDN companion | Denoise/deblock candidate | HOLD: no exact converted artifact admitted; JPEG benefit not established. |
| Restormer task-specific checkpoints | Motion/defocus/denoise alternative | MIT code; HOLD for exact weights, conversion and runtime. These are different checkpoints, not one universal trained model. |
| GFPGAN clean architecture | Portrait candidate | HOLD: Apache headline includes third-party exceptions, including restricted components. Determine which actually apply to selected export and weights. No blanket commercial clearance or blanket prohibition asserted. |
| Bringing Old Photos Back to Life global pipeline | Scratch candidate | MIT code; HOLD for detector/repair weights, export and runtime. Face subpipeline not implicitly included. |
| Zhang ECCV16 colorization | Colorization candidate | BSD-2-Clause code; HOLD for exact weights, Lab conversion and export/runtime parity. |
| CodeFormer | Portrait alternative | REJECT for commercial integration without separate permission under S-Lab terms. No model downloaded/executed. |

MIT/BSD entries require preservation of copyright/license notices. Apache entries require applicable license, NOTICE and change notices. These code observations do not independently clear checkpoint weights or third-party exports. Pinned source links appear in `scorecard.json`; source branches are not used as stable audit references.

## Actual isolated measurements

Linux 6.18.44 x64, AMD EPYC 9V74, Node v24.19.0, ONNX Runtime Web 1.30.0, WASM, one thread. Deterministic 64×64 RGB ramp tensor; two runs each. Times are single samples, not percentile budgets. Neither is a preview/full photographic run.

| Model | Downloaded bytes | Session initialization | First / second inference | Peak whole-process RSS |
|---|---:|---:|---:|---:|
| NAFNet | 36,041,772 | 1,076 ms | 154 / 112 ms | 394,000 KiB |
| Compact Real-ESRGAN | 4,871,181 | 182 ms | 374 / 363 ms | 185,904 KiB |

Both actual SHA-256 values matched the existing manifest. Both outputs were finite and bit-identical across repeats, with 64×64 and 256×256 outputs respectively. Full input/output types, opsets, operator counts, exact output hashes and host details are in the two probe JSON files. Download **duration** was not measured. RSS includes graph decoding, Node and runtime; it is not model-only, browser-tab or device memory. Do not extrapolate tile timings to full images.

The isolated `probe.cjs` verifies bytes before decoding/execution, refuses unverified external tensors, records graph operators, and executes only single-input float32 RGB diagnostics. Its input is synthetic; no photo bytes enter it. It never imports application code or fetches models. Models were downloaded outside the repository and are not redistributed in this PR.

To reproduce, install `onnxruntime-web@1.30.0` outside the repository. Set `ORT_PACKAGE_PATH` to that package directory and `ONNX_SCHEMA_PATH` to the protobuf `onnx.js` decoder (this run used the existing ORT1.21.0 schema under `hybrid-build/node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js`). Run `node tests/image-enhancer-feasibility/probe.cjs /private/model.onnx EXPECTED_SHA256`. Keep the exact downloaded model and record the environment. Independent PyTorch→ONNX parity requires original checkpoint/export code and matched normalized inputs; this diagnostic does not provide it.

## Architecture decision and fallback matrix

**Decision deferred. Browser-only full-scope viability is unproven.** Retain current application behavior while researching isolated candidates. Do not choose a model from promotional outputs, code-license labels or these tiny runtime probes. No server necessity has been established; therefore no provider, cost commitment or upload flow is selected.

The following is a feasibility disposition, not an implemented router:

| Condition | Disposition |
|---|---|
| Candidate fails rights/hash/conversion gate | Exclude it from integration; retain current comparator |
| WebGPU absent or candidate operator unsupported | Measure WASM on the actual device; no assumed acceptable speed |
| WASM exceeds device budget or fails | No new restoration promise; preserve existing safe behavior and source |
| Portrait/scratch/colorization route unvalidated | Withhold that new capability claim |
| All browser routes miss quality/resource targets | Stop architecture selection and present measured tradeoff; seek explicit upload/cost approval only if a concrete server proposal is justified |

## Device budgets and outstanding tests

| Required platform | Actual hardware/browser record | Preview/full/download latency | Peak memory / seam / cancellation | Final budget |
|---|---|---|---|---|
| Android Chrome | Missing | NOT MEASURED | NOT MEASURED | UNSET |
| iOS Safari | Missing | NOT MEASURED | NOT MEASURED | UNSET |
| Windows Chrome/Edge | Missing | NOT MEASURED | NOT MEASURED | UNSET |
| macOS Safari/Chrome | Missing | NOT MEASURED | NOT MEASURED | UNSET |

Do not relabel Linux browser emulation or Node as these devices. Collect cold and warm preview/full runs at declared dimensions, connection/cache state, backend, threads, tile/padding and power/thermal state. Measure full versus tiled overlap on identical inputs and inspect seam strips. Test cancellation during download, initialization, inference and tile transitions, including time to settle and resource release. Use OS/browser profiling for peak memory; unavailable metrics remain null. Derive budgets only after recording representative hardware evidence and quality tradeoffs. Browser WebGPU support alone does not prove the model's full operator graph, memory or throughput is viable; see official ONNX Runtime WebGPU and large-model documentation.

## Verification and resume point

Completed: two real model hashes, graph inventories and ORT1.30 diagnostic executions (four inference runs); repeat/finite checks; negative expected-hash tests; syntax checks; diff isolation from Task 1 and production. Existing completed browser regression was not rerun.

Outstanding: Task 1 corpus/locked baseline and human review; exact artifact/weight rights for shortlist; original-framework conversion parity; new-candidate prototypes; full photo quality, tiled seams, cancellation and physical-device measurements; final architecture/budgets. Task 2 does not pass. Resume these items, not the completed comparator diagnostics. No merge/deployment. Tasks 3–12 remain unstarted.

Official runtime references: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html and https://onnxruntime.ai/docs/tutorials/web/large-models.html (read 2026-10-04).
