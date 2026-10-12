# Task 0 — Baseline isolation completed

Date: 2026-10-12. Source: PR #171 head `a672855f9c4047dafe31cd0823cfeb7de2bb04f7`.

Implemented two exact snapshots under `experiments/camera-fidelity-pr171/`: protected baseline and initial candidate. Each contains four photographic engine modules, the dispatch integration reference, and two inherited test suites. Added manifest with SHA-256, byte lengths and Git blob IDs; read-only verification script; scope instructions and reproduction documentation. Baseline receives local read-only permissions. No processing algorithm was modified.

## Verification

- PASS: 7 baseline files match immutable PR head byte-for-byte, by SHA-256 and Git blob ID.
- PASS: 7 candidate files match the same source byte-for-byte.
- PASS: inherited baseline tests 29/29, zero skipped.
- PASS: inherited candidate tests 29/29, zero skipped.
- PASS: original repository paths unchanged against pinned source commit.
- Engine dependencies remain local: adapter → worker → photo → portrait.
- Node v24.19.0; tests include synthetic photo processing, strip parity, alpha, portrait behavior, tone, JPEG cleanup, dispatch boundaries and mocked worker lifecycle.

No unresolved Task 0 implementation blockers. Local read-only mode is not GitHub branch protection and is not preserved by Git; the integrity gate must be run and permissions reapplied on later checkouts. No claim of improved quality, physical-phone compatibility or native 32MP validation is made. Root repository history contains older unrelated code; none was copied into or used by this experiment.

Production regression risk: minimal; no existing file changed, no deployment or production integration. Candidate behavior remains exactly PR #171, including its existing limitations.

Remaining: Task 1 quality benchmark; 2 safety instrumentation; 3 noise intelligence; 4 intelligent denoising; 5 fine-detail engine; 6 face preservation; 7 tone intelligence; 8 color/JPEG correction; 9 mobile processing; 10 manual test interface; 11 deep regression audit; 12 release handoff. None started.

## Remote persistence blocker

The experimental branch push was rejected by automatic approval review, which interpreted Task 0 as local-only authorization and flagged publication of source to the remote. No retry was attempted. This checkpoint is committed locally; remote persistence requires explicit user approval. Implementation and verification are complete locally, but GitHub publication is not complete.

Update: user approved remote saving on 2026-10-12. Shell push lacked credentials; the authenticated GitHub connection saved the exact checkpoint at f803e10eb018dcfff995dec0feca69c06b59a6c6 on experiment/camera-fidelity-pr171-task0. Remote persistence blocker resolved.
