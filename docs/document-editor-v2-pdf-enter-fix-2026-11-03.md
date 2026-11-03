# PDF Enter text-loss fix — 2026-11-03

The reported declaration screenshot showed a native PDF text edit. Reproduced with a synthetic declaration PDF: place the caret at the start of the declaration, press Enter and Done, then export. Before this fix the declaration sentence disappeared from extracted output.

Cause: the legacy multiline click interceptors split a replacement into a committed first line and a later Add Text operation. A leading Enter committed an empty replacement. The separate append depended on finding a reference that had just been deleted; failures were only logged, leaving the deletion committed.

Fix: remove both legacy multiline interceptors from the isolated Document Editor copy. Native edits now retain the full input and use the existing checked replacement/paragraph-expansion path, which validates the complete preview before committing either source neutralization or reconstruction. A rejected expansion retains the full input and original session. Undo/redo and recovery operate on the complete paired paragraph.

The exporter also distinguishes paired paragraph reconstruction from user deletion. An Enter-only movement retains the same words; testing the neutralized source as a standalone deletion incorrectly rejected such exports. Paired insertion validation now verifies the reconstructed text; ordinary deletion checks remain. Missing, mismatched, empty or non-empty-clear pair metadata is rejected. Versioned imports refresh the changed PDF module chain; the earlier iPhone save behavior is retained.

Validation:
- 147 Document Editor unit tests pass, including malformed expansion-pair rejection.
- Six browser scenarios: leading Enter, two leading Enters, middle Enter, trailing Enter, unsupported glyph refusal and excessive expansion refusal. Supported cases verify exported text and coordinates, surrounding content, one-step undo/redo and reload recovery. Refusals retain input and leave undo unavailable until an actual edit commits.
- Preview screenshot visually reviewed: declaration and surrounding text remain visible without overlap.
- Existing native PDF edit, autosave, undo/redo, recovery, search/replace and download browser checks pass at 1280px and 390px. Updated their selector flow to open the existing More tools group before search.
- Ten complex PDF corpus: 39/39 checks pass (including native, scanned/OCR, mixed, forms, images/links, rotated/cropped, overflow and encrypted inputs).
- PDF object-flow browser check passes for moved link/image positions, surviving text and stationary form widget.
- PDF automatic download and fresh-tap retry produce identical valid bytes.

Scope: only Document Editor and its isolated PDF copy/tests. Frozen Edit PDF and other tools are untouched. The exact user PDF was not attached; manual confirmation with that source is still required before freeze.
