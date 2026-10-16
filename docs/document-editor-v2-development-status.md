# Document Editor V2 — Isolated Development Status

Date: 2026-10-16. Branch: `feature/document-editor-phase1`.

The existing `documents/document-editor/` route, `assets/js/editor.js`, CSV Cleaner,
Edit PDF and other frozen tools are unchanged. The replacement is an unlinked,
`noindex` lab at `documents/document-editor-v2-lab/`. Nothing here is deployed.

## Verified foundation

| Area | Current lab behavior | Evidence |
| --- | --- | --- |
| File routing | Signature and extension checks for DOC, DOCX, PDF, XLS, XLSX, CSV and TXT; ZIP directory checks, unsafe path and macro rejection | `document-editor-v2-router.test.mjs` |
| Shared workspace | Local IndexedDB draft, undo/redo snapshots, recovery prompt, original file untouched, export copy | `document-editor-v2-workspace.test.mjs` covers TXT open/edit/undo/failed replacement |
| TXT | UTF-8 text editing and validated export | Workspace test |
| DOCX | Paragraph text edits in a flowing preview; table cells shown in place; unchanged OOXML package parts retained | `document-editor-v2-docx.test.mjs` checks text, page break, image, table and relationships after reopen |
| XLSX | Spreadsheet cells and formulas retained in an ExcelJS workbook; export reopens and compares sheets, formulas and edited cells | `document-editor-v2-spreadsheet.test.mjs` |
| CSV | Cell editing, CSV reparse before export and formula injection check | Engine implemented; browser round-trip test pending |
| PDF | Page render/navigation and additive text, with reopen validation | Engine implemented; browser round-trip test pending |

Additional DOCX render check: a generated 35-paragraph file rendered as one page
in LibreOffice; expanding its first paragraph rendered as two pages, and
shortening it returned to one page. `pdftotext` retained the final paragraph in
both exports. Both pages of the expanded result were visually inspected for
overlap. This proves only the simple flowing-paragraph case, not complex layout.

Automated checkpoint: 8 focused V2 tests passed. Sixteen directly related CSV
and PDF unit regression checks passed. No browser/device test has been completed.

These are development paths, not launch-ready claims. The DOCX view does not yet
faithfully render page geometry, headers/footers or images. Changed paragraphs
inherit the first run's character style, so mixed formatting within an edited
paragraph may be lost. XLSX output is guarded against known unsupported package
parts, but full feature preservation and formula recalculation are not proven.
PDF page text cannot currently be edited natively or reflowed; additive text is
the only PDF edit in this lab. DOC and XLS are recognized but editing is disabled.

## Requirements still open

- DOC and XLS legacy import/edit/export without silent data loss.
- Rich DOCX text formatting, image operations, table structure editing, headers
  and footers, hyperlink editing, exact layout and measured cross-page reflow.
- XLSX row/column operations, cell styles, number formats, sheet rename, sort,
  filter, freeze panes, formula dependency behavior and large-sheet virtualization.
- Native PDF text edits, scanned/mixed OCR, object editing, controlled upward and
  downward reflow, and searchable export.
- Find/replace across engines, PDF conversion, complete export validation, large
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
