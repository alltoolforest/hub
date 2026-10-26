# Document Editor V2 — Isolated Development Status

Date: 2026-10-16. Branch: `feature/document-editor-phase1`.

The existing `documents/document-editor/` route, `assets/js/editor.js`, CSV Cleaner,
Edit PDF and other frozen tools are unchanged. The replacement is an unlinked,
`noindex` lab at `documents/document-editor-v2-lab/`. Nothing here is deployed.

## Verified foundation

| Area | Current lab behavior | Evidence |
| --- | --- | --- |
| File routing | Signature and extension checks for DOC, DOCX, PDF, XLS, XLSX, CSV and TXT; ZIP directory checks, unsafe path and macro rejection | `document-editor-v2-router.test.mjs` |
| Shared workspace | Local IndexedDB draft, undo/redo snapshots, recovery prompt, original file untouched, export copy | `document-editor-v2-workspace.test.mjs` covers TXT open/edit/undo/failed replacement and export without IndexedDB |
| Find / replace | TXT and editable DOCX paragraphs: literal search, next/previous, case/whole-word options, replace/all, one undo step per action; protected paragraphs excluded | Search tests and workspace undo/export integration |
| TXT | UTF-8 text editing and validated export | Workspace test |
| DOCX | Paragraph text edits in a flowing preview; table cells shown in place; unchanged OOXML package parts retained | `document-editor-v2-docx.test.mjs` checks text, page break, image, table and relationships after reopen |
| XLSX | Spreadsheet cells and formulas retained in an ExcelJS workbook; export reopens and compares sheets, formulas and edited cells | `document-editor-v2-spreadsheet.test.mjs` |
| CSV | Cell editing, CSV reparse before export and formula injection check | Engine implemented; browser round-trip test pending |
| PDF | Isolated copy of native/OCR engine runs inside shared workspace with autosave, source-bound recovery, undo/redo, native search/replace, validated export, searchable OCR (Helvetica/WinAnsi), and native added-text colour | 28 `document-editor-v2*.test.mjs` tests pass, including PDF serialization, adapter/recovery and source-isolation checks; real browser gate blocked by environment |

Additional DOCX render check: a generated 35-paragraph file rendered as one page
in LibreOffice; expanding its first paragraph rendered as two pages, and
shortening it returned to one page. `pdftotext` retained the final paragraph in
both exports. Both pages of the expanded result were visually inspected for
overlap. This proves only the simple flowing-paragraph case, not complex layout.

Automated checkpoint: 27 focused V2 tests passed. Sixteen directly related CSV
and PDF unit regression checks passed. No browser/device test has been completed.

These are development paths, not launch-ready claims. The DOCX view does not yet
faithfully render page geometry, headers/footers or images. DOCX text edits preserve surrounding run styles; inserted text inherits the
insertion run. Fields, embedded objects and other complex paragraphs are
protected from text edits. Mixed styles are not yet rendered in the preview. XLSX output is guarded against known unsupported package
parts, but full feature preservation and formula recalculation are not proven.
Native PDF editing and guarded reflow use the isolated Edit PDF copy. PDF
acceptance remains incomplete: cross-page OCR search, native existing-text
recolouring, Unicode searchable OCR, hyperlink and image/object editing,
preservation/reflow corpus, resource/security, live OCR and browser/device
checks remain open. OCR search is currently page-local after OCR runs. DOC and
XLS are recognized but editing is disabled.

## Requirements still open

- DOC and XLS legacy import/edit/export without silent data loss.
- Rich DOCX text formatting, image operations, table structure editing, headers
  and footers, hyperlink editing, exact layout and measured cross-page reflow.
- XLSX row/column operations, cell styles, number formats, sheet rename, sort,
  filter, freeze panes, formula dependency behavior and large-sheet virtualization.
- PDF OCR search, native existing-text colour, Unicode searchable export,
  hyperlinks, image/object operations and measured upward/downward/cross-page
  reflow across a representative preservation corpus.
- Spreadsheet/PDF find and replace, PDF conversion, complete export validation, large
  file and resource limits, mobile and accessibility testing on target browsers.
