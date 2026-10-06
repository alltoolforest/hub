# Mobile speed correction — 6 October 2026

Base: production 6797742. Isolated candidate, not deployed or launch-ready.
User reports unusable waits on two phones: enhancement 12/48 tiles and deblur
7/612 (earlier report 624). Screenshots do not establish elapsed duration.
Attached photo copies differ from the dimensions implied by those tile plans.
Private photographs are not committed or sent to CI.

Implemented containment:
- Explicit Clear photo at 1x uses existing local refinement/finishing and detail
  protection; no reconstruction model is loaded for that route.
- Enhancement and deblur check 64 mobile / 256 desktop tile ceilings before model
  initialization. Oversized workloads do not start hundreds of inference calls.
- After initialization, one shared clock spans retries. Scheduling stops after
  20s mobile / 45s desktop, or after two tile samples project beyond that budget.
  These provisional limits are not measured device acceptance or latency promises.
  Model initialization, export and one in-flight WASM call can exceed the budget.
- Complete results are retained; partial results are discarded. Limited local
  output explicitly says AI restoration was skipped and blur may remain.
- Existing 2x/4x upscale routing is unchanged. Numerical, face and artifact guards
  on admitted reconstruction remain unchanged.

Tests: budget boundaries, 612/624 preflight rejection before initialization,
actual engine entry points, projection, completed-result retention, upscale
isolation, existing inference lifecycle and fusion. Browser audit queued in CI.

Open: faster useful full-size deblurring is NOT delivered by this containment.
A lighter/accelerated model or validated multiscale reconstruction needs quality,
rights and physical-device evidence. Do not count fallback as deblur success.
No new portrait, scratch repair or colorization capability is claimed. Full
12-task blueprint acceptance remains open. No release/freeze authorization is
inferred from passing containment tests.
