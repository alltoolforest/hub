# AllToolForest PDF Compressor — Seven-Task Continuation Task 7
## Mobile and production acceptance: final engineering pre-release gate

**Source of truth:** approved seven-task continuation (Task 7 mobile and production acceptance), not the older 13-task blueprint. User approved per-task manual deferral to the end of the seven-task blueprint. This is **that final task**: prepare evidence now, then conduct collective physical manual acceptance and production release gates separately.

**Base:** Task 6 PR #217 `pdf-compressor-continuation-task6-regressions-20261015`. CI run `38761270739` completed **13/13 pass**, including all four modes, browser engines, source/output integrity and recovery. Task 6 engineering verified, manual QA deferred.

## Task 7 exact release criteria and method

1. **Emulated device/browser acceptance** (new isolated automated tests): Android-like mobile Chromium; iPhone-like WebKit; Windows Chromium and Firefox; macOS-like WebKit. Exercise all four modes on a synthetic mixed PDF, mobile layout, UI and worker state, worker disposal, independently reopened downloaded bytes, exact SHA-256 integrity receipt, unchanged-original fallback and safe signature rejection. Avoid network uploads. **Browser/device emulation is not actual Android, iOS, Windows or macOS physical-device certification**.
2. **Actual content sizes** (not appended PDF padding): browser-worker probes with embedded PDF attachment streams at measured ~10 MB, ~20 MB and ~50 MB; verification of SHA-256 input/output receipts, text, output size, no network requests. Existing `experimental-large-file` gate separately probes ~100,000,000 bytes in Balanced, Strong, Lossless and high-entropy scenarios, plus scanned and mixed cases. These sizes are **synthetic data** and do not establish success on every valid PDF, scanner or camera sample.
3. **Original user reference**: 15.91 MB / approx. 68-page real PDF, four modes on user's OnePlus Nord4. Previously measured Balanced 8.99 MB / 45.5s; Strong 7.04 MB / 51.9s; Maximum 4.59 MB / 50.2s; Lossless 15.81 MB / 18.9s. **Historical baseline only**; no new physical timing is claimed and the document is not attached to this QA branch.
4. **Manual end-of-blueprint session (required for release; currently deferred)**: OnePlus Nord4 real Android browser: choose 15.91 MB reference and new mixed/transparency/signed/encrypted fixtures, all four modes, optionally target 5 MB, verify downloaded file physically opens, pages/text/photo fidelity, color/alpha, filesize/savings, cancellation/retry and navigation cleanup; test slow/higher-complexity 10/20/50/100 MB real PDFs if safely available. Record real model, OS/browser, source file, input/output sizes, wall time, quality and crashes. Physical iPhone/macOS/Windows where unavailable must be explicitly recorded as gaps; automated emulation is the available proxy.
5. **Pre-deployment audit before merge/deploy:** entire PR chain and isolated PDF Compressor source audit; pinned runtime and dependency license/security review; no regressions, no remote document uploads, safe CSP, input bounds, correct SEO/noindex for diagnostic artifacts, UX, accessibility and output integrity. Existing cross-browser UI/axe gates stay mandatory.
6. **Production release sequence:** user authorization for merge/deployment → production audit on live tool → manual verification where required → final regression → explicit freeze approval. **No merge, no staging or production deployment, no claim of production audit, no freeze in this PR.**

## Current protected safety boundaries

100,000,000 byte default input limit and device-specific smaller limits; limits on decoded streams, page/object/image counts and worker memory; preserve unsupported images, encrypted/signed rejection, no corrupted file output, exact source rollback on cancellation or optimizer failure, truthful mode distinctions. Do not remove these limits or promise universal 100 MB success without real memory/resource evidence.

## Automated pass/fail evidence

- Task 6 final baseline: `38761270739` **13/13 pass**.
- Task 7 PR: **automated jobs must pass on final PR head before engineering readiness is declared**. Five emulated profiles plus a 10/20/50 MB size-ladder job are added to the previous 13, for **19 jobs total** (13 + 5 + 1), subject to GitHub Actions reporting.
- Each job uploads reproducible JSON evidence. Final candidate HTML artifact remains **offline, isolated, noindex**, not hosted production.
- Known residual blockers cannot be relabeled as passes: no current actual 68-page upload in Task 7 branch, physical-device QA deferred, real iPhone/Windows/macOS coverage unavailable, user production authorization not given, hosting security/Cloudflare separately deferred.

## Final decision criteria

- **Engineering-verified / manual QA pending:** only if new complete workflow and previous regressions pass, no confirmed safety defect, and honest limitations recorded.
- **Launch-ready:** only when physical manual QA, approval, deployment and post-deployment checks actually complete. Engineering verification never means automatically deployed, frozen or production ready.
