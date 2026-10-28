# Document Editor: ten-PDF corpus and advanced editing checkpoint

28 October 2026. Builds on main `5c8ce64`. Changes are confined to Document Editor; frozen Edit PDF and all other tools are unchanged.

## Corpus and baseline

Generated ten synthetic complex PDFs, 34 pages total: an eight-page dense report; two-column report; vector table ledger; raster images/vector shapes/URL links; interactive text fields and checkboxes; two-page raster scan; alternating native/scanned pages; rotation/crop-box variants; dense overflow pages; and AES-256 password-protected input. Password for the generated encrypted fixture: `ForestQA2026`. Sources have recorded SHA-256 digests.

Initial and post-change browser corpus runs each passed **39/39** checks. These cover opening, unchanged export, nine native edits and downloads, undo/redo/reload recovery, form-graph preservation and real OCR recognition on the scan. OCR recognition is tested; this corpus run does not establish OCR correction accuracy or every OCR editing operation.

Independent Poppler/pypdf comparisons passed **66 page comparisons across 19 exports**: all 34 pages in unchanged exports were pixel-identical; in nine edited exports only the first-page sentinel region changed, with all remaining pages identical. Page counts, rotation, media/crop boxes, form values and source hashes were checked. These are synthetic functional tests, not large-file/performance or physical-device certification.

## Findings repaired

1. Word layout listeners accumulated after structural changes rebuilt the preview, causing stale-model browser errors. Layout listeners now dispose with pagination before rerendering.
2. Native PDF paragraph expansion clears the original text and inserts a reflowed replacement. The clearing companion was incorrectly treated as an independent upward deletion, conflicting with its insertion/cascade. It is now excluded from deletion compaction.
3. Expansion recovery omitted the clearing transaction's paired insertion ID. Drafts now retain and validate both sides, and infer the pair in older drafts that retained the insertion's source-block link.
4. Cascades could cut through a following-page text line, creating a clipped fragment and duplicate extracted words. Live text geometry now snaps following-page/carry cuts into whitespace; subsequent destinations are checked using actual incoming geometry. Ambiguous boundaries refuse the operation.
5. Explicitly labelled, separated near-bottom footer text could be treated as body content. Prepared page geometry now keeps such footer regions fixed and excludes them from body-bottom measurements. Arbitrary/unlabelled headers/footers are not guaranteed to be detected.

A dense native expansion now exports **two pages to three**, survives reload recovery, and passes whole-document word-multiplicity checks: no source/replacement words missing or duplicated. The final pages were rendered and visually inspected. Large expansion at the narrow form sentinel and expansion cascading into the mixed scan fixture remain **guarded limitations**, with original content retained after reverting the attempt; they are not feature passes.

## Advanced Word editing added

- Insert/delete rows and columns in rectangular tables. Surviving cell content/properties and table grids remain in the package. Merged, nested and tracked-cell table structure operations are refused; existing supported cell text remains editable.
- Insert PNG/JPEG images at the document end; resize, replace or delete supported inline images. Replacements use independent relationships/media parts so shared image uses are not overwritten. Floating images and non-raster drawings are protected. Browser uploads validate image decoding and resource limits.
- Edit existing ordinary header/footer text paragraphs while preserving surrounding parts, run properties and fields. Paragraphs containing fields/objects remain protected. Header/footer creation and visual object editing are still open.
- Apply paragraph styles already defined in the document; add decimal/bullet numbering or remove direct numbering. Current numbering controls explicitly restart a new list. Basic direct numbering markers preview; complete numbering/style inheritance and all list formats are not claimed.
- Change each existing section's page dimensions/orientation and margins. Export retains section references and other properties. Preview still uses approximate browser pagination and the first section geometry.
- New end paragraphs now become ordinary source paragraphs through the same package-edit path, so they support layout controls and cross-selection with adjacent original body text. Older append-only recovery records have an explicit integration action.
- Rich paste accepts text, paragraphs, soft line breaks, font family/size, bold/italic and RGB colour through an inert parser. Scripts, event attributes, images and other active/external resources are never installed. This is formatted-text paste, not unrestricted Word/HTML clipboard fidelity.

Advanced changes preserve current text edits, apply atomically and use a validated operation transcript for undo/recovery replay against the original source. Operations are limited to 30 advanced changes per session, a 20 MB resulting package and a 30 MB transcript; export/reopen continues editing. Normal typing and caret splits remain on the existing path.

## PDF coordination added

- Added image/link rectangles and original URL hyperlinks can follow verified same-page upward/downward bands. Original hyperlink identity is matched against its transformed source rectangle before applying edits. Boundary crossing and affected page-cascade destinations remain protected.
- Stationary ordinary form widgets outside the moving source/destination band can remain intact during same-page reconstruction. Widget dictionaries, values, geometry and appearance graphs are verified before export. Moving through a widget, unknown/XFA geometry, form-document page cascades and signed inputs remain protected.
- Existing unaffected-page object support and append-only page-count verification remain.

Original-image mutation inside reconstructed/nested page slices, cross-page object relocation, mixed native/OCR cascades and moving/reflowing form widgets remain unfinished. Protection checks were not removed to simulate support.

## Verification and reproduction

- Full Document Editor automated suite: **84/84 passed**.
- Five-file complex Word suite: **60/60 passed**. Its plain-text clipboard double now respects MIME type; appended-paragraph assertions await the new async operation and validate exported text rather than the old internal additions array. Original split/merge/search assertions are retained.
- Advanced Word browser checks pass at 1280px and 390px: table insertion/undo/replay, header text, styles, section layout, new-paragraph layout/cross-selection, rich paste, image insertion/resize, numbering, real export and IndexedDB reload recovery, without browser errors.
- Existing Word range suite: **9/9 passed**; Word layout desktop/phone checks: **2/2 passed**.
- PDF browser integration verifies moved image pixels, link coordinates, retained text and a stationary form widget. Node tests additionally verify downward original-link identity, form graph preservation, guarded boundaries and expansion/cascade regressions.
- Source-isolation and whitespace checks pass. Chromium phone-width tests use mouse/keyboard automation, not physical touch devices. Node PDF.js emits standard-font-data warnings; separate browser rendering and Poppler visual checks are recorded above.

Generate: `python tests/generate-document-editor-ten-pdfs.py <qa>/fixtures`.
Browser corpus: `node tests/document-editor-ten-pdfs-browser.mjs <qa>`.
Flow probes: `node tests/document-editor-ten-pdfs-flow-browser.mjs <qa>`.
Independent comparison: `python tests/document-editor-ten-pdfs-compare.py <qa>`.
Browser scripts support DOCUMENT_EDITOR_URL, PLAYWRIGHT_MODULE, CHROMIUM_PATH and CASE_FILTER where applicable. Use a local static server in the same execution namespace. All fixture/output artifacts are kept outside production routes.

## Release boundary

This checkpoint expands the supported editing scope; it does not complete every requested advanced feature. Remaining work includes merged/nested table structure editing, floating-image placement, new headers/footers and fields, complete style/list/section fidelity, rich tables/images in clipboard, original PDF image identity after reconstruction, cross-page object coordination, mixed scan/native cascades, widget-moving reflow, legacy DOC and physical/browser/manual acceptance. Document Editor remains unfrozen.
