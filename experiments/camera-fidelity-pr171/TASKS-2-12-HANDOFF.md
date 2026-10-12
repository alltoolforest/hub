# Camera-Fidelity Engine — Experimental checkpoint and release decision

Date: 2026-10-12. Build: `cf-20261012-t11-r1`.
Protected source: PR171 head `a672855f9c4047dafe31cd0823cfeb7de2bb04f7`.
Scope: `experiments/camera-fidelity-pr171/` only in `alltoolforest/hub`, plus a separate owner-private comparison Site.

**Release decision: NO-GO. This is a safety/measurement checkpoint, not a demonstrated photographic upgrade. Do not promote, merge, deploy to AllToolForest, or freeze it as production verified.**

The user explicitly authorized progressing from Task 2 while Task 1 phone-pair evidence remained missing, and continuing sequential engineering without per-task approval. Work resumed from preserved files after interruption; completed experiments were not restarted. Only changed safety/integration paths received follow-up checks.

## Task-by-task status

| Task | Work performed | Acceptance status |
|---|---|---|
| 0 Baseline isolation | Exact protected source, hashes and initial candidate retained; original modules remain unchanged. | PASS, previously verified |
| 1 Quality benchmark | Previously completed 3-photo/13-case calibration infrastructure, native ROI exports and protocol retained. | PARTIAL: diverse native originals, phone Auto pairs and held-out reviews missing |
| 2 Safety instrumentation | Nonfinite plan validation; dimensions; alpha/transparent-pixel integrity; strip ordering/completeness; source-relative whiteout/blackout, false-color and row-jump guards; encoded PNG header and decode verification; timing and failure reporting. | Local implementation/tests PASS; thresholds only detect specified catastrophic faults, not all corruption or visual regressions |
| 3 Noise intelligence | Bounded spatial tiles, dark/mid/bright bands, residual/chroma estimates, coherence rejection, sample-confidence and explicit uncertainty. Globally aligned sampling is invariant to tested strip partitions. | PROVISIONAL: synthetic tests pass; real hair/fabric/noise discrimination and resolution invariance unproven. Optional diagnostics only |
| 4 Intelligent denoising | Independently implemented bounded luma/chroma bilateral trial; evaluated against PR171 on all calibration cases. | REJECTED/DISABLED: 3 paired cases improved MSE, 3 worsened; no visual/phone acceptance |
| 5 Fine-detail engine | Independently implemented bounded multi-scale, noise/confidence-gated trial with local-envelope, gamut, face and JPEG-grid exclusions. | REJECTED/DISABLED: 3 paired cases improved MSE, 3 worsened; no demonstrated faithful-detail gain |
| 6 Face preservation | Validate caller-provided face rectangles; preserve baseline protection; trial changes excluded inside protected regions; no invented/full-frame masks. | PARTIAL: no new genuine detector, landmark validation, diverse face corpus or exact-identity guarantee. New texture stages disabled |
| 7 Tone intelligence | Bounded local dark-midtone trial, preserving black/highlight endpoints and uncertain/noisy regions. | REJECTED/DISABLED: 1 paired case improved MSE, 1 worsened, remainder unchanged |
| 8 Color/JPEG correction | Restrained vibrance tested separately; reviewed existing JPEG regression evidence. | Vibrance DISABLED: no pixel effect at tested restraint. Additional automatic white balance and JPEG reconstruction WITHHELD, not claimed implemented or individually validated |
| 9 Mobile processing | Background file decoding; header preflight; 32MP/side limits; explicit memory estimate including retained blobs; bounded strip size; cancellation, timeout, PNG verification and cleanup. Node synthetic processor exercised through exact 6400×5000. | PARTIAL: no physical Android/iOS or browser codec/memory qualification |
| 10 Manual test interface | Separate private original/PR171/candidate comparison, shared zoom/pan, native downloads, ROI crop export, presets, diagnostics, cancellation and build checks. | Implemented; private deployment recorded separately. Real browser/mobile UX validation pending |
| 11 Deep regression audit | Targeted unit/fault tests, worker orchestration with deterministic canvas/PNG double, independent PNG decoding, baseline pixel checks, dependency/privacy/scope review. | PARTIAL: browser, device, held-out quality, color-management and blind preference gates not met |
| 12 Release handoff | This risk report, evidence inventory, no-go decision and rollback instructions. | Handoff prepared; production approval/sign-off NOT requested because required gates fail |

## What actually changed

Active candidate changes are reliability and measurement: worker-side decoding, input preflight, memory planning, failure/cancellation handling, optional regional diagnostics and pixel-integrity checks. `image-enhancer-photo.js` and `image-enhancer-portrait.js` remain exact PR171 copies. On identical decoded calibration pixels, the candidate output remains PR171-equivalent. There is no claim of improved photographic detail, 70% preference, phone-editor parity or identity preservation proven on real people.

Offline `photo-trials.js` contains rejected research stages. It is **not imported by the active worker and is excluded from the hosted runtime**. Rocket1, Rocket2 and Hybrid implementations were not imported.

