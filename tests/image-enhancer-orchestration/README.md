# Task 3 — isolated orchestration checkpoint

Status: contract prototype automated-verified; Task 3 PARTIAL, not integrated or launch-ready.
Source: Launch Completion Blueprint v1.0, Task 3. Parent checkpoint: 6a0cacd.

## Scope

Continue the existing untracked orchestrator draft. Production modules, UI, models,
Task 1/2 files, and PR #117 fusion behavior remain unchanged. This directory has
no production imports. No Task 4–10 algorithms or model integrations are included.

## Routing table

Evidence is a tri-state contract (present/absent/uncertain), not a newly tuned detector.
A production evidence adapter and thresholds require the pending photographic baseline.

| Evidence | Selected stages, in execution order |
|---|---|
| Clean / all absent | None; independent unchanged output |
| Motion or defocus blur | Deblur; portrait if detected |
| Noise / JPEG damage | Cleanup once |
| Pixelation / low resolution | Upscale; portrait first if detected |
| Scratches / creases | Repair |
| Low light / overexposure / faded color | Tone |
| Mixed noise/compression + blur | Evidence plan retained; execution withheld before loading, independent original returned |
| Grayscale alone | None |
| Explicit colorization request + grayscale | Colorize contract only; no UI or implementation |
| Severe evidence | Skip reconstruction; allow evidenced tone; limitation diagnostic |
| Uncertain evidence | Skip speculative stages; uncertainty diagnostic |
| Detector unavailable | Only explicitly detector-independent adapters eligible |

Selected operations are ordered repair, cleanup, deblur, portrait, upscale, tone,
colorize, followed by a required safety guard. This is a provisional contract,
not an evidence-backed model stacking decision. Photographic trials rejected
unconditional cleanup/deblur stacking; the executor now withholds that combination
even if both individual adapters declare approval. It reports
`unvalidated-composition:cleanup-deblur` and returns an independent original before
loading any model. This is a dependency safety restriction, not successful mixed
restoration or a substitute for selecting a validated composition. No photo runs
every stage by default.
Scale defaults to 1; low-resolution 1× restoration and requested enlargement use
one upscale contract. Exact custom dimensions remain an integration dependency.

## Stage and ownership contracts

- Registry is injected. No URL discovery, uploads, downloads, or dynamic model selection.
- Only selected, approved descriptors load. Descriptors must declare preservation
  of alpha/text/grayscale where relevant and safety without a portrait detector.
  These declarations require real adapter verification before integration.
- Caller source is validated and copied; original and current accepted pixels are
  never exposed. Each stage receives fresh image/original copies.
- Adapter returns RGBA image, status (processed/unchanged/limited/fallback), and
  truthful aiExecuted boolean. Dimensions, pixel budget, unchanged claims and
  same-size alpha preservation are checked. Resized alpha/text preservation
  still require adapter/image-quality tests.
- Adapter owns native/model resources; dispose is awaited after success, failure,
  or cancellation. Loaders must clean up their own resources if loading rejects.
  Superseded JS buffers become collectable; this is not a measured memory budget.
- AbortSignal reaches load and run. Cancellation waits for cooperative shutdown,
  then disposes and returns original. A non-cooperating worker needs an integration
  termination adapter; bounded cancellation latency is not established here.
- Progress includes stage/loading/running/complete and count; observer exceptions
  cannot break processing. No changes to protected user controls.
- Any missing/unsafe stage, bad output or failure returns independent original with
  fallback diagnostics. Guard is mandatory for a nonempty plan. No raw error or
  photo data is emitted in diagnostics.
- Results distinguish success, limited, unchanged, fallback and cancelled;
  aiExecuted separately records reported AI execution, not visual usefulness.

## Verification

Run: `node --test tests/image-enhancer-orchestration/orchestrator.test.mjs`

12/12 tests passed: category/mixed routing; uncertainty/severe limits; clean bypass;
lazy loading/order/disposal; source mutation isolation; detector/guard absence;
alpha/false-unchanged rejection; cancellation during load and inference; observer
failure isolation; wrong dimensions/budget/fallback; invalid input/budget rejection.
These use simulated adapters, not real images or models. No browser/device or
photographic acceptance claim is made. Existing tracked files unchanged at checkpoint.

## First unfinished item and completion gates

Task 2 has no approved architecture, final rights clearance or device budgets.
Task 1 has no admitted photographic acceptance dataset. Consequently production
model adapters, detector mapping, actual category routing, real intermediate-memory
release, physical-device cancellation and controls/output integration remain blocked.
Do not claim Task 3 complete from these tests. Resume at evidence-backed adapter
mapping once those dependencies are resolved; preserve this verified contract work.
Tasks 4–12 unstarted in this checkpoint. No merge, deployment or freeze authorized.

## Confirmed dependency correction — 6 October 2026

The corrected native-input photographic experiment found all six motion-only
examples worsened after cleanup and two mixed-damage numerical failures. The
original checkpoint also failed on the mixed portrait. Therefore the prototype
must not treat individually approved stages as a validated cleanup/deblur chain.
The previous permissive ordering test now exercises cleanup/tone instead; a new
negative test covers both noise+blur and JPEG+blur with portrait/lighting present,
source ownership, zero loads, zero AI execution and an explicit fallback reason.

PASS: 13 orchestration tests and 14 directly related bounded-cleanup, numerical
validation/lifecycle and PR #117 fusion tests (27 total). Application imports,
protected controls and production behavior remain unchanged. Re-enabling this
composition requires a selected model/sequence and corresponding photographic
validation; do not remove the restriction solely to complete a task count.
