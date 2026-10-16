# AllToolForest — PDF Compressor v3 Replacement Core (Laboratory Checkpoint 1)

**Status:** In development. **Never deploy**, merge into main, or freeze from this checkpoint.

## Objective
Deliver materially better compression on diverse real PDFs, without treating image clarity as the optimization priority. A downloadable output must remain a valid PDF with the intended number of pages. The user's ten synthetic 5–98 MB fixtures are the primary stress-test corpus, supplemented by third-party real PDFs and market comparisons. Output validity is mandatory; text, form and attachment loss must be explicitly disclosed and authorized.

## Existing engine: leave intact
All v2 modules, PR #222, current PDF Compressor URL, other document tools, frozen tools, and Image Enhancer remain unchanged. This first experiment is additive in `assets/js/pdf-compressor-v3/` only.

## New alternative: destructive page rasterization
`aggressive-raster-core.mjs` is an **isolated**, explicitly consent-gated, no-network module. It renders one page at a time using injected PDF.js/OffscreenCanvas, encodes each page as JPEG with mode-specific resolution and quality, then constructs a separate PDF with PDF-lib. Profiles:
- Balanced: 125 DPI, quality 0.64, 6 million rendered pixels/page.
- Strong: 100 DPI, quality 0.43, 4 million rendered pixels/page.
- Maximum: 78 DPI, quality 0.24, 2.6 million rendered pixels/page.

**Destructive**: This approach drops selectable text, forms, annotations, links, attachments, tags and interactive document features. It must NEVER be silently substituted for normal compression. It requires `consentToFlatten=true` and a **trusted independent restrictions check**; no actual production check/consent UI is wired yet. Signed or encrypted inputs must not be silently flattened. This stage establishes a candidate compression engine, not a complete product workflow.

### Structural and memory controls
- Progressive one-page rendering, canvas freed after each page; page pixel bound before allocation.
- Explicit cancellation checks; output byte budget.
- No false savings: discard expanded output.
- PDF-lib independent reopen, page-count and positive geometry checks before returning any download candidate.
- **Not yet proven**: image rendering parity with unusual color/transparency/crop/rotation, embedded content legibility, full-blob input memory, mobile 100 MB admission, PDF.js rendering all real third-party sources, or full independent page-image equivalence check. They remain gating work.

## Initial local baseline from separate native reference implementation
A local PyMuPDF/Pillow proof of concept, *not the JavaScript engine*, flattened user-approved **synthetic** corpus samples into JPEG pages and verified PDF reopening, page counts and dimensions:
- 9.06 MB photo brochure => 0.285 MB in ~0.7s at 85 DPI/JPEG quality 40.
- 36.69 MB Flate-RGB stress => 0.352 MB in ~0.2s at 85 DPI/JPEG quality 40.
- At 78 DPI / quality 24, cases #01–#08 reopened with the expected page count. High compression ratios are greatly influenced by synthetic/low-detail patterns and DO NOT establish iLovePDF parity or visually acceptable results.
- Attempting #09 at 78 DPI / quality 24 exceeded the local benchmark time limit. #10 not benchmarked. Do not claim sub-60-second performance universally.

## Validation status
- Local isolated core unit tests: 5 pass (consent, source restrictions, page-at-a-time behavior, cancellation, output budget, no false savings, mode differentiation).
- Dedicated isolated GitHub Actions workflow added. A runner green result, plus actual in-browser Playwright and the ten-corpus gate, are still required before any UI integration decision.

## Remaining engineering sequence (no deployment until complete)
1. Add actual Chromium/Firefox/WebKit browser render tests with real PDF.js and PDF-lib and validate downloaded output, rotated pages, image decode, and canceled runs.
2. Integrate a source security preflight independent from the restrictive JPEG parser, including signed/encrypted rejection, and a policy for forms/attachments requiring explicit destructive consent.
3. Address 100 MB memory by avoiding redundant source copies and benchmarking per-page rendering memory on Android/iOS/desktop; handle unsupported devices with a consented smaller output, never a silent file-size bypass.
4. Add a non-destructive aggressive image-optimization route so editable/text-bearing PDFs can retain functionality when user requests it. Candidate preference shall favor actual measured bytes, not image fidelity.
5. Benchmark **all ten** 5–98 MB PDFs, the user's 37 MB failure, the 10.71 MB competitor reference if supplied, and real third-party PDFs with all modes; compare size/time/validity against major competitors.
6. Integrate behind a gated UI, run full v2 and neighboring frozen-tool regressions without changing their code; pre-deploy audit -> explicit deployment approval -> production audit -> physical manual acceptance -> regression -> explicit freeze.

**Privacy:** No user medical reports or private PDF content is stored in this branch or GitHub CI.
