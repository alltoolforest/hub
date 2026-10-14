# Application Document Prep — Task 5 Release Gate

Launch-Ready Remediation Master Blueprint v1.0. This file is a **tool-local verification handoff**, not authorization to deploy, index or freeze.

## Audit outcome on the private review build

- The browser implements photo/signature/supporting-image conversion locally.
- This tool's review page has a restrictive HTML-delivered CSP, referrer policy, explicit disclosure of browser-local processing, and review-only `noindex,nofollow`.
- Headless Chromium, Firefox and WebKit Task 5 checks test upload/data confidentiality, malicious file names, failed image parsing, local output, and CSP rejection of remote requests/inline code.
- Task 1–4 verified application logic remains unchanged on the Task 5 branch.
- Neither GitHub Pages nor other public hosting is assumed to honor the repository `_headers` file. Meta CSP **cannot** enforce `frame-ancestors`. Verify the actual deployed response headers.
- The review site intentionally retains `site-config.json` domain/contact placeholders, a global robots disallow and `FINAL-DOMAIN` sitemap values. Do not bypass these gates on a tool-only release.

## Public launch prerequisites — not satisfied yet

1. Site owner approves the real public host, canonical HTTPS domain and public contact.
2. Site-wide approved deployment workstream updates `site-config.json`, `robots.txt`, `sitemap.xml` and this page's static canonical/robots metadata **together**, avoiding placeholders, staging canonical or unapproved indexing.
3. Hosting actually delivers `Content-Security-Policy` with `frame-ancestors 'none'` (or verified `X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`. The page CSP meta is an interim browser mitigation, not a substitute.
4. On the exact published HTTPS URL, run `PUBLIC_LAUNCH=1 node tests/application-prep-task5-release-check.mjs`; it must pass with the **real** live headers.
5. Confirm the browser makes no document/file upload requests and only fetches audited same-origin libraries. Confirm privacy text matches actual delivery/CDN behavior.
6. Recheck no personal files are retained in application storage, telemetry, network logs or exception messages beyond normal hosting access logs.
7. Confirm search indexability, one canonical, non-placeholder sitemap URL, heading/title/description, mobile viewport, no indexing errors.
8. Obtain explicit release authorization; do not deploy or freeze as part of this Task 5 PR.

## Required release sequence (do not skip)

**Launch-ready → Pre-deployment audit → Deploy → Production audit → Manual verification → Regression → Freeze**

### Pre-deployment audit
- Inspect the stacked PR diff in order: Task 1 #203 → Task 2 #204 → Task 3 #205 → Task 4 #206 → Task 5 #207.
- Confirm only tool-local changes, no frozen-tool or shared-engine drift, unit checks and Chromium/Firefox/WebKit tests green, no leftover conflicts.
- Review output formats, KB min/max rejection and recoverability, EXIF/HEIC, cropped pixels, PDF dimensions, zoom/focus and request capture.

### Production audit (after separately authorized deployment)
- Check actual HTTPS response headers, CSP/blocking behavior, source maps/exposed secrets, page load errors, generated download MIME/content, performance and network logs.
- Compare result against verified pre-deployment artifacts; verify all Task 1–5 outcomes and no regressions in unrelated frozen tools.

### Manual mobile and assistive-technology verification
- Android Chrome on a physical phone (including orientation changes, 20 MB and high-pixel input failures, large-file memory pressure).
- iOS Safari on a physical iPhone (real HEIC, photo library, keyboard, portrait/landscape, file-share/export); desktop Chrome, Firefox, Edge and Safari.
- Screen reader: Android TalkBack, iOS VoiceOver; keyboard-only percentage crop, field errors, announced results, download labeling and focus after errors.
- Real applications: photo (facial integrity), signature (thin stroke readability), supporting document (small text legibility), fitted A4 one-page PDF; impossible and achievable KB ranges.
- Try repeated imports and exports without page reload; verify failed import/export preserves the previously valid result. Measure peak memory and latency on representative constrained devices.
- Have a person review privacy, content accuracy, real-device usability, portal acceptance disclaimers and SEO metadata.

### Freeze only after approval
- Run final release and production regressions and record evidence.
- Ask the site owner for explicit freeze decision; do **not** treat green CI as manual verification or as freeze approval.
