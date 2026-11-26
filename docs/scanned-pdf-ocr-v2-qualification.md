# Scanned PDF to Text V2 pre-deployment qualification

## Final stabilization, 26 November 2026

**Decision: HOLD.** Desktop mixed-document capacity is established on the browser test fixture. Physical mobile memory, native sharing, assistive technology, representative field accuracy, and production metrics still need qualification.

- File input uses PDF.js range transport backed by browser-local File slices. The tool no longer reads a complete PDF into a main-thread buffer before opening. PDF.js can still allocate document-sized backing storage internally.
- Clear PDF decode caches every 16 finished pages. The OCR worker remains shared within each job. Longer image preprocessing yields to the event loop and checks cancellation without changing the filter.
- Mixed-page deduplication consumes only matching native occurrences, preserving repeated OCR lines beyond that count. Unrecognized raster sections on mixed pages receive a specific warning. Editing recognized text invalidates previously generated download links.
- Desktop admission limits are 100 MiB and 500 pages. Narrow viewports retain 15 MiB and 10 pages pending physical-device qualification.
- The original synthetic OCR corpus now includes invoice, inspection-form, statement, and memorandum prompts. The browser suite checks horizontal overflow at 320, 360, 390, 430, 768, 1024 and 1440 px. The lifecycle and recognition suite has 20 passing Node tests.
- The exact model, both isolated PDF.js bundle checksums and vendor licenses matched the prior qualification evidence. Runtime dependency files were outside this change.

| Mixed-document capacity test | Runs | Time | Text and page integrity | Peak process-tree RSS |
| --- | ---: | --- | --- | ---: |
| Chromium 131 desktop, 99.89 MiB and 500 pages | 2 | 15.00 s, 11.47 s | 0% CER, 500 pages in order each run | 1040.4 MiB |
| Chromium 131 at 360 px, experimental budgets, 49.79 MiB and 100 pages | 2 | 4.69 s, 2.86 s | 0% CER, 100 pages in order each run | 921.7 MiB |

The revised 210-page corpus yielded 0% CER for clean, office, digital, mixed and rotated fixtures. Degraded fixtures measured 0.40% CER and 2.75% WER. Skewed fixtures measured 0.27% CER and 1.83% WER. These are generated references.

Peak RSS includes the browser, runner, and fixture construction, and may count shared pages more than once. It is neither an isolated WASM measurement nor an operating limit for physical phones. The workload includes unique scans, large uncompressed embedded images, mixed page dimensions, and native-text pages. It does not establish throughput for 500 dense raster-only pages.

### Additional qualification measurements

- A main-thread Blob instrumentation run on the 99.89 MiB fixture observed a largest single read of 24.75 MiB across validation, preview and recognition. Total bytes read were 125.78 MiB because preview and recognition each open the file. This is a read-size measurement, separate from process or WASM memory.
- The expanded Chromium suite processed ten scanned pages in 3.82 seconds including startup and cleanup, acknowledged cancellation in 0.10 seconds, and completed three 30-page raster runs in 9.88–11.41 seconds.
- The final resting interface produced zero automated axe WCAG violations at all seven tested widths. The browser regression also verifies horizontal overflow, target height, accessible edit labels, and initial layout shift. Screen readers and device-native sharing remain pending.
- One real photocopy check used page 7 of the [NASA Apollo 11 photocopied press kit](https://www.nasa.gov/wp-content/uploads/static/apollo50th/pdf/A11_PressKit.pdf). The input SHA-256 is `fcb1ae7a88e5251559dde0b7d51ec71f06795cf78f64491aa9594fdf9ca89334`. Render the entire page at 200 dpi in grayscale into a one-page image-only PDF to exclude the pre-existing text layer. The reference was manually transcribed from the visible page, including its page number and footer, and scored after collapsing whitespace. Desktop Chromium measured 7/956 character errors and 1/163 word errors (0.73% CER and 0.61% WER). The 360 px viewport measured 8/956 and 2/163 (0.84% CER and 1.23% WER). One photocopy page is insufficient to qualify a field corpus.
- [GitHub Actions qualification for the stabilized implementation](https://github.com/alltoolforest/hub/actions/runs/45816644119) runs the committed browser and capacity scripts.

Reproduce with `python -u tests/scanned-pdf-ocr-capacity.py`. The `--mobile` variant uses a test-only cap override in a desktop browser and leaves shipping policy intact. The cross-browser qualification workflow runs both variants and the Chromium, Firefox and WebKit regression suite.

## Prior qualification at 97faf96

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

Axe reported zero automated WCAG rule violations on the resting tool at 360 and 1280 px. This covers the tested state only. The workspace now reserves its initial height while the module loads. In three local cold-load runs per viewport, CLS fell from 0.300 at 360 px and 0.101 at 1280 px to 0 at both widths. Local LCP samples ranged from 34 to 94 ms. Sampled interaction latency for expanding scan options was 16–24 ms. These localhost lab measurements do not represent production Core Web Vitals.

## Remaining checks from the prior baseline

- Current file admission limits remain 15 MiB at narrow widths and 40 MiB at wider widths. Raster stress verified the configured 10- and 30-page run counts for repeated clean scans. The target 50 MiB/100 pages on physical mobile and 100 MiB/500 pages on desktop, and full-size mixed-workload memory stability, remain unqualified.
- Validate against varied real-world scans, complex tables and layouts, more languages for digital extraction, and larger mixed PDFs. Tiled OCR remains deferred pending evidence of accuracy gains within the memory budget.
- Local WebKit could not launch because the Linux host lacks required GTK and related libraries. Physical Safari, iOS Chrome, Android Chrome and Samsung Internet, Windows Chrome and Edge, macOS Chrome, mobile file sharing and assistive-technology behavior still need device results. Narrow-width Chromium is a desktop simulation.
- The tool has static usage, privacy and supported-feature copy, as well as a sitemap entry using the site's existing domain placeholder. Production canonical and sitemap checks await host configuration. Field Core Web Vitals and full WCAG 2.2 AA qualification remain open.

## Reproduce

Run `node scripts/provision-scanned-pdf-ocr-model.mjs` and `node --test tests/scanned-pdf-ocr*.test.mjs` from the repository root. The isolated qualification workflow installs the browser harness and runs `python -u tests/scanned-pdf-ocr-browser.py --stress`, plus shorter narrow-width, Firefox and WebKit runs. Force an available browser executable with `--executable` when required.
