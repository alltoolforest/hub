# v2 Release QA Report

Date: 2026-09-21
Branch: `restructure-v2`

## Scope freeze
No new tools during release hardening. Work, Documents, Images and Calculators are feature-frozen for v2.

## Completed static QA
- Removed legacy duplicate routes from homepage/search.
- Standardized category-hub navigation.
- Added About and Privacy pages.
- Added legal/privacy links to primary hub footers.
- Added robots.txt and XML sitemap for the current staging URL.
- Added/updated meta descriptions on Work and Calculator leaf pages.
- Improved mobile form sizing, touch targets, focus visibility and reduced-motion behavior.
- Fixed Scientific Calculator invalid-expression error handling.
- Fixed Age & Date month-end calendar difference logic.
- Added invalid extreme-return guards to investment/compound-interest calculations.
- Reviewed document/image external runtime dependencies.
- Confirmed advanced file tools disclose relevant limitations rather than pretending unsupported behavior works.

## Runtime dependencies requiring production decision
- pdf-lib 1.17.1 (cdnjs)
- PDF.js 3.11.174 (cdnjs)
- Tesseract.js 5 (jsDelivr; major version not fully pinned)
- Mammoth 1.8.0 (jsDelivr)
- docx 8.5.0 (jsDelivr)
- SheetJS/xlsx 0.18.5 (jsDelivr)
- PapaParse 5.4.1 (jsDelivr)
- heic2any 0.0.4 (jsDelivr)
- @imgly/background-removal 1.7.0 (jsDelivr ESM/model runtime)

Before commercial production, self-host or explicitly approve each critical runtime dependency, pin exact versions where possible, and verify license/security/update requirements.

## Not yet claimable as tested
These require execution in real browsers/devices and representative files:
- Desktop Chrome/Edge/Firefox/Safari smoke test.
- Android Chrome and iOS Safari layout/input/download tests.
- PDF rotation/annotation coordinate QA, especially 90°/270° pages.
- HEIC/HEIF variants and EXIF orientation.
- Background-removal model load, first-run latency and complex edges.
- OCR quality, worker/model loading and long scanned PDFs.
- DOCX/XLSX/CSV import/export fidelity.
- Very large image/PDF memory behavior and graceful failures.
- Print-to-PDF invoice output.
- Keyboard-only workflows and screen-reader spot checks.
- Lighthouse/Core Web Vitals on production-like hosting.

## SEO launch gates
- Choose production domain/host.
- Replace staging sitemap URL with production URL.
- Add canonical URLs only after final domain is known.
- Add favicon/social preview assets.
- Validate titles/descriptions and indexability on deployed pages.
- Submit production sitemap and verify indexing/search console.
- Avoid thin synonym pages; keep one strong URL per workflow.

## Privacy/legal launch gates
- Add a public contact method.
- Update privacy notice for the final host and any analytics/ads.
- If analytics/ads/cookies are introduced, document providers and consent requirements before enabling them.
- Review Terms/Disclaimer needs before monetization.
- Do not overstate browser privacy where third-party CDN/model requests occur.

## Release decision
Do not merge to `main` until runtime QA and production-host/privacy gates are completed and explicitly approved.
