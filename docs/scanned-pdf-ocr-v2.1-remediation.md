# Scanned PDF to Text V2.1 remediation

Base: main at `03365ba7a2c07d2d9ec45b4b0b137c263fd20a55`. The scope is the tool's OCR pipeline and qualification tests.

## Defects and fixes

| Defect | Root cause and implementation |
| --- | --- |
| Missing quantities | The word-level TSV was already missing digits after automatic page segmentation. Stable table anchors and row baselines find the missing cells. A bounded crop uses line or single-word OCR, with additional numeric recognition when the first read is inconclusive. A weak decision requires matching reads from two segmentation modes and is flagged. Values come from the cropped pixels. No sequence completion is used. |
| Column-ordered tables | The TXT formatter inherited Tesseract's column order. Geometry groups aligned words into rows and cells. Tabs preserve field associations and empty cells. A grid-specific retry deletes only detected raster rules in a secondary image candidate. Borderless, ruled, repeated-value, negative-value, leading-zero, empty-cell and wrapped-description fixtures are covered. |
| Footer ordering | The two-column scan had separate Tesseract block groups and a footer assigned between them. Spatially overlapping columns are emitted left to right after introductory blocks, with outside blocks retained below the column region. |
| Low-resolution OCR | Full-page OCR misrecognized thin letters and some short words. Selected cells are re-read separately with resampling and controlled contrast. At narrow widths a bounded higher-resolution PDF tile re-reads the table. Regional disagreements and marginal readings count toward the page review indicator. Existing ordinary and rotated candidates continue through the prior path. |
| Blank raster page | Prior blank detection excluded embedded images. Conservative near-white uniformity now applies after successful strict PDF.js rendering to image-only scans as well. Faint marks and nonuniform images retain the recognition path. Oversized and failed decoding still report errors. |

## Primary manual regression

The supplied source PDF, reference, and V2 TXT export were used without publishing the fixture files to the repository. `tests/scanned-pdf-ocr-remediation.py --fixture-dir <directory>` downloads the final TXT in a browser and checks order, quantities and full rows against the supplied reference. Character error rate (CER) and word error rate (WER) collapse formatting whitespace. Table references are serialized row-first. V2 table scores therefore capture reading-order errors as well as missing values.

| Page | V2 CER / WER | V2.1 desktop CER / WER | V2.1 narrow CER / WER | Result |
| --- | ---: | ---: | ---: | --- |
| 1 | 0 / 0% | 0 / 0% | 0 / 0% | Memorandum retained |
| 2 | 63.40 / 77.55% | 0 / 0% | 0 / 0% | All twelve invoice rows and quantities matched |
| 3 | 4.44 / 6.57% | 0 / 0% | 0 / 0% | Both columns before footer |
| 4 | 62.85 / 77.55% | 0 / 0% | 0 / 0% | All twelve inventory rows and quantities matched |
| 5 | 0 / 0% | 0 / 0% | 0 / 0% | Photocopy retained |
| 6 | 0 / 0% | 0 / 0% | 0 / 0% | Automatic rotation retained |
| 7 | 0 / 0% | 0 / 0% | 0 / 0% | Deskew retained |
| 8 | 63.55 / 81.44% | 0 / 0% | 0 / 0% | All twelve statement rows and quantities matched, including the reported letter errors |
| 9 | 0 / 0% | 0 / 0% | 0.10 / 0.65% | Repeated text and fine print retained |
| 10 | Failed | Blank | Blank | Correct classification |

The supplied V2 export contained eight of the 36 expected quantities. Both V2.1 runs recovered **36/36 quantities** and matched **36/36 complete rows**. No additional quantities were present in the test output. For example, the V2 export omitted the fourth row's quantity. Its V2.1 row is `AX-203<TAB>Calibration kit<TAB>5<TAB>186.25`.

## Performance and regression evidence

- Sequential local Chromium runs of the same fixture took 15.44 s on V2 (nine processed pages) and 16.99 s on V2.1 (all ten pages). The 360 px run took 19.93 s. These are desktop-browser results.
- Combined process-tree RSS includes the browser and runner and can double-count shared pages. Sequential same-fixture samples peaked at 802.5 MiB on V2 and 818.2 MiB on V2.1. These are aggregate process samples, with no isolation of WASM memory.
- Two desktop Chromium runs on the 99.89 MiB, 500-page mixed capacity fixture took 13.10 and 12.54 seconds. Both returned all pages in order and scored 0% CER. Sampled combined process RSS was 1050.2 MiB. Published admission budgets remain 100 MiB/500 pages desktop and 15 MiB/10 pages mobile.
- The Node suite has 22 passing tests. The standalone browser test includes a separately generated table with and without rules and uses non-sequential values, repeated quantities, leading zeros, an empty cell and negative or decimal amounts. A second raster size, faint text, and a native heading on the same page as a scanned table also passed. Browser-wide regression and stress results are retained in the branch qualification workflow.
- Production runtime and model dependencies were unchanged. PDF, cell OCR and TXT handling remain browser-local. The existing network privacy, decode failure, cancellation, worker lifecycle and export checks remain in the qualification suite. WebKit coverage is browser-engine automation. It is separate from physical Apple devices.

## Qualification boundaries

The supplied fixture and independent fixtures establish the tested geometries. Tables without a clear aligned header, highly irregular or merged cells, and cases where a numerical crop is inconclusive can retain the original text or an uncertain cell. The user should review reported cells against the source. Physical device and broader public-release qualification previously documented for V2 remain open.


## Final completion qualification

- Removed the 100-row detector cutoff for aligned sections. The detector now handles up to 500 rows per section, requires repeated geometric evidence for headerless tables, and can reconstruct successive sections while retaining intervening prose. Row groups use unique right-edge agreement as fallback for headerless numeric alignment. Clearly unsupported structure is retained with a review warning. Across pages, sections remain page-local so headers and numbers from separate scans cannot be associated by guesswork.
- Numeric retry capacity varies with missing cells, row and numeric column counts, device tier and a shared per-page time/work budget. Eight row/column examples are displayed per page, with an aggregate uncertainty count. A missing cell is confirmed empty only when its sampled raster meets the conservative near-white blank test. Faint, clipped, unrecognized and skipped cells remain editable and receive review notices. The numeric recognizer accepts positive and negative values, decimal, percentage, currency and scientific forms when read from the source.
- A generated 131-row geometry fixture verifies long headerless sections, repeated values, leading zeros, currency and scientific notation. A browser fixture covers two headerless tables separated by prose, followed by a continuation page. Additional tests cover budget exhaustion, reported locations, existing ruled/borderless/mixed/faint fixtures and TXT integrity. Broad merged or irregular tables can still use plain-text fallback. There is no cross-page merged-cell inference.
- The original 10-page fixture retained 36/36 quantities and 36/36 complete rows in local desktop and narrow Chromium. Desktop CER/WER remained 0% for the nine text pages. Narrow Chromium page 9 retained its previously measured 0.10% CER and 0.65% WER.
- The isolated workflow executes the structured browser fixtures and general OCR suite in Chromium, Firefox and WebKit and repeats capacity tests. Tested network, sanitization and output flows use the same existing local runtime. Devices supporting native sharing and physical mobile memory qualification were unavailable. Keep 15 MiB/10 pages mobile and 100 MiB/500 mixed pages desktop. Production remains on HOLD pending independent review and device qualification.
