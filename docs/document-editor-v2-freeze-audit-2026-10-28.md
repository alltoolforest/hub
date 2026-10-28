# Document Editor pre-freeze audit — 28 October 2026

## Decision

**Do not freeze the full requested feature scope yet.** This release repairs audit findings and completes additional bounded Word editing capabilities. Passing checks establish the tested scenarios, not universal PDF/Word fidelity. Complex PDF and Word limitations listed below remain explicit; their protection checks were not removed to simulate support.

Only Document Editor modules, its isolated PDF copy, tests and this report are changed. The frozen Edit PDF source-hash audit passes. The shared main branch's concurrent PDF Compressor build commit `2ad58df` was retained unchanged.

## Delivered improvements

- Create a default header or footer for an existing section, with proper package parts, content types and relationships. Existing parts remain intact. Creation explicitly replaces inherited content for that section and later linked sections; first/even-page variants and field editing remain out of scope.
- Continue a preceding explicit list; create letter/Roman lists; preview numbering inherited through paragraph styles, start overrides and basic level restart rules. Removing numbering writes explicit `numId=0`, preventing inherited numbering from reappearing.
- Insert an inline image after a chosen body paragraph or at document end. Resize, replace and delete single raster drawings, including anchored drawings while retaining their placement metadata. Preview approximates floating placement. Grouped drawings remain protected.
- Insert/delete rows with horizontal grid spans while retaining the table grid. Column edits still require a rectangular table. Vertical merges, nested tables and tracked cells remain protected.

## Audit fixes

1. Zero section margins no longer fall back to 72pt in preview.
2. Image preview uses the exported width/height ratio; nonuniform resizing no longer appears at the original ratio.
3. Clipboard indentation between HTML blocks no longer creates phantom paragraphs. Explicit empty paragraphs survive. Invalid font sizes/families fall back to surrounding formatting. Excessive nesting is rejected with a visible status rather than an uncaught single-paragraph paste error.
4. Newly appended paragraphs receive focus at the actual end of the document.
5. Undo/recovery invalidates a pending asynchronous advanced operation even when text snapshots happen to match, preventing an obsolete operation from committing over restored state.
6. Unknown image actions are rejected, and replaced embedded images lose obsolete external link references. Relationship reuse excludes external targets.
7. Numbering XML parsing now rejects malformed parts; zero starts and style-level numbering suppression are respected.
8. PDF cascades revalidate hyperlink ownership after final text-boundary snapping, before reconstructing the destination page.
9. PDF page graphics are inspected with their transformation matrices at final source, destination and carry-page cuts. Crossing raster/vector objects and uncertain grouped graphics are protected against slicing. The same check covers upward compaction. This is a preservation guard, not arbitrary cross-page object editing.
10. Carry-page inspection retains a serialized donor snapshot because removed donor pages are no longer in the page tree; text inspection receives a copy so worker transfer cannot detach the recovery geometry bytes.

The initial graphics guard falsely rejected a stationary form-field appearance. Regression checks caught this before publication. Graphics inspection now excludes annotations; existing dedicated form/link checks still validate them. The corrected form integration test passes.

## Verification

- 99 automated cases pass. These include frozen-source isolation, PDF forms/objects/drafts/conversion, Word formatting/ranges/clipboard/advanced commands, spreadsheet, plain text and workspace tests.
- One automated case additionally executes 75 deterministic Unicode cross-paragraph replacements, verifying exact text through real DOCX export/reopen, package-part preservation and undo. These are included in the 99 cases, not counted as 75 extra test cases.
- Five complex Word fixtures: 60/60 checks pass.
- Ten complex PDFs (34 source pages): 39/39 functional checks pass.
- Independent PDF comparisons: 66 page comparisons over 19 exports pass; unchanged output is pixel-identical and edited output differs only in the intended sentinel region. Page geometry/form values and source digests are checked.
- Native cross-page expansion still produces three pages from two, survives recovery and retains exact expected word multiplicities. The form-sentinel and mixed-scan expansion probes remain guarded limitations with original content retained after reverting the attempted edit.
- Chromium advanced Word checks pass at 1280px and 390px, including real downloads, table undo/redo, headers/footers, lists, images, formatted paste, new-paragraph layout and IndexedDB recovery.
- Existing Word range checks (9), paragraph-layout checks (desktop/phone) and TXT/DOCX/XLSX/CSV browser edit/export checks pass.
- PDF browser integration checks moved image pixels/link coordinates, retained text, and stationary field values/geometry.

Reproduction uses `tests/document-editor-v2-*.test.mjs`, `tests/document-editor-v2-complex-word.mjs`, the `document-editor-ten-pdfs-*` scripts and the Word/PDF browser suites. Browser scripts accept `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `DOCUMENT_EDITOR_URL`.

## Remaining freeze blockers / unsupported scope

- Word: vertical/nested/tracked table structure editing; arbitrary floating-image positioning/grouped drawings; fields and first/even headers/footers; full style-definition editing and numbering fidelity; accurate per-section preview; table/image rich clipboard import.
- PDF: editing original image identity inside reconstructed slices; arbitrary cross-page image/link relocation; mixed OCR/native cascades; moving form widgets/XFA/form cascades; complete unlabelled header/footer recognition. New graphics protection may conservatively refuse complex clipping/grouped content.
- Compatibility and acceptance: physical Android/iOS/Windows/macOS, Safari/Firefox, IME/touch keyboards, large-file/resource stress and Microsoft Word layout comparison are not certified by these Chromium/synthetic checks. Legacy DOC/XLS remain unsupported.

The editor remains unfrozen. Do not describe this audit as a guarantee of perfection or full feature completion.