- Representative corpus, malicious-file tests, pre-deployment audit, production
  audit, owner manual verification, regression and freeze gates.

## Architecture decisions before release

The current site is static GitHub Pages. It cannot run a conversion service.
The installed Mammoth library converts DOCX to simplified HTML rather than
round-tripping complex layout. The installed `pdf-lib` library can add text and
edit form fields but does not provide an API to remove or edit ordinary page
text. Neither supplies the native PDF text reflow required by the handoff.

Meeting the complete launch format list and native PDF expectations requires
evaluating a different editing/conversion engine, and likely an isolated backend
for legacy Office conversion. If server processing is selected, file upload,
retention, privacy disclosure and hosting must be designed and approved before
integration. Keep the current public editor until the replacement passes the
specified release sequence.

## Active sequence update

PDF-first development is now required. Other engine feature work is paused until
the PDF handoff requirements are complete. See `document-editor-v2-pdf-engine.md`
for the isolated Edit PDF copy, verification evidence and full PDF acceptance
tracker. The copied engine is now wired into shared autosave/history; see the latest PDF checkpoint.


## 2026-10-19 — PDF implementation checkpoint (unverified)

User requested deferring testing until all engines are implemented. No testing
or build validation was performed for this checkpoint. Document-wide OCR search
and replacement, existing native text colour, image and URL-link controls,
source-bound object recovery/export, combined page previews/thumbnails, and
searchable added OCR text are implemented in the isolated candidate. See the PDF
workstream tracker for exact limits. Prior test results predate these additions.

PDF is not complete: Unicode searchable fonts, password unlocking, PDF-to-DOCX,
complex objects and safe object/mixed-page reflow coordination remain open.
Other engine feature work stays paused under the PDF-first instruction.


### Additional PDF checkpoint — Unicode OCR and DOCX conversion

Implemented Unicode hidden OCR text via self-contained ToUnicode/Type3 fonts and
PDF-to-DOCX modes for editable text extraction or page images. Conversion includes
scope disclosures, progress, cancellation, resource cleanup and memory budgets.
No testing performed. Password decryption, complex objects, coordinated reflow,
rich clipboard and editable Word layout reconstruction remain implementation gaps.


## 2026-10-19 — Word workstream started

The user's latest instruction starts the proposed Word engine now, superseding
its earlier PDF-first pause. PDF remains incomplete at its existing checkpoint.
DOCX font/style detection, paragraph formatting, appended paragraphs, draft/export
integration and approximate browser pagination are implemented but unverified.
See document-editor-v2-word-engine.md for scope and remaining work. Testing is
still deferred until all engines are built; no deployment is included.


## 2026-10-21 — Word paragraph editing checkpoint

Added cursor-position splitting and rejoining within ordinary source paragraphs,
selected-text formatting, multiline paste into paragraph parts, and search across
new/structured paragraphs. DOCX export and draft recovery include structural edits.
Appended paragraphs split at the cursor and merge when their formatting matches.
Complex structures and cross-original-paragraph merges remain open. No tests,
builds, syntax checks or deployment were performed; frozen tools were not edited.

## 2026-10-21 — Word validation authorized and executed

Created five complex DOCX fixtures. Final automated results: 70 pass / 6 fail
across 76 cases. No-edit export rendering matched each original in LibreOffice.
Browser testing remains blocked; JSDOM and storage test doubles are explicitly
limited evidence. See the Word engine tracker for failures and reproduction
scripts. No application behavior changes, deployment or frozen-tool changes.

### 22 October 2026 — Word failure remediation

Fixed the six complex-fixture failures: nested table hierarchy, merged-cell spans, simple-field protection, per-font availability reporting, adjacent original-paragraph merges, and embedded raster image previews. Added four focused regressions for merge restoration/style retention, guarded boundaries, unknown font availability and exact embedded-image bytes. Final scope is 80 automated cases, all passing; font availability uses simulated metrics and real-browser/device verification remains outstanding. See `docs/document-editor-v2-word-engine.md` for limitations. No deployment; frozen tools and PDF engine unchanged by this remediation.

