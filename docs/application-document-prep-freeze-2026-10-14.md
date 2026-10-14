# AllToolForest — Application Document Prep | FROZEN

**Status:** FROZEN — review-site functional release baseline  
**Owner approval:** Explicitly approved 2026-10-14 ("You can freeze the tool.")  
**Effective date:** 2026-10-14  
**Review URL:** https://alltoolforest.github.io/hub/documents/application-document-prep/  
**Frozen production source baseline:** `c5d82369191b0a9f7be5b6b0b804db659bed8672`  
**Scope:** Application Photo & Signature Resizer / Application Document Prep; *not* a site-wide security or launch certification.

## Release and verification evidence

- Blueprint v1.0: Tasks 1–5 implemented; deployed atomically in merged PR #207.
- GitHub Pages deployment succeeded: https://github.com/alltoolforest/hub/actions/runs/38565336027 .
- Production-specific final regressions succeeded: https://github.com/alltoolforest/hub/actions/runs/38581844055 .
- Six live-browser jobs (three production audits plus three extended regression suites) passed in Chromium, Firefox and WebKit. Fifteen test-suite executions across these engines passed, covering real image/HEIC and PDF output, EXIF, rotation, flip, crop/pixel fidelity, PNG/JPEG, KB safeguards, constrained mobile resource limits, repeated exports, malformed input recovery, error handling, keyboard/guided flow, WCAG checks, mobile reflow and outbound upload/privacy behavior.
- Four protected tools (Edit PDF, Resume Studio, Invoice Builder, Loan Calculator) were confirmed online with unchanged live HTML/source checks. These are isolation checks, not complete regressions of every other tool.
- No new functional defect or regression was detected **within the automated coverage**.
- The owner approved freezing following these regressions. **Physical-device manual verification has not been recorded as passed in this release evidence; do not misstate it as completed.** Any subsequently confirmed mobile production issue reopens the tool under the freeze exception policy.

## Protected implementation — no routine changes after freeze

- `documents/application-document-prep/index.html`
- `assets/css/application-prep.css`
- `assets/js/application-prep.js`
- `assets/js/application-prep-checks.js`
- `assets/js/application-prep-resources.js`
- Existing behavior and any shared dependency invoked by this tool must retain compatibility. Do not alter shared/frozen tools or common engines casually.

From this point, do **not** refactor, polish, redesign, add features or optimize the frozen tool unless there is a confirmed production bug, a security/compatibility/legal issue requiring a correction, or an explicitly approved subsequent release. Follow the project's normal sequence for an approved reopening: implement → predeployment audit → deploy → production audit → manual verification where required → regression → freeze.

## Deferred security and hosting items — NOT fixed by freeze

By owner's explicit instruction, the following are **deferred until the planned Cloudflare hosting workstream**; this freeze decision is *not* a claim that the public-launch security gate passed.

1. **HTTP security headers:** GitHub Pages currently does not serve the required hosting-level CSP/anti-framing, `X-Frame-Options`, `X-Content-Type-Options`, referrer and permissions headers. The repository `_headers` file is not honored there. Host-side rules are prepared in draft security PR #209 but are **not deployed**. Verify actual HTTPS response headers after approved migration.
2. **HEIC `unsafe-eval` exception:** The working production HEIC decoder currently requires a narrowly page-scoped CSP exception; a CSP-compatible decoder experiment passed in Chromium, Firefox and WebKit, but replacement integration and dependency licensing/compliance checks remain outstanding. Do not remove the exception until a fully verified compatible implementation is approved. The existing exception does not constitute full security sign-off.
3. **Review/indexing configuration:** `noindex`/global robots block and placeholder domain/contact/sitemap remain intentional in the GitHub Pages private-review build. Coordinate resolution at public host launch; never bypass those controls during a tool-only release.

Sources for the open security items: draft PR #209 (https://github.com/alltoolforest/hub/pull/209) and `documents/application-document-prep/TASK5-RELEASE-CHECKLIST.md`.

## Scope and branch hygiene

- This record documents the owner's **FROZEN** decision only; no application code, vendor engine, security policy, SEO setting, or other tool is changed.
- The QA-only draft PR #208 and security research draft PR #209 remain **unmerged**. They do not change the frozen deployed implementation. Any future merger or production migration requires normal scope audit and explicit approval.
- The production baseline above refers to application implementation bytes. A later documentation-only commit should not be mistaken for a new functional release.

**Next checkpoint:** Preserve this FROZEN application baseline. Tackle the deferred hosting/HEIC exceptions during the owner-approved Cloudflare migration; perform fresh real-host and device regressions then.
