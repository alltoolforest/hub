# Task 4 continuation — 5 October 2026

Starting remote checkpoint: 7df77493e34d1e356f71b88beb7ee27acea95f41 (PR #120).
Scope: Task 4 only. No Task 5 implementation or changes to production/frozen tools.

## Exact requirement and disposition

| Blueprint requirement | Evidence / remaining gap |
|---|---|
| Integrate selected noise/compression route | WDN connected only to isolated orchestration and existing guards; Task 2 selection/rights/device gate remains open |
| Preserve hair, skin, fabric, edges and text | Not accepted; human texture review and text/detail cohorts missing; declared text remains withheld |
| Idempotent or explicitly bounded repeated cleanup | New job snapshots original/evidence, permits one attempt, shares concurrent calls, returns independent result copies; failed/cancelled attempts also bounded |
| Do not destructively denoise clean inputs | Previously verified two photographic bypasses preserved; new job clean/snapshot test passes |
| Color noise, heavy/repeated JPEG, mixed blur/noise | Eight new diagnostic cases across two sources executed; mixed cleanup isolated from unavailable deblur |
| Final guard active | Existing unmodified face/final guards used; mixed astronaut required five fallback stages |
| Both cohorts meet improvement gates | NOT PASSED: no locked held-out corpus or human acceptance; pixel improvement cannot satisfy this gate |

## Implemented and tested

`bounded-job.mjs`: one attempt per original/job, including simultaneous calls;
source/evidence copied at creation, result pixels/diagnostics copied on return.
Explicit new-job creation is required for retry. This does not detect a downloaded
output re-uploaded as a new source and is not wired to production controls.

`bounded-job.test.mjs`: three tests for clean source/evidence ownership, concurrent
failure/release, and cancelled-job reuse. All passed. Twelve directly related
orchestration tests passed; unchanged broader audits were not repeated.

`stress.mjs`: real pinned WDN WASM inference for synthetic independent RGB noise,
JPEG quality 15, JPEG recompression at 35→20→15, and existing mixed degradation.
Eight cases each verify one inference despite concurrent/repeated calls, immutable
source, isolated returned results, and one released session. One additional real
mixed-route check returns the original with `unavailable:deblur`. No deblur adapter
was introduced. `stress-results.json` records hashes, metrics and guard counts.

| Case | Input RGB MAE | Output RGB MAE | Guard stages |
|---|---:|---:|---:|
| Coffee / color noise | 15.054 | 10.970 | 0 |
| Coffee / heavy JPEG | 10.225 | 8.690 | 0 |
| Coffee / repeated JPEG | 14.561 | 11.811 | 0 |
| Coffee / mixed cleanup only | 6.673 | 5.834 | 2 |
| Astronaut / color noise | 14.503 | 10.908 | 0 |
| Astronaut / heavy JPEG | 11.221 | 10.375 | 1 |
| Astronaut / repeated JPEG | 16.124 | 15.099 | 0 |
| Astronaut / mixed cleanup only | 8.508 | 7.745 | 5 |

All eight final pixel errors decreased; that is diagnostic evidence only. Five
fallback stages on mixed portrait remain a warning against selecting this route
from aggregate metrics. No perceptual/identity or physical-device pass is claimed.

## Reproduction

Use dependencies and public fixtures documented in README.md. No photos/weights
are included in this commit.

```sh
node --test tests/image-enhancer-cleanup/bounded-job.test.mjs tests/image-enhancer-orchestration/orchestrator.test.mjs
node tests/image-enhancer-cleanup/stress.mjs /private/trial /private/trial/wdn.onnx /absolute/path/to/onnxruntime-web /private/task4-stress.json
```

## Blockers, risk and remaining tasks

Task 4 is partial, not complete. Production admission depends on the selected
route passing Task 2's rights/runtime checks and Task 1's locked category cohorts.
Task 4 still needs held-out usefulness, human texture/text/identity checks and
representative-device measurements. The experiment's manually supplied evidence,
small images, face boxes and text=false flags are not production diagnosis.

Production regression risk is low: only Task 4 diagnostic files changed. No safety
threshold, production module, protected interface or unrelated tool was changed.
No merge/deployment/freeze. Tasks 5–12 remain pending and were not started in this
continuation. Tasks 1–3 retain previously recorded acceptance/integration gaps.
