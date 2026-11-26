# Scanned PDF to Text V2 pre-deployment qualification

**Decision: hold release.** The exact English model works end to end, and the development branch has a reproducible qualification suite. The higher file and page budgets, representative real-world accuracy, and physical-browser release checks remain open.

## Implementation and scope

- Provisioning checks the pinned npm SHA-512, verifies the exact 2,952,873-byte model against its upstream SHA-256, and preserves the exact upstream model license and attribution. The runtime fetches Tesseract.js, worker, WASM and model assets from the site. No OCR CDN fallback is configured.
- The tool-specific PDF.js 6.3.289 legacy bundle fixes the typed-array API failure observed in Chromium 131. An isolated main-bundle patch also makes the operator list reject worker failures before publishing a partial result. A 36-megapixel embedded JPEG previously appeared as a blank page. It now receives a page-specific failure and the next page still extracts.
- OCR reuses one worker per run and one bounded canvas per active page. It tries alternate rotations for low-confidence scans, uses Tesseract deskew, and allows a conservative contrast and speckle-cleanup retry. The original recognition output remains available during candidate selection. A common wide gutter can restore simple two-column order when the raw text and TSV word sequence agree. Existing mixed-content handling keeps native text and flags ambiguous reading order.
- Page ranges are deduplicated and processed in document order. A missing PDF end-of-file marker is rejected. Page-specific warnings, retry recovery and UTF-8 TXT export preserve manual corrections unless the user confirms replacement.
- Changed the Scanned PDF to Text page, three Scanned PDF OCR modules, model provisioner, qualification workflow, OCR tests, tool-owned vendor assets and this report. Frozen tools, shared runtime files and site-wide hosting settings are outside the change set.

## Measured results

| Test | Observed result |
| --- | --- |
| Node lifecycle and page-order tests | 19 passed |
| Desktop Chromium 131 | 30 generated PDFs, 210 pages, correct page order and zero silent omissions in this corpus |
| Narrow-width Chromium 131 | 6 generated PDFs, 42 pages, at a 360 × 800 viewport |
| Firefox 153 | 6 generated PDFs, 42 pages |
| Ten clean scanned pages | 3.83 s desktop Chromium, 3.33 s narrow-width Chromium, 23.18 s Firefox. Includes worker startup and job cleanup. |
| Cancellation acknowledgement | 0.07 s desktop Chromium, 0.11 s narrow-width Chromium, 0.24 s Firefox |
| Repeated raster workload | 3 × 30 scans on desktop Chromium in 10.39–10.43 s per run. 3 × 10 scans at narrow width in 3.35–3.40 s per run. All expected scan pages returned. |
| Sampled peak process RSS | 898.3 MiB across the desktop test process tree, including Chromium, runner and fixture generation. Summed RSS may count shared pages twice. This measurement does not isolate WASM or device memory. |

Reference texts were scored with Levenshtein distance after collapsing formatting whitespace. The synthetic corpus reused four printed-English reference lines across several renderings. Its character and word error rates quantify the fixtures only. It included 30 raster or mixed pages, 150 native-text pages and 30 blank pages.

| Category | Character errors | Word errors |
| --- | ---: | ---: |
| Clean scans | 0 / 885 | 0 / 145 |
| Office-resolution scans | 0 / 885 | 0 / 145 |
| Degraded scans | 0 / 885 | 0 / 145 |
| Mixed content | 0 / 970 | 0 / 155 |
| Upside-down scans | 0 / 885 | 0 / 145 |
| Skewed scans | 0 / 885 | 0 / 145 |
| Native text, including Unicode | 0 / 5,355 | 0 / 1,050 |

Integrated checks cover real OCR initialization, blank-page reporting, a two-column fixture, malformed and truncated inputs, protected PDF rejection, oversized-image continuation, retry without overwriting text, cancellation, injected model fetch failure, edited TXT byte verification, viewport width and same-origin requests. The tested flows used only same-origin GET and HEAD. The PDF.js version is outside the affected range of CVE-2024-4367. The OCR viewer creates no PDF script sandbox or interactive PDF annotation UI. A worker that fails during initial setup can still require a reload because Tesseract.js exposes the worker handle only after setup.

## Remaining release checks

- Current file admission limits remain 15 MiB at narrow widths and 40 MiB at wider widths. Raster stress verified the configured 10- and 30-page run counts for repeated clean scans. The target 50 MiB/100 pages on physical mobile and 100 MiB/500 pages on desktop, and full-size mixed-workload memory stability, remain unqualified.
- Validate against varied real-world scans, complex tables and layouts, more languages for digital extraction, and larger mixed PDFs. Tiled OCR remains deferred pending evidence of accuracy gains within the memory budget.
- Local WebKit could not launch because the Linux host lacks required GTK and related libraries. Physical Safari, iOS Chrome, Android Chrome and Samsung Internet, Windows Chrome and Edge, macOS Chrome, mobile file sharing and assistive-technology behavior still need device results. Narrow-width Chromium is a desktop simulation.
- The tool has static usage, privacy and supported-feature copy, as well as a sitemap entry using the site's existing domain placeholder. Production canonical and sitemap checks await host configuration. Field Core Web Vitals and full WCAG 2.2 AA qualification remain open.

## Reproduce

Run `node scripts/provision-scanned-pdf-ocr-model.mjs` and `node --test tests/scanned-pdf-ocr*.test.mjs` from the repository root. The isolated qualification workflow installs the browser harness and runs `python -u tests/scanned-pdf-ocr-browser.py --stress`, plus shorter narrow-width, Firefox and WebKit runs. Force an available browser executable with `--executable` when required.
