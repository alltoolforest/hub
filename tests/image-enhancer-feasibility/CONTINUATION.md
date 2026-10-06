# Launch completion continuation — 2026-10-05

User authorized Tasks 4–12 and dependency work. Quality gates are not waived.
Starting local checkpoint: 1ee0260 (Task 3 isolated prototype); remote parent:
PR #119 d3689b2d2d2440537c38ba572917cf41a82305a4. No production changes.

## Work completed

Built a reproducible isolated trial for the official Real-ESRGAN general and WDN
checkpoints, using upstream architecture a4abfb2979a7bbff3f69f58f58ae324608821e27.
Only the BasicSR registration dependency is removed; BSD notice is retained.
Official checkpoint intake hashes are recorded and required for subsequent runs.
Model loading uses torch.load(weights_only=True), strict state matching, and a
size cap. Model weights and photo outputs are not committed or redistributed.

Exported both candidates to ONNX; all six PyTorch/ONNX shape comparisons passed
(rtol 1e-4, atol 1e-5). Included odd dimensions. Full/tiled output matched exactly
for each of three models at 96×112, tile 48, context padding 40 on CPU. This is
not a mobile memory policy. New WDN export executed twice in ORT Web 1.30 WASM:
finite, identical output; approximately 356/344 ms for 64×64 input, whole-process
peak RSS 178,784 KiB. Device feasibility remains unverified.

Initially the current export disagreed with the original FP32 checkpoint. Follow-up
established its FP16-rounding plus output clipping transformations. Reproducing
these in PyTorch passed three independent shape comparisons; maximum absolute
error was 0.00000215. Raw FP32 mismatch in cleanup-trial-results.json is retained
as observed evidence and explained by existing-export-audit.json, not hidden.
This closes these sampled SR conversion checks, not all candidate conversion gates.

## Photographic diagnostic

Two independent public development sources, each with clean, noise, JPEG,
low-resolution and mixed variants. Thirty model outputs total. Sources are not
admitted to, or counted as completion of, Task 1's 100-photo private corpus.
Images are resized to a maximum side of 128 before degradation; all 4× model
outputs are downsampled with Lanczos to matched 1× dimensions. This is a raw-model
comparison; the production face/region/final guard pipeline is not under test.

| Source / condition | Input MAE | Current raw model MAE | WDN raw model MAE |
|---|---:|---:|---:|
| Astronaut / noise | 8.808 | 7.197 | 6.734 |
| Astronaut / JPEG | 10.499 | 10.831 | 9.616 |
| Astronaut / low resolution | 9.386 | 9.870 | 8.633 |
| Astronaut / mixed | 8.508 | 6.513 | 6.887 |
| Coffee / noise | 9.202 | 5.751 | 5.752 |
| Coffee / JPEG | 9.646 | 8.202 | 7.864 |
| Coffee / low resolution | 6.358 | 6.504 | 5.854 |
| Coffee / mixed | 6.673 | 5.345 | 5.713 |

WDN merits broader cleanup/low-resolution evaluation but is not a universal winner.
Both models modify clean photos (WDN MAE 5.694/3.969); clean bypass matters.
Matched-size visual inspection of the astronaut contact sheet showed pronounced
smoothing and altered small facial detail in the damaged-image raw outputs.
Numerical improvement does not satisfy the naturalness/identity gate. No user
acceptance, complete portrait review, or launch-quality approval is claimed.

Source provenance: scikit-image data documentation identifies astronaut as NASA
public-domain imagery and coffee as Rachel Michetti's CC0 photograph, courtesy
of Pikolo Espresso Bar. These are technical evaluations, not endorsements or
marketing imagery. References:
https://scikit-image.org/docs/0.24.x/api/skimage.data.html
https://www.nasa.gov/nasa-brand-center/images-and-media/
Official model source:
https://github.com/xinntao/Real-ESRGAN/blob/a4abfb2979a7bbff3f69f58f58ae324608821e27/inference_realesrgan.py

## Reproduction