### 22 October 2026 — Simple spreadsheet engine checkpoint

User requested proceeding with a simple Spreadsheet/Excel engine. Extended the existing isolated XLSX/CSV engine rather than introducing another editor or calculation framework.

Implemented column headers, 20-column/50-row grid pages, previous/next columns, direct A1-address navigation, blank-cell entry, basic source bold/italic display, and read-only guards for merged continuation and shared/array formula cells. Existing worksheet tabs, text/number/formula edits, workspace snapshots and export remain in use. Recovery validates the full draft before applying edits and captures originals for undo after recovery in a fresh engine. CSV navigation no longer pads export with the preview's empty rows/columns.

Validation: 7 automated Node/JSDOM cases pass across spreadsheet model and new UI integration suites. Cases cover navigation beyond column 50, blank edits, XLSX reopen, sampled styles/formulas/sheets, numeric identifiers, invalid draft atomicity, merge continuation protection, recovery/undo and CSV shape preservation. Real-browser/device checks remain outstanding.

Deliberate simple scope: XLSX and CSV only; XLS remains unsupported. Formula results recalculate in a spreadsheet app after export, not in-browser. This is not full Excel fidelity: charts/pivots/macros and other known unsupported workbook packages remain rejected. Sheet management, rich formatting controls, sort/filter and structural row/column insertion/deletion remain outside this checkpoint. No deployment or changes to Word, PDF, frozen tools or unrelated work.

### 22 October 2026 — Plain-text engine checkpoint

Extracted TXT behavior into `engines/text.js`, reached through the existing document adapter. Added wrap on/off, view-only font size, line navigation, Unicode code-point character count, whitespace-delimited word count, line count and cursor position. Existing literal find/replace, shared undo/redo, recovery and export remain integrated. Empty TXT files now pass routing; other empty formats remain rejected.

UTF-8 input is validated across the entire file. NUL-containing input and malformed recovery types are rejected. Unchanged exports preserve original bytes (including BOM and mixed line endings). Edited exports retain the original BOM and dominant newline convention, with a visible explanation for mixed-newline inputs. Invalid surrogate text is caught by export round-trip validation. Legacy non-UTF-8 encodings and large-file virtualization are outside this simple checkpoint.

Validation: 17 automated tests pass: five new text cases, two routing, three search, one workspace integration and six DOCX regressions. Covers original-byte preservation, edited CRLF/BOM/Unicode, invalid restore atomicity, view controls, line navigation, literal replacement, empty-file editing, invalid encoding/binary rejection, export validation and shared undo. Node/JSDOM tests do not establish real-browser/mobile behavior. No deployment or frozen-tool changes; PDF and spreadsheet engine code unchanged.

### 23 October 2026 — Deployment-blocker repair checkpoint

PDF workspace module linking, searchable-text assembly and editable Word conversion regressions are repaired. New Unicode, hyperlink, conversion and empty-TXT workspace export tests are included. Full V2 automated suite: 44/44 pass; isolated browser compilation passes. All nine copied PDF regression scripts also passed; details are recorded in the PDF tracker. Actual browser/device verification remains blocked by unavailable Chromium and invalid browser download archives; production replacement is not yet cleared. No deployment or frozen-tool changes.

### 23 October 2026 — Other PDF blockers progressed

Native encrypted-PDF support is implemented in the shared adapter using a pinned, locally served QPDF WASM worker, with password retry/cancel and source-bound decrypted recovery. Exported copies are unencrypted, as disclosed. Object edits on unaffected pages can coexist with text reflow; upward-compaction and same-page conflict checks were corrected. Final suite passes 49/49.

Real Chromium is now available through a test-only package. Desktop and phone-width PDF flows pass actual canvas rendering, IndexedDB autosave/reload recovery, history, search and download. The encrypted-browser flow also passes unlock/retry/edit/recovery/export/cancel. Earlier unavailable-browser/encryption status is superseded for these shared-workspace paths. Controlled staging review is the next release step; physical-device/cross-browser testing and the protected complex-object/same-page coordination gaps remain. No deployment or frozen-tool changes.
