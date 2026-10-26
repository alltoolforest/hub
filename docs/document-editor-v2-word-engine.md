# Document Editor V2 — Word engine

Updated 2026-10-21. Branch: feature/document-editor-phase1.

The user requested starting Word after discussing it as the next engine. This
supersedes the earlier PDF-first pause for this workstream; the PDF implementation
remains incomplete at its recorded checkpoint. Testing remains deferred until
all engines are built. No test runs, builds or syntax checks were performed.

## Implemented in this checkpoint (unverified)

- DOCX run font family, point size, bold, italic and RGB colour detection,
  combining document defaults, paragraph/character style ancestry, Latin theme
  fonts and direct run properties. Mixed runs are displayed individually.
- Active paragraph font controls, explicit paragraph-wide formatting, and run
  formatting retained for existing text edits. Selected-run information populates
  the controls. Font substitution is disclosed; fonts are not downloaded.
- Append new editable paragraphs with inherited active formatting. Existing text
  supports insertion/deletion and plain-text paste. New paragraphs are real Word
  paragraphs on export. Enter in existing text remains a line break; Enter in a
  newly appended paragraph appends another paragraph at the document end.
- Formatting and additions participate in workspace undo/redo and local drafts.
  Older text-only snapshots remain readable. Draft formatting is validated before
  state is changed. DOCX export keeps the source ZIP parts and applies text and
  format changes to document.xml, then reopens output for runtime text checks.
- Browser column pagination using the first section's page dimensions/margins,
  with forward/backward flow, page navigation, resize and font-load updates.
  This is an approximate preview, not verified Microsoft Word pagination.

## Remaining implementation

- True caret-position paragraph split/merge, insertion anywhere, deletion of
  paragraph structure, range-level formatting and rich clipboard.
- Full styles/numbering, script/theme font resolution, unavailable-font handling,
  section layouts, headers/footers, tabs, indentation, line spacing, keep rules,
  widow/orphan rules and accurate pagination across sections.
- Image/table/link editing, merged/nested table layout and preserved-object
  previews. Complex paragraphs are currently protected and can be incomplete in
  preview even when retained in output.
- Search of new paragraphs, document-wide structure edits, page insertion,
  PDF export, legacy DOC/RTF conversion, and all later verification gates.

This checkpoint does not claim the Word engine or PDF engine is complete.
Frozen tools and production routing are outside this change.


## 2026-10-21 — paragraph structure and selected-text formatting

Implemented, unverified; no tests, builds or syntax checks run per the user's
instruction to defer testing:

- Ordinary paragraphs can split at the selection/cursor with Enter. The resulting
  parts retain their source run formatting and can merge again with Backspace at
  the start or Delete at the end. Shift+Enter inserts a line break. Multiline
  plain-text paste creates paragraph parts and preserves prefix/suffix runs.
- Selected ranges in those paragraphs can receive font family, size, colour,
  bold and italic changes. Without a selection, controls format the active part.
- Source run properties are cloned for export; inserted paragraph parts inherit
  paragraph properties. Explicit page-break-before applies to the first part.
- Structure and formatting changes participate in workspace drafts/history. Draft
  restoration validates targets and source-run references before mutation. Export
  replaces each edited source paragraph with real Word paragraphs and checks
  reopened text against the complete expected paragraph sequence.
- Search/replace includes paragraph parts and appended paragraphs.
- Appended paragraphs now split at the cursor; Backspace merges adjacent appended
  paragraphs with identical formatting. Different-format merges are refused.

Remaining structural gaps: merge across two original source paragraphs; selection
across paragraph fields; unrestricted structural deletion; rich paste; paragraphs
with numbering, section properties, bookmarks, hyperlinks or complex children.
These are protected from structural edits to avoid discarding their semantics.
Paragraph style/spacing controls, complete layout fidelity, object editing,
legacy formats and other previously listed gaps remain open. This checkpoint
supersedes the earlier append-only Enter behavior where the new paths apply.

## 2026-10-21 — five-fixture validation checkpoint

User explicitly requested testing now. Added five complex DOCX fixture generators
and executable package/DOM/workspace checks. Final automated count: 76 cases,
70 pass and 6 unmet expectations (56 complex cases: 50/6; 10 Word workspace
cases: 10/0; 10 existing related regressions: 10/0). Product code was not changed
in this test task. Known missing features are not relabeled as new regressions.

Failures: nested-table preview hierarchy, simple DATE-field protection,
per-font missing-font identification, cross-original-paragraph merging,
merged-cell colspan preview, and inline-image preview. Untouched package parts
survived the sampled edits. Five no-edit exports rendered pixel-identically to
originals in LibreOffice. Growth/shortening export rendered 2→4→2 pages.

Limits: JSDOM (contentEditable reflection shim; ResizeObserver stub) and an
IndexedDB test double; actual browser execution unavailable after Chromium's
installation failed with an invalid downloaded archive. No live pagination,
mobile/device/IME, real disk recovery, Microsoft Word or complete security claim.

Repro scripts: tests/generate-word-complex-fixtures.py,
tests/document-editor-v2-complex-word.mjs and
 tests/document-editor-v2-word-workspace.mjs. The full user-facing report and
five-file test pack record all case results, coverage gaps and source hashes.

## Failure remediation — 22 October 2026

The six failures from the five-file complex DOCX suite have been addressed in the isolated Word engine:

- W17/W35: recursive table blocks retain nested hierarchy and grid spans; vertical merge cells share row spans.
- W19: `w:fldSimple` paragraphs are protected against ordinary edits, search replacement and altered text recovery.
- W22: preview reports each unavailable font using comparisons against two fallback font metrics. When canvas measurement is unavailable it explicitly reports unknown availability. Export font metadata remains unchanged. Automated missing-font detection uses controlled metrics, not real device fonts.
- W29: Backspace/Delete can join adjacent ordinary source paragraphs, preserving source run templates and resolved formatting. Snapshot restore and undo retain the merge. Table-cell, protected-content, list, section and explicit page-break boundaries remain guarded; this is not arbitrary structural editing.
- W36: embedded PNG/JPEG/GIF/WebP images are loaded from package relationships into the preview. External image URLs are never fetched; unsupported images remain preserved in export. This does not add image editing or full drawing placement fidelity.

Retest: 60 complex/targeted cases, 10 Word workspace integration cases and 10 existing DOCX/search/workspace regressions passed (80 total). The complex suite now returns a failing process status when assertions fail. The table-block regression assertion was updated to the recursive cell schema without removing its content check.

Coverage limits: Node/JSDOM UI simulation, controlled font metrics, and storage doubles do not validate browser layout, actual installed fonts, native IME, mobile interaction, or persistence across browser restarts. No real-browser/device retest or new LibreOffice visual comparison was performed in this remediation. No deployment or frozen tool changes.
