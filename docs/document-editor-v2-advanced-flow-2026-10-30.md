# Document Editor advanced Word and PDF flow — 30 October 2026

## Scope and release decision

This release expands the existing Document Editor. Changes are restricted to its modules, its isolated PDF engine, tests and this report. The frozen Edit PDF implementation and other tools are unchanged by this release. Concurrent Organize PDF changes are retained from upstream main.

The editor remains **unfrozen**. The supported cases below pass automated checks; full Microsoft Word layout fidelity and arbitrary PDF object flow are not claimed.

## Implemented

### Word

- Grid-based row/column insertion and deletion, rectangular merge and split, horizontal and vertical merged cells, and preservation of nested table content. Deleting a merged anchor row retains its content in the surviving merge. Operations reject malformed grids, tracked structures and continuation cells containing hidden content.
- Paragraph-style creation and updates, base-style validation with cycle refusal, font formatting and optional paragraph layout. Unmodified package properties remain preserved.
- Separate section preview geometry, section dimensions/margins, optional equal-width columns and section-start settings. Geometry changes do not silently overwrite existing unequal column definitions.
- Inline/floating image conversion and position references, offsets and wrapping settings in exported DOCX. Preview placement remains approximate.
- Dedicated rich-content paste supports formatted paragraphs, nested/merged tables and embedded PNG/JPEG images. Remote image URLs are refused atomically. This does not implement rich table/image replacement at an arbitrary normal editing selection.
- All advanced commands retain existing undo and draft-recovery integration.

### PDF

- Verified source-to-destination flow maps carry added images and link rectangles across pages without mutating draft coordinates. Whole original graphics move within reconstructed page slices; editing an original image's identity inside those slices remains protected.
- Whole supported AcroForm widgets and links move within and across pages. Field values and appearance graphs are checked against the expected translated geometry. Crossing widgets and uncertain form structures remain protected.
- Scanned receiving pages can participate in native cascades when rendered full-width whitespace proves the cuts safe. Original scan imagery is retained as page slices rather than regenerated from OCR text.
- Mixed native/OCR export composes edited OCR page snapshots before native reflow, preventing a late OCR replacement from erasing flowed content.
- Ambiguous original hyperlink matches are refused instead of guessing an annotation identity.

## Verification completed on this revision

- **107/107 unit/integration tests**: `node --test tests/document-editor-v2-*.test.mjs`. Includes frozen-source isolation, form-value tampering rejection, cross-page field/link movement, Word tables/styles/sections/paste, spreadsheet/text/workspace regressions, and 75 deterministic Unicode edits within one test.
- **60/60 complex Word checks** across five generated fixtures: package round trips, content and protected-part preservation, editing and recovery. JSDOM checks do not establish visual Word fidelity.
- Advanced Word browser regression passes; new multi-section/table/image/style/paste/export/recovery scenario passes in Chromium at **1280px and 390px**.
- **39/39 functional checks** across the ten-PDF corpus, including native editing, unchanged export, undo/redo/recovery and live OCR.
- **66 rendered comparisons across 19 PDF exports** pass: unchanged pages are pixel-identical and sentinel edits stay within the expected region. Existing native expansion retains exact source/replacement word multiplicity.
- Mixed native/scanned corpus expansion succeeds from four to five pages and survives recovery.
- Dedicated browser flow test: original red image and added green image both render only on the expected destination page; all **12 scanned text bands** survive; OCR correction and eight inserted native lines remain present. Three-page output verified. This checks OCR snapshot composition, not recognition accuracy for arbitrary scans.

## Remaining limitations

- Word preview still approximates floating wrapping, continuous/odd/even section pagination, unequal columns, complex numbering, character/table styles, fields and first/even header/footer behavior. No Microsoft Word comparison or full style/layout parity certification was performed.
- Rich block paste uses the Advanced Word panel, and embedded PNG/JPEG images; remote images and unsupported structures are protected.
- PDF cuts crossing a widget/object or nonwhite scanned band may be refused. Rotated scans, scans beyond the rendering budget, XFA/unknown form geometry and signed PDFs remain protected. Arbitrary object rearrangement and original-image mutation inside reconstructed slices are not supported.
- Chromium phone-width checks are not physical Android/iOS testing. Safari, Firefox, IME/touch, large-file stress and desktop Word interoperability still require acceptance testing.

Do not treat passing synthetic tests as a guarantee that every uploaded document can be safely reflowed or as approval to freeze the full requested scope.
