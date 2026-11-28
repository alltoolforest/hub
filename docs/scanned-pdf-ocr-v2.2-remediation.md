# Scanned PDF to Text V2.2 remediation

**Recommendation: HOLD.** The 24-page stress fixture exposes remaining financial and structural errors. Metrics and the acceptance decision are based on exported browser text. No release action is authorized by this report.

## Baseline and scoring

Main was `112a4b848b5f2c4477cc2fad565e60b71d8043b3` when the V2.2 branch was created. Scoring the supplied V2.1 export independently reproduced 24/24 pages, 94.14% character accuracy, 88.96% word accuracy, 322/397 five-field rows, 281/397 exact rows, 317/397 exact quantity associations and 0/40 matched rupee amounts. The scorer collapses whitespace for character/word distance only. Table scores require the original fields, unique matching identifiers and tab separators. The private test inputs and outputs stay outside the repository.

Reproduce with `python -u tests/scanned-pdf-ocr-v22.py <fixture-directory> --output <output.txt>`. Pass `--existing <output.txt>` to score a stored export. The older independent and ten-page fixtures use `tests/scanned-pdf-ocr-remediation.py --fixture-dir <directory>`.

## Changes and disposition

| Finding | Change and remaining risk |
| --- | --- |
| Indian rupee | The original English classifier alphabet omits U+20B9. A lazily initialized, self-hosted Marathi supplemental worker reads selected grouped amounts in the existing table crops. Require exact agreement between two segmentation modes and an unchanged numeric suffix from the English reading. An observed sign or different currency is never replaced by this path. Flags cover ambiguous readings and low-confidence evidence. Ungrouped values and formats outside this targeted pass still need qualification. |
| Silent quantity column omission | Recognized quantity/amount headers now contribute evidence even if their body is sparse. A numeric segment can use a unique header-delimited interval when left anchors fail, and sparse five-column rows can retain the detected fields. Alignment can still be uncertain near lines or omitted headers. |
| Financial and exponent corruption | The regional whitelist now includes currency, signs, parentheses and exponent letters, matching the expanded format validator. Invalid filled numeric values are flagged. Valid-looking but wrong digits, signs or identifiers can still pass a format check. |
| Fragmented identifiers | Spatial re-reading handles fragmented hyphenated identifiers on desktop as well as narrow devices. Both regional candidates must agree before replacing observed text. Some identifiers still need verification. |
| Column/table reading order | Prose before or after an independently detected table has a separate gutter-based ordering pass. Side-by-side prose no longer has to use table row order. Unsupported regions retain existing recognized text. |
| Rotated tables | Orthogonal rotation uses the selected render angle for all table crops. Deskewed words can be reordered but fresh crops require a matching transform, so the tool withholds uncertain regional reads. |
| Uneven rows | Sparse-row handling and interval assignment allow additional supported cases. Merged cells, wrapped descriptions and variable baselines remain a limitation when their associations are ambiguous. |
| Thin characters and grids | Grid candidates preserve pixels where a stroke crosses a detected ruling and retain the original OCR as fallback. No generic language correction or inferred values are used. Thin text and punctuation can still be missed. |

Optional refinement has a shared page deadline and a per-operation deadline. The primary job still handles cancellation and invalid PDF decoding. After an optional failure, the worker is retired and initial OCR is retained with a warning. Tiles are reused only when all crop edges fit. Existing file, page and canvas limits remain in force. A sparse dark mark bypasses blank classification. The supplemental model is pinned by source and both checksum forms. Its license and provenance are included.

The isolated qualification workflow covers the V2.2 branch and verifies the local model checksum. Physical-device testing and broad real-world acceptance are pending.

## Execution evidence

The advanced Chromium run tested implementation commit `b07699214238e0fa523fa459d37778d28fdd3e47`. The local V2.1 browser replay took 76.60 s and the V2.2 replay took 81.36 s. Peak process-tree RSS was 879.8 and 908.3 MiB respectively. RSS includes the test runner and browser, and may double-count shared pages.

| Metric | Supplied V2.1 export | V2.2 Chromium | Target |
| --- | ---: | ---: | ---: |
| Page count | 24/24 | 24/24 | 24/24 |
| Character accuracy | 94.14% | 99.12% | ≥99% |
| Word accuracy | 88.96% | 96.08% | ≥98% |
| Five-field rows with expected ID format | 322/397 | 363/397 | 397/397 |
| Exact rows | 281/397 | 330/397 | 397/397 |
| Exact quantities by unique ID | 317/397 | 351/397 | 397/397 |
| Unique identifier matches | 322/397 | 363/397 | 397/397 |
| Exact amounts | 291/397 | 348/397 | 397/397 |
| Exact adjustments | 322/397 | 362/397 | 397/397 |
| Signed format retained | 238/302 | 268/302 | 302/302 |
| Exact scientific values | 55/63 | 61/63 | 63/63 |
| Empty cells retained | 59/83 | 79/83 | 83/83 |
| Exact rupee amounts | 0/40 | 21/40 | 40/40 |

