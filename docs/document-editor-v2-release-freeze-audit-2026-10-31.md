# Document Editor updated release and freeze audit — 31 October 2026

## Decision

Deploy the tested update. **Do not declare the complete requested Document Editor scope frozen yet.** No failures remain in the checks listed below, but exact Word layout and unrestricted PDF flow have known unsupported cases. Passing synthetic checks cannot establish those capabilities. Physical-device and cross-browser compatibility work remains deferred as requested, rather than counted as a blocker in this audit.

Changes are restricted to Document Editor modules, its isolated PDF implementation, related tests and this report. Frozen Edit PDF and other tools are unchanged. Newer Organize PDF work from upstream main is retained.

## Updated behavior

- First/default/even header/footer creation, PAGE/NUMPAGES/SECTIONPAGES fields and surrounding-text edits that preserve field instructions/results. First-page mode is enabled per section; even-page mode is explicitly document-wide. Field chains spanning paragraphs and complex objects remain protected.
- Multilevel list definitions, level selection, start values, label templates, continuation of preceding explicit/style-based lists, decimal-zero display and legal-number labels.
- Unequal section column definitions with validated widths/gaps. The preview positions whole existing paragraphs/tables in authored column tracks without replacing editing nodes. Oversized blocks remain visible. The audit corrected an extra blank-page count at an oversized final block.
- Floating-image horizontal alignment and wrap distances; supported image-only, paragraph-anchored left/right square wrapping now has rendered preview. Protected-image placeholders no longer insert artificial prose into layout.
- PDF graphics inspection handles bounded repeated/grouped raster-image transforms rather than rejecting all such operations. Invalid transforms and uncertain transparency/shading groups remain protected.

## Verification

- **121/121 automated tests pass.** Includes frozen-source isolation, all four editor engines, draft recovery and the new header, numbering, unequal-column, image-wrap and repeated-image checks.
- **60/60 complex Word checks** pass across five generated files.
- **39/39 functional checks** pass across ten complex PDFs.
- **66 rendered comparisons over 19 PDF exports** pass. Unchanged output is pixel-identical; sentinel edits stay within the expected region. Expanded native text retains exact expected word multiplicities.
- Rendered floating-wrap check measures text clearing the image and returning to the original left edge below it. The initial test incorrectly used the final character's horizontal position as the left edge; it now checks actual line rectangles.
- Advanced Word, multi-section/style/table/image/paste workflows, unequal-column/header export and real IndexedDB recovery pass. The browser test reselects section 2 and enables column editing after rerender, matching the actual control state.
- Existing Word range checks pass, including protected table boundaries and deletion compacting the preview.
- Mixed PDF flow retains **1,920 red pixels** across three original images, **640 green pixels** in the added image, all **12 scanned text bands**, native inserted lines and an OCR correction. Output remains three pages with the images on the expected destination page.
- Original PDF object-flow regression passes for image/link movement, retained text and a stationary form widget.

## Remaining work by engine

| Engine | Remaining work / limits |
| --- | --- |
| Word | Arbitrary offset/tight/through floating wrapping; precise pagination matching Word; splitting long paragraphs and tables across unequal columns; repeated first/even header/footer preview; complete conditional table styles, numbering/style interoperability and complex fields. Export preservation is broader than preview fidelity. |
| PDF | Objects crossing fixed side/footer bands; cuts through scans without verified whitespace; shading/transparency groups, rotated scans, XFA/unknown forms, signed files and editing original-image identity inside reconstructed slices remain protected. These are not silently flattened or discarded. |
| Spreadsheet | No new blocker found for the supported basic XLSX/CSV workflows. Formula recalculation occurs in a spreadsheet application. Charts, pivots, macros, external links and legacy XLS remain outside the simple engine's supported editing scope. |
| Plain text | No confirmed blocker in tested UTF-8 editing/export, search/replace, undo/recovery and line-ending handling. Other encodings and binary files remain unsupported. |

## Freeze gate

The current bounded release can proceed to user acceptance, but freezing the **full previously requested scope** would be inaccurate while the Word/PDF gaps above remain. Resolve those gaps or explicitly agree to a bounded launch scope before applying the permanent freeze label. Do not present compatibility certification or Microsoft Word pixel parity as completed.
