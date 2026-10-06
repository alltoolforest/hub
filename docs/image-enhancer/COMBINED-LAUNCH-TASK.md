# Combined Image Enhancer & Upscaler launch-readiness task

Authorized by the user on 5 October 2026: combine all outstanding work from the
12-task Launch Completion Blueprint into one task and continue autonomously.
The original blueprint remains the requirements source. Its twelve sections are
acceptance work areas, not twelve separately authorized execution turns.

Starting checkpoint: PR #120 45bb09b86a9cf8bb7e194055afb41a4540072ef3.
State: IN PROGRESS, not launch ready, not deployed, not frozen.

## One completion contract

Deliver and verify useful noise/JPEG cleanup, motion and defocus recovery,
natural portrait handling, detail-preserving enlargement, lighting/faded-color
recovery, bounded old-photo damage repair, explicit optional colorization and
honest severe-input limits. Integrate the necessary stages while preserving the
source, cancellation, output dimensions, alpha/text protection and clean bypass.
Retain PR #117 fusion and subsequent verified numerical-safety fix.

Before completion, close corpus/provenance/model-rights/conversion/runtime gates;
run the fixed per-category held-out acceptance, identity/content/texture checks,
phone-editor comparison and physical Android/iOS/Windows/macOS measurements.
Keep the original >=80% category-usefulness and zero observed severe identity/
content-change gates. An overall metric or green CI cannot replace those gates.

Complete the integrated audit, exact release-candidate/scope/rollback record,
then the blueprint's authorized release → production audit → manual verification
→ regression → freeze sequence. Combining tasks does not itself authorize a Git
merge/deployment, change the protected UI, approve paid services or photo uploads,
or waive any missing quality evidence. Exact protected-control changes (including
colorization opt-in) must be made concrete before their approval is sought.

## Current evidence and execution focus

- Corpus: 93 private source candidates, not a locked 100-original acceptance set.
- Models: compact SR export checks and cleanup experiments recorded. NAFNet
  original checkpoint now tested: mixed-portrait cleanup/deblur is unstable in
  both original and converted models. Strict parity fails. Earlier aircraft-grid
  evidence used diagnostic external padding; corrected native-input report
  supersedes that application-path inference.
- Routing: isolated contract and bounded cleanup tests pass; full integration open.
- Safety: grossly unstable deblur tensors rejected before conversion; resource
  cleanup verified. Full candidate regression passed at 150593f; 45bb09b has the
  same application source and baseline-harness isolation correction.
- Quality: cleanup before deblur worsens all six tested motion-only examples.
  Unconditional stacking is rejected. Defocus, portrait, scratch and colorization
  routes remain unselected; no complete category acceptance is claimed.

Latest corrected comparison: 18 cases, two numerically rejected paths; among 16
fully admitted pairs, cleanup reduces final error in 9 and increases it in 7.
Original-weight evidence is recorded; it does not select a reliable route.

Alternative tested: official Restormer single-image defocus on six exact inputs;
raw error improved vs input 4/6, with a substantial foliage regression. No model
selection or category pass. The 104.7 MB checkpoint still needs browser feasibility
and exact weight-rights closure.

First unfinished engineering item: close candidate model/corpus feasibility and
broad photographic quality evidence before production integration.
Do not repeat successful tests without a changed dependency or concrete risk.
The assistant owns engineering, source/provenance research and automated testing.
Human acceptance and inaccessible physical-device observations remain explicit.

## Scope protection

Only dedicated enhancer modules/assets, tests, CI and documentation may change.
Frozen tools, unrelated categories, navigation/shared components and the existing
protected interface remain untouched. Preserve completed work unless a confirmed
dependency or defect requires a minimal change. Do not count rejected experiments
as shipped features. Keep checkpoints recoverable and report unresolved blockers.