| Page | Before CER / WER | After CER / WER | Exact rows before → after |
| ---: | ---: | ---: | --- |
| 1 | 0.47% / 3.72% | 0.23% / 2.13% | 14/17 → 17/17 |
| 2 | 0.48% / 3.85% | 0.08% / 0.55% | 14/17 → 16/17 |
| 3 | 0.39% / 3.23% | 0.39% / 3.23% | 15/17 → 15/17 |
| 4 | 0.00% / 0.00% | 0.00% / 0.00% | 17/17 → 17/17 |
| 5 | 2.87% / 4.84% | 3.26% / 5.38% | 7/15 → 8/15 |
| 6 | 34.78% / 41.98% | 0.34% / 2.16% | 7/8 → 6/8 |
| 7 | 0.56% / 4.32% | 0.08% / 0.54% | 13/17 → 16/17 |
| 8 | 0.23% / 2.19% | 0.23% / 2.19% | 17/17 → 17/17 |
| 9 | 0.14% / 0.97% | 0.00% / 0.00% | 14/16 → 16/16 |
| 10 | 0.39% / 2.69% | 0.47% / 3.23% | 13/18 → 12/18 |
| 11 | 5.24% / 22.34% | 9.41% / 29.79% | 0/17 → 0/17 |
| 12 | 0.39% / 3.23% | 0.39% / 2.69% | 15/17 → 16/17 |
| 13 | 11.13% / 16.39% | 0.24% / 2.19% | 0/17 → 17/17 |
| 14 | 0.16% / 1.08% | 0.16% / 1.08% | 15/17 → 15/17 |
| 15 | 0.08% / 0.53% | 0.08% / 0.53% | 16/17 → 16/17 |
| 16 | 3.02% / 6.88% | 2.86% / 5.82% | 9/15 → 10/15 |
| 17 | 0.42% / 3.36% | 0.30% / 2.52% | 22/26 → 24/26 |
| 18 | 7.09% / 22.16% | 1.34% / 17.30% | 0/17 → 2/17 |
| 19 | 4.18% / 25.42% | 0.57% / 4.52% | 0/17 → 14/17 |
| 20 | 34.88% / 43.34% | 0.29% / 2.48% | 7/8 → 8/8 |
| 21 | 0.45% / 3.61% | 0.30% / 2.58% | 16/18 → 18/18 |
| 22 | 0.16% / 1.08% | 0.16% / 1.08% | 17/18 → 17/18 |
| 23 | 0.31% / 2.75% | 0.31% / 2.75% | 16/17 → 16/17 |
| 24 | 0.24% / 2.16% | 0.24% / 2.16% | 17/17 → 17/17 |

The 10-page acceptance fixture passed in 16.49 s in desktop Chromium. All 36 quantities and full rows matched and the blank raster remained blank. Independent table fixtures also passed. In an additional six-row synthetic raster invoice, all six rows matched exactly, including all five currency symbols, two separate grouped rupee amounts, identifiers, leading zeros, percentages and signed exponent notation. It completed in 2.87 s.

The 99.89 MiB, 500-page desktop stress fixture passed twice in 12.51 and 13.50 s. All pages were in order with 0% character error. Combined process-tree RSS was 1,041.6 MiB. Device limits are unchanged. The Git diff from main is limited to Scanned PDF to Text, its assets, tests and documentation.

The remaining failures include low-resolution finance on page 11, right-aligned identifier corruption on page 18, uneven and wrapped rows on pages 5 and 16, and 19 unverified rupee amounts. Overall character accuracy hides these material field failures. Physical-device behavior, broad field accuracy, and an explicit zero-silent-financial-corruption guarantee remain unverified.

[Qualification workflow for the implementation commit](https://github.com/alltoolforest/hub/actions/runs/46111584348)

GitHub Actions completed with `qualify: success` on the implementation SHA above. All 27 Node tests passed. General OCR and structured-document regressions passed in Chromium, Firefox, and WebKit. Desktop and mobile-width capacity steps passed, along with the model integrity checks. The advanced fixture is kept outside CI. Its Chromium TXT download matched the scored recognition output byte for byte in a second 81.03-second run. The separate full 24-page local Firefox attempt hit the 250-second test-harness timeout and did not produce a verified final export. No 24-page WebKit or physical-device result is claimed.
