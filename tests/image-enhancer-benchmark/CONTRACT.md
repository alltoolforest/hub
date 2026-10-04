# Task 1 benchmark contract — version 1

Source of truth: Launch Completion Blueprint v1.0, Task 1. No engine tuning, model selection, UI or deployment work belongs here.

## Admission and split

Admit 100 independently sourced photographs, ten primary cohorts with seven development and three held-out source groups each. At least 30 portraits and 15 mixed-damage examples; cross-tags do not increase the independent-source count. Required cohorts: defocus, motion, pixelation, jpeg, old-damage, old-faded, low-light, overexposure, grayscale, clean. Include genuinely damaged photos and paired synthetic degradations. Include age/skin-tone variety, multiple faces, hair, fabrics and text/objects. Record human diversity review; do not infer demographics automatically.

One original occupies one source group. All derived crops, encodings, degradations and references stay in its split and count as one vote. Before admission, review provenance, internal-use permission/consent and any redistribution right separately. The manifest validator checks declarations, not legal validity. A real reviewer must verify the cited permission evidence. Personal filenames, identities, consent documents, model outputs and photographs stay outside the public repository.

Each private manifest source requires:

```json
{
  "id": "photo-001", "sourceGroup": "original-001", "path": "inputs/photo-001.jpg",
  "mime": "image/jpeg", "sha256": "<actual 64-character SHA-256>",
  "cohort": "defocus", "split": "development", "severity": "moderate",
  "recoverability": "recoverable", "origin": "real-damage",
  "tags": ["portrait", "hair"],
  "rights": {"status":"cleared","basis":"permission or verified license","evidence":"private record identifier","reviewer":"reviewer identifier","reviewedAt":"ISO date","visibility":"private"}
}
```

For synthetic-paired inputs also record a reference path/hash and recipe version/seed. Derived assets are not independent photographs. Grayscale and clean sources are controls, not automatically damaged. Label recoverability and severity BEFORE baseline review: recoverable means visible supporting structure survives; uncertain means a reviewer cannot establish this; unrecoverable means the requested detail lacks source support. Retain the reason in intake notes. Never relabel failures after seeing an output.

No incomplete corpus can be locked or produce a passing acceptance score. Empty manifest sources currently mean NOT READY, not 100 implied slots. Unit tests use fabricated metadata to exercise validation; these are explicitly not photos, permissions or benchmark evidence.

## Private access and locking

Keep private manifest and fixtures in a restricted local directory outside the repository. Use opaque IDs. No private corpus in public GitHub Actions, public artifacts, Git history or screenshots. A separate authorized private runner may be used later; none is provisioned by this task. Browser processing fetches model resources but the harness blocks remote upload methods. Fixture-path resolution checks real paths, including symlinks, and SHA-256 before use.

Commands (run from repository root):

- `node tests/image-enhancer-benchmark/run.mjs audit` — reports the actual missing intake; exit 2 until ready.
- `node tests/image-enhancer-benchmark/run.mjs lock --manifest /private/manifest.json --fixtures /private/photos --lock /private/dataset.lock.json` — validates coverage and bytes; creates a new lock without overwriting an old one.
- `node tests/image-enhancer-benchmark/run.mjs run --manifest /private/manifest.json --fixtures /private/photos --lock /private/dataset.lock.json --out /private/results` — two baseline runs per admitted photo.
- `node tests/image-enhancer-benchmark/run.mjs selftest --out /tmp/enhancer-harness` — generated geometric pattern only; two captured runs and one capture-disabled run. This tests real-AI capture repeatability and output parity, not photo quality.

The lock binds the full manifest and this contract. Content, labels, splits or contract changes invalidate it. Preserve any prior lock, document a new version, and recollect baseline evidence if the evaluation set changes. Hold-out images must not be used for candidate tuning. Because each held-out category starts with three examples, the 80% gate initially requires all three improved; report raw n/N and expand uncertain categories.

## Capture and reproducibility

Baseline is PR #117 head 92d05302002e12924fab766b784cda2ea97d3f37. Verify source module SHA against it. Capture original, raw model output, face/region steps, finishing and final guard wherever that path actually executes them. The current deblur path omits some general finishing stages; absence means not executed. Capture final exported pixels, dimensions, model/runtime manifest, backend, diagnosis, guard fallback count, elapsed time, browser version and failure details. Capture-disabled parity checks must preserve the exported image.

Use the same input bytes, model hashes, settings and browser/backend for paired repeats. Exact output PNG hashes are required for the baseline's same-environment repeats; any mismatch is an investigation, not automatically an image defect. Cross-device numerical equivalence is not asserted. Timing includes capture/encoding overhead and is diagnostic only. Task 2 establishes actual device performance budgets.

Review full-frame matched-width images AND matched native-resolution crops around face, hair, texture, text and damage regions. Compare original, baseline, later candidate and phone/reference output at the same display size. Do not use a rescaled thumbnail alone to approve identity. Colorization has no verified original-color reference unless independently supplied. Current Enhance is captured unchanged; no colorization behavior is added.

## Fixed human review rubric

Reviewers first compare anonymized source/baseline/candidate at matched sizes without being told which candidate is newer. Record reviewer ID, date, image/run IDs, view scale and notes. User acceptance remains explicit; an automated score cannot stand in for it.

For each source record:
- `verdict`: improved / tie / worse. Improved requires a useful visible repair of the stated defect without material harm to content or naturalness. An unchanged fallback is a tie.
- Identity/content: unchanged / minor uncertain deviation / severe change. Severe includes changed face geometry/expression/age cues, fabricated meaningful text, changed people or objects. Any severe change fails that case regardless of sharpness.
- Naturalness: acceptable / unacceptable, with flags for waxy/painted skin, false texture, halos, ringing, seams and color drift.
- Color: plausible / unnatural / not-applicable. Grayscale colorization cannot earn historically-accurate status without ground truth.
- Clean-image review: no material damage / damaged, at normal view and 100% crops.
- Severe-input review: honest limitation and bounded result / misleading reconstruction.
- Phone comparison: user's approximate 80%-quality acceptance met / not met / not evaluated. This is an ordinal human judgment, not a computed 0.8 similarity score.

Useful-restoration gate: >=80% improved among recoverable held-out sources IN EACH advertised damage cohort. Report ties, worse and exclusions separately. Missing reviews mean NOT EVALUATED. Do not pool categories or count multiple variants as extra wins. Clean/grayscale controls and uncertain/unrecoverable sources have separate gates. Zero observed severe content/identity failures and zero unacceptable artifacts in accepted results are required across the acceptance set. These are test-set observations, never guarantees about all photos.

Paired images: report RGB MAE/RMSE and visual differences against clean reference on equal dimensions, with consistent orientation/color decoding; do not use those metrics alone to approve reconstruction. Review structure, edge location and color separately. A sharper or higher-energy edge is not intrinsically better. Missing ground truth must remain null, not zero error. Implementation of additional perceptual metrics is optional supporting work only after validated against known controls.

## Completion and current blockers

Task 1 completes only when the permission-cleared corpus is populated/locked, baseline outputs are reproducible, real portraits are reviewed, comparison evidence is available, and the baseline report records actual failures and stage behavior. Passing the harness tests alone cannot complete Task 1.

Current blocker: there is no admitted 100-photo corpus or completed permission/diversity review. The existing repo natural-image fixture has no attached provenance/permission record in this benchmark and is not silently promoted into it. Earlier user originals and phone outputs are candidate private inputs, not separate counted originals or permission to publish. Source intake and baseline/human review remain outstanding. Task 2 stays unstarted.
