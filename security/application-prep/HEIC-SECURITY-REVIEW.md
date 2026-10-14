# Application Document Prep — HEIC decoder security review
Date: 2026-10-14 | Environment: isolated draft PR #209 | Production remains unchanged

## Verified legacy issue
The current production Application Prep calls `decodeImage` from frozen/shared `assets/js/core.js`. HEIC goes through vendored `assets/vendor/heic.js` (`heic2any`), which in its blob worker invokes dynamic JavaScript evaluation. The live tool therefore temporarily uses `script-src 'unsafe-eval'` in this page's HTML meta CSP. Removing this string without replacing that decoder caused **real conversion regressions** in prior Chromium/Firefox/WebKit fidelity tests. Regressions were repaired by restoring the page-only exception; avoid modifying shared `core.js` or the working vendor script to address only this tool.

### Threat model
- `unsafe-eval` weakens defense-in-depth for a script injection that could reach this page. It does *not* by itself upload the image.
- Mitigations already present: static local page, browser-local HEIC processing, tight `connect-src 'self' blob:` with no HTTP third-party origins, `form-action 'none'`, `object-src 'none'`, no editable code execution from user input, bounded source dimensions/file size, and output signature validation.
- Unresolved limitation: on GitHub Pages, HTML meta CSP cannot implement `frame-ancestors`. HTTP header CSP and anti-framing must be delivered by a compatible host before launch.
- Changing only a host CSP that forbids `unsafe-eval` will **break HEIC** until the decoder is changed; do not do this.

## Replacement evaluation (tested)
`heic-to@1.6.6`, imported as `heic-to/csp` or via its equivalent shipped CSP bundle, was tested in an isolated HTML page with `script-src 'self' blob: 'wasm-unsafe-eval'` and **no `'unsafe-eval'`**. CI installed exact versions, imported only same-origin library code, and converted the existing pinned real HEIC fixture to valid PNG and JPG. The output decoded at 1440 × 960 pixels, with zero recorded CSP script/eval violations, no off-origin upload requests, and no uncaught page errors in Chromium, Firefox and WebKit.

**Important**: This is a proof of CSP compatibility, **not** a production replacement. It has not been integrated into Application Prep and has not passed the whole image-to-PDF, crop, orientation, memory/performance, error handling and physical-device regression suite. Do not claim the legacy exception is removed.

## License and dependency review
`heic-to@1.6.6` is declared **LGPL-3.0**; bundling/distributing its 3+ MB decoder would trigger open-source notice, license, source availability and replaceability/relinking considerations. Legal/compliance review is required before integrating a vendored distribution. Avoid interpreting a wrapper's permissive MIT/Apache license as automatic exemption from licensing of bundled `libheif` or HEVC decoders.

Alternative `@keeratita/heic-converter` advertises MIT-licensed CSP-safe WASM but is young/small and includes native decoder components requiring provenance/license/quality diligence. `@discourse/heic` advertises Apache-2.0 but its underlying `libheif`/`libde265` contents still merit independent provenance checks. Neither alternative has been integrated or declared safe here.

## Recommendation
1. **Do not remove or broaden** the existing page-only eval exception on the current GitHub Pages release. No frozen shared image or document tools should be modified.
2. Prefer a future separate Application Prep-only `heic-to/csp` integration **after** legal/compliance approval and stable same-origin self-hosting of the bundle (never CDN-loading sensitive-file decoders).
3. Use strict browser CSP without `unsafe-eval` only once the new decoder is integrated; verify real HEIC orientation/pixels, transparency, repeated exports, performance/memory, high-pixel preflight, actual A4 PDF, and no outside-origin requests in all three engines and physical mobile browsers.
4. Deploy the stricter response-header CSP on a host that supports HTTP headers. Run negative CSP tests proving eval blocked **and HEIC still works**.
5. Complete mandatory user device/manual checks before freeze. Until then, log `legacy-HEIC-eval` as an **accepted or unresolved security-risk item** — not a patched bug.

## Evidence
- Draft PR #209 strict-CSP experiment: `tests/application-prep-heic-csp-experiment.mjs`
- CI: `Application Prep isolated security research` (Chromium, Firefox, WebKit)
- Previous live production HEIC and regression checks: `https://github.com/alltoolforest/hub/actions/runs/38570928336`
- Original package: https://github.com/hoppergee/heic-to , license: https://github.com/hoppergee/heic-to/blob/main/LICENSE