New modules: `photo-integrity.js`, `photo-noise.js`, `photo-faces.js`, `photo-budget.js`, `photo-build.js`, and offline `photo-trials.js`. Candidate adapter/worker and its lifecycle test changed. New UI, packaging helper, targeted tests and JSON evidence are confined to this experiment. Baseline/manifest files were not edited.

## Test evidence and limits

- 62 distinct local unit/integration tests passed across the retained and targeted runs: core photo 20; lifecycle 9; budget 5; face inputs 3; integrity 9; noise map 4; trial contracts 4; worker integration 8. Earlier completed groups were reused where code was unchanged.
- Final guards accepted all 13 calibration outputs; decoded output hashes equal the previously recorded PR171 hashes. See `benchmark/TASK11-INTEGRITY.json`.
- Deliberate whiteout, blackout, false color, alpha/hidden RGB changes, row discontinuity, missing/out-of-order output, invalid dimensions, nonfinite plans, bad PNG headers and worker failure paths were rejected in targeted tests.
- File → processing → PNG integration passed using a deterministic **test double** for canvas/decoder APIs. This does not establish real browser rendering behavior. Pillow independently decoded the generated 80×123 PNG.
- Capacity evidence: Node synthetic processing at 1, 6, 12, 24 and 32MP, plus a 16384×3 shape. Exact 32MP produced 128,000,000 processed RGBA bytes into a streaming checksum. **No native 32MP PNG download or physical-phone run was performed.** Timing in `TASK9-CAPACITY.json` precedes the final additional false-color guard and is not a final-device performance budget result.
- Static checks: HTML label/id relationships, no inline handlers, JavaScript syntax, closed local runtime imports, no runtime trial module, exact included baseline hashes, no external libraries or photograph files in the site bundle.
- A browser-runtime download was cancelled by the environment. Sites runs in a managed container without the prescribed browser-control capability, so browser QA was not replaced by an improvised control path. Visual/accessibility claims are limited to implementation/static review, not an audited rendered session.

## Critical unresolved gates

1. **No accepted enhancement improvement.** Trials are disabled; current candidate quality is baseline quality.
2. **Corpus and comparison evidence:** only three small public calibration scenes; no confirmed phone Auto pairs, held-out corpus or blinded votes. The proposed >=70% criterion is unmeasured.
3. **Faces and texture:** no qualified on-device detector or diverse identity/skin/hair/fabric validation. Caller rectangle correctness is not established by geometry checks.
4. **Mobile/browser:** Android/iOS/Windows/macOS end-to-end file selection, worker decode/encode, scroll, download, repeated-job memory, cancellation during native codec work and real 32MP cases remain unverified.
5. **Color/metadata:** source is converted through browser RGBA/PNG. ICC/EXIF and exact hidden RGB in transparent pixels are not preserved as original file metadata; color-management/orientation behavior needs real browser tests. Alpha checks compare decoded pixels, not source compressed bytes.
6. **Memory:** planning is an estimate, not a RAM guarantee. Browser/GPU/codec allocations and garbage collection may exceed it. A decoder or process killed by OS memory pressure cannot always deliver a recoverable error. Larger budgets are an explicit test option for high-memory devices, not a universal mobile promise.
7. **Integrity sensitivity:** catastrophic thresholds can miss subtle artifacts or reject unusual legitimate images; they require more real-image calibration. No output that fails a guard is offered as successful.

## Security/privacy and UI review

No image upload API, backend, database, analytics code or remote model download is introduced. UI uses local Blob URLs and textContent; filenames are not inserted as HTML. CSP restricts runtime resources and disallows application network connections. Supported file signatures/dimensions and budget are checked before worker decoding. The browser's own codec still parses untrusted image files. HTTP/private-site access plumbing is separate from local photo processing.

Controls have labels, visible focus styles, status announcements and mobile stacking. Full native view displays one image at a time; selection preserves pan position. There is no fabricated progress percentage for encoding. Crop and file controls are disabled where concurrent work would add memory/race risks. Static review cannot certify actual keyboard/screen-reader/touch behavior or iOS download behavior.

## Rollback and continuation

AllToolForest production has not been changed by this work, so no production rollback is required. To stop the experiment, stop using the separate private Site and experimental branch; do not delete or rewrite PR171/main. For further candidate changes, keep baseline read-only and run `python experiments/camera-fidelity-pr171/verify-baseline.py` before and after work. To restore the lab's processing behavior, use its exact baseline modules; retain evidence rather than replacing it with a passing label.

Next work is evidence-driven: register native real-photo/phone pairs, reserve held-out scenes, reproduce concrete failures, then revise one disabled stage at a time. Do not enable the rejected trials merely to make the candidate look different. Qualify the private lab on physical devices before considering any production proposal. The separate production release sequence remains Implement → Pre-deployment audit → Deploy → Production audit → Manual verification → Regression → Freeze, after explicit promotion approval and passing quality gates.

## Private comparison page

Deployment succeeded: https://atf-camera-fidelity-lab.vamshichandragiri05.chatgpt.site

Owner-private; open while signed into the owning account. This is a separate experimental Site, not an AllToolForest production URL. Build `cf-20261012-t11-r1`; source/version identifiers are retained in `PRIVATE-PREVIEW.json`. Deployment success verifies publication only, not image-processing behavior in an actual phone browser.
