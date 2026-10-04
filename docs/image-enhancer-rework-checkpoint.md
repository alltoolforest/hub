# Image Enhancer & Upscaler rework checkpoint — 2026-10-04

Status: **local candidate only; NOT production verified; NOT frozen.**

## Verified starting point

- Repository: alltoolforest/hub (public).
- Current main checked out: 3a819c8911679d0657df64780fd1e64da81d6430.
- Handoff enhancer baseline: ad60a6eaaa0ad36aba2dc97967629d54c29e58f9.
- Enhancer JS, model directory and existing enhancer tests had no diff between those revisions.
- Dedicated branch: rework/image-enhancer-restoration-20261004.
- Engine candidate commit: 1a04e0c.
- Remote push was rejected by automatic approval review; branch publication is blocked pending explicit user authorization. No PR, CI run, merge or deployment was made.

## Implemented candidate

Deblur previously applied the regional face ceiling, then overlaid more of the blurred source over the already protected face. The candidate computes the existing radial overlay as a source-retention ceiling and enforces the stricter of both ceilings during a single original-source/candidate blend. It skips the second overlay only when that worker blend succeeds. The legacy global-blend fallback still applies the existing face overlay.

No model, face-limit constant, artifact threshold, interface, Upscale behavior or unrelated tool changed. The per-image deblur plan is now computed once instead of once per pixel. This is a limited first rework checkpoint, not the complete specialist-model architecture from the handoff.

The enhancer CI frozen-file check now expects the Image Compressor hash from its separate approved 2eac6ac release. The compressor file itself was not changed. All other frozen hashes are unchanged.

## Validation

- PASS: four Node test cases covering the existing radial limits, combined ceilings across 40,000 pixel positions, clipped/overlapping face masks, and empty/invalid masks.
- PASS: existing enhancer CI static checks.
- PASS: existing frozen/shared file hash checks, with the documented compressor baseline correction.
- PASS: new browser test syntax and git whitespace check.
- PASS: candidate scope review — three enhancer JS files, two dedicated tests and enhancer CI only.
- BLOCKED: local browser execution. Chromium installation succeeded, but launch aborted at `process_singleton_posix.cc` with `socket() failed: Operation not permitted`.
- NOT RUN: browser worker integration test, full existing browser regression, actual model quality comparisons, mobile/Firefox/WebKit tests, portrait manual verification.

Unit tests establish mathematical ceilings, not facial identity or image quality. No claim of improved perceived restoration, premium-app parity, or launch readiness is supported yet.

## Resume without repeating work

1. Obtain explicit approval to publish the candidate branch to the public alltoolforest/hub repository; automatic review rejected that specific action.
2. Push the existing commit(s), create a draft PR, and run the existing enhancer CI including the new fusion checks. Do not merge on pending or failing gates.
3. Inspect actual CI logs. Compare raw reconstruction, regional blend and final guarded outputs on matched inputs; determine whether the unchanged final guard still suppresses useful reconstruction.
4. Expand beyond the existing eight degradations of one 192x128 fixture. The handoff still requires diverse real portraits, motion blur, low-light/high-ISO, low-resolution faces, old photos, hair, text/objects, mixed damage and clean inputs. Keep personal photos out of the public repository without separate authorization.
5. Continue specialist-model evaluation and broader orchestration only on measured evidence. No new model has been selected or validated in this checkpoint.
6. Complete the handoff release sequence: implement, pre-deployment audit, deploy, production audit, manual real-photo comparison, regression, then freeze only if accepted.

Do not repeat the baseline investigation or reimplement this candidate. Preserve the protected interface and every unrelated/frozen tool.
