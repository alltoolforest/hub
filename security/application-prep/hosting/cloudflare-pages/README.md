# Application Document Prep: scoped HTTP-header remediation

## Current factual constraint
The deployed review address `https://alltoolforest.github.io/hub/documents/application-document-prep/` is hosted by **GitHub Pages**, which does **not** apply the repository's `_headers` file. The verified live HTTP response did not include the intended CSP, anti-framing, nosniff, referrer or permissions response headers. HTML meta CSP does **not** protect against framing. Do not declare this issue fixed while visitors remain on that GitHub Pages URL.

## Safely staged host-side fix (not deployed)
This directory contains the **page-only** Cloudflare Pages static-site `_headers` policy. A future approved Cloudflare Pages deployment must copy this file to the **root of the actual published output** as `_headers` and serve the whole site's requisite same-origin JS/CSS/decoder assets so the application stays entirely in-browser. Keep the current review `noindex` and do not change canonical URLs or domain ownership before a coordinated site release.

Two path variants cover a root-hosted custom-domain site and a `/hub/` staging prefix; neither applies rules to frozen tools. Do **not** copy the repository root `_headers` over wholesale: its broad `/*` rules would change protections on frozen tools without validation.

Cloudflare Pages applies `_headers` only to static assets, not Pages Functions-generated responses. If proxying through a Worker, response headers must be attached explicitly there. A Cloudflare Pages project/credentials/domain and rollout approval are necessary; none is configured by this change.

## Critical decoder exception
The current vendored `heic2any` decoder uses JavaScript eval in a blob worker and will fail if `unsafe-eval` is removed. The scoped host policy mirrors this *temporary* permission until an independently tested, licensed replacement is approved. The policy still denies remote connections and framing. See `../../HEIC-SECURITY-REVIEW.md` for replacement evaluation.

## Verification required after host configuration
- Use the actual routed HTTPS URL (not GitHub source or HTML) to confirm `Content-Security-Policy` includes `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Permissions-Policy`.
- Confirm `X-Robots-Tag` and HTML `noindex` preserve private review indexing.
- Confirm non-tool/frozen pages return the same content and behavior as before.
- Run application photo, signature, PDF, HEIC, failure recovery, and network privacy tests in Chromium, Firefox, and WebKit. Repeat physically on Android/iOS.
- Fix missing headers or regressions **before** redirecting any public traffic. Do not freeze or claim deployment based solely on the checked-in `_headers`.

Docs: https://developers.cloudflare.com/pages/configuration/headers/