Use isolated Python 3.12 with torch 2.8.0 CPU, onnx 1.18.0, onnxruntime 1.22.1,
scikit-image 0.25.2, pillow 11.3.0, numpy 2.2.6. No application dependencies change.

```
python tests/image-enhancer-feasibility/cleanup_trial_test.py
python tests/image-enhancer-feasibility/cleanup_trial.py --out /private/trial
python tests/image-enhancer-feasibility/audit_existing_export.py --directory /private/trial
```

Run the existing integrity-first probe.cjs on the resulting wdn.onnx using its
recorded export hash and the ORT1.30 runtime described in README.md. Its exact
hash may change with exporter versions; review and record new exports explicitly.

## Task disposition and first unfinished work

| Task | Status |
|---|---|
| 1 | Acceptance corpus/locked baseline/human review remain incomplete |
| 2 | SR conversion evidence advanced; WDN trial measured; full architecture unselected |
| 3 | Isolated routing verified; actual model adapters/integration pending |
| 4 | Cleanup candidate trial performed; integration and category acceptance blocked |
| 5 | Dedicated blur improvements pending dependency gate |
| 6 | Portrait integration and identity acceptance pending dependency gate |
| 7 | WDN low-resolution diagnostic promising; full SR integration/acceptance pending |
| 8 | Lighting/faded-color implementation pending dependency gate |
| 9 | Scratch/damage model and integration pending dependency gate |
| 10 | Colorization model, concrete opt-in specification and severe-case verification pending |
| 11 | Integrated audit cannot pass without model, photographic and device evidence |
| 12 | Authorization to continue recorded; no auditable release candidate to deploy/freeze |

Next: complete the photographic intake/review and remaining specialist-model
feasibility; compare WDN within the guarded pipeline before any integration.
Actual Android/iOS/Windows/macOS measurements and user's phone-editor comparison
must be collected; this environment cannot manufacture those observations.
No server provider, cost, retention policy or upload flow selected. Broad approval
does not establish model feasibility, license rights or physical-device access.

Regression risk: low for production because changes are isolated diagnostics and
Task 3 contracts. No production, protected UI, frozen tool or existing test changed.
Existing completed audits were not rerun. No merge, deployment or freeze.

## Guarded continuation checkpoint — 5 October 2026

Continued from remote PR #120 `190f8cf071c3dae6dd74c8a1bf02eb62e2c2f4be`
(local equivalent `ea31f67`). See `../image-enhancer-cleanup/README.md` and
`results.json`: the WDN experiment now runs through the isolated orchestrator,
existing face protection and final artifact guard. Six photographic cases and
ten lifecycle/negative cases passed, plus twelve orchestration tests. Four
noisy/JPEG outputs improved paired-reference error; both clean images bypassed
all models. Two portrait cases needed final-guard intervention. No human quality,
identity, phone-editor comparison, full-resolution or physical-device pass.

GFPGAN clean architecture's actual StyleGAN2 import was confirmed at the pinned
source. Exact third-party/code/weight clearance remains unresolved; it is held,
not silently treated as cleared by the top-level Apache label. The machine-readable
scorecard now reflects the previously completed SR export checks and WDN trial.

The private intake contains 93 screened candidates, not 93 approved benchmark
members. Rights/diversity/recoverability review, required damaged-photo cohorts,
100 admitted originals, fixed splits and baseline captures are still pending.
Do not repeat collection or count provisional candidates as an acceptance set.

Tasks 4–12 remain unfinished. Task 4 has an isolated guarded adapter; Tasks 5–10
still depend on the Task 2 capability/rights/runtime gate and fixed Task 1 corpus.
Tasks 11–12 cannot pass ahead of their implementation and acceptance dependencies.
Per Task 2's explicit stop condition, no production capability is selected merely
to advance the task count. The next dependency work is corpus admission plus
remaining specialist-model feasibility, then representative device measurements.
No production file, protected UI, existing safety threshold or unrelated tool was
modified. Production regression risk is low; the experiment itself is not release
ready. No merge, deployment or freeze is represented by this checkpoint.
