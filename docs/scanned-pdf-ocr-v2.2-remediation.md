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
