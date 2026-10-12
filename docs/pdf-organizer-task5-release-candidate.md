# AllToolForest — Organize PDF Pages
## Task 5: Integrated QA and Release-Candidate Handoff
**Blueprint:** Launch-Ready Remediation Master Blueprint V1.0
**Assessment date:** 2026-10-12
**Candidate branch:** \`organize-pdf-task5-release-qa-20261012\`
**Draft PR:** #179, based on Task 4 PR #178, chained after PRs #177, #176 and #175
**Scope:** Only Organize PDF Pages and its organizer-specific QA files
**Deployment:** NOT PERFORMED. Main, production and frozen tools remain untouched.

### Scope delivered
- Retained Task 1 integrity, Task 2 lifecycle and Task 3 page UI state/export functionality.
- Completed source-level Task 4 hardening without changing shared PDFs, global site settings or unrelated tools.
- Created an isolated GitHub Actions release-candidate workflow for native Node suites and real browser-integrated upload, edit, download and privacy verification.
- Identified and fixed an actual PDF.js portability bug: the bundled renderer depends on \`Map.prototype.getOrInsertComputed\`, unavailable in some supported browser engines. The compatibility helper is loaded **only** by the organizer before its PDF.js preview import. No bundled PDF.js files or frozen tools were changed.
- Added a focused compatibility suite, PDF.js error-path diagnostics and a minimal existing-fixture dependency update.
- Added workspace-scoped axe-core automated WCAG A/AA checks inside the real-browser test suite.

### Verified results — same code revision
GitHub Actions run: https://github.com/alltoolforest/hub/actions/runs/38215104681
- Native Node v22: **68 tests passed, 0 failed, 0 skipped** (Task 1 = 19, Task 2 = 22, Task 3 = 13, Task 4 = 10, Task 5 = 4).
- Chromium desktop at 1280px: PASS.
- Chromium mobile emulation at 360px: PASS.
- Firefox desktop at 1280px: PASS.
- WebKit at 390px mobile viewport: PASS.
- WebKit desktop at 1280px: PASS.
- Each browser path checked PDF upload, PDF.js preview, keyboard operation, move-to-position, rotation, removal, exported page count/order/rotation/metadata, stale-download invalidation and failed replacement recovery.
- Browser requests were inspected: no unexpected off-origin network requests or document-upload POSTs in the tested workflow.
- No JavaScript page exceptions during those runs.
- Organizer workspace axe-core WCAG 2 A/AA and WCAG 2.1 A/AA automated scan: **zero violations in all five browser configurations**.
- 360px Chromium and 390px WebKit checks found no unexpected document-level horizontal overflow.
- Source diff: no changes to \`main\`, frozen-tool implementations, \`assets/js/pdf.js\`, \`assets/js/core.js\`, \`assets/vendor/pdf.mjs\`, \`assets/vendor/pdf.worker.mjs\`, \`_headers\`, \`robots.txt\`, or \`sitemap.xml\`.

### Outstanding evidence — NOT claimed as complete
1. **Actual physical Android phone / iPhone testing:** long-press drag, scrolling, focus, rotation, export/share and virtual-keyboard behavior. Browser mobile emulation is not a physical device test.
2. **Real assistive-technology checks:** VoiceOver/Safari, TalkBack/Chrome and keyboard + NVDA or equivalent. Automated axe and keyboard smoke tests do not prove full accessibility.
3. **High-memory / stress PDF fixtures:** 10–30 MB scanned, image-rich or annotated documents; mixed-size pages; larger page counts; malicious or malformed samples; repeated reload/rotation/cancellation; measure peak memory, completion time, rendering responsiveness and safe recovery on a midrange device. Task 2 size/page budgets remain conservative provisional caps, not measured guarantees.
4. **Production host network and HTTP header review:** actual CSP, Referrer-Policy, MIME/nosniff, worker policy, download and cache behavior. The repository \`_headers\` file alone does not prove the selected host enforces it.
5. **Public indexing configuration:** \`site-config.json\` currently has no production domain; \`robots.txt\` blocks all crawling; \`sitemap.xml\` contains \`FINAL-DOMAIN\` placeholders. Keep staging restrictions. Verify final canonical, robots, sitemap and Search Console after public-domain approval, never change these from the isolated organizer QA branch.
6. **Performance / Lighthouse measurements:** real device browser timing, memory, accessibility/SEO diagnostics and final static-host measurements. Synthetic PDF V8 times and Linux browser tests cannot be sold as phone performance.

### Pre-deployment-audit entry recommendation
**Engineering candidate prepared, conditional.** Automated functional and cross-browser gates are green. A reviewer should not mark the tool PRODUCTION VERIFIED or FROZEN, nor deploy it, until the separately authorized pre-deployment audit examines the unresolved device/security/indexing requirements and confirms no P0/P1 open risks.

### Proposed manual verification record
Record for each tested configuration: device model, OS/browser version, PDF fixture characteristics (page count, size, scanned/text/forms), step performed, observed result, time and peak memory if available, pass/fail and any issue reference. Suggested minimum:
- Android Chrome midrange: 1, 20, 100 pages, 360 CSS px, touch drag, move buttons, remove/restore, rotate, exported PDF validation and download.
- iOS Safari iPhone: same sequence, focus behavior and Save to Files/share.
- Desktop Chrome, Firefox and Safari/Edge: keyboard, mouse drag, downloads, reopened PDF accuracy; at least one assistive technology per mobile/desktop environment.
- Security/privacy: inspect actual network requests after using a unique non-sensitive marker in a test PDF; confirm the marker does not leave the browser.

### Permanent release sequence — not started
1. **Pre-deployment audit** — required; review and address open device/host blockers.
2. **Deploy** — only upon separate approval and successful pre-deployment audit.
3. **Production audit** — verify actual public URL, security headers and realistic operations.
4. **Manual verification where required** — record tested Android/iPhone and desktop scenarios.
5. **Regression** — repeat full suites and direct PDF-tool route checks after deployment.
6. **Freeze** — only after production verification and no unresolved blockers.

### Stop condition
Task 5 engineering implementation and automated verification are complete.
No Task 6 is part of this blueprint; deferred advanced editing features remain unapproved.
Leave draft PRs untouched for release review. Do not merge, deploy or freeze from Task 5.
