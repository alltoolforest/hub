# Existing PDF text length and continuation flow — 2026-11-03

The clipping-path fix did not address the broader replacement-length problem. The final short line of a paragraph was constrained to its own narrow original width. Re-editing an expanded paragraph dropped its expandedFromBlockId pairing. Inserted paragraph drawing itself was single-page even when downstream native content could cascade.

Changes in Document Editor's isolated PDF copy:
- Infer a normal paragraph lane from neighbouring text including first-line indentation. Ordinary short final lines can use remaining page width and wrap rather than requiring the original tiny line width.
- Route layout collisions into the checked paragraph-expansion path without a percentage-of-original-length gate. Reconstructed replacements retain their detected size rather than silently shrinking to fit the old line.
- Preserve the source/insertion pair and update its displayed intent atomically during subsequent edits, undo/redo and recovery.
- Split measured visual lines into source and continuation-page frames with footer/margin clearance. Insert continuation pages before following content and expose a page-index movement ledger for images, links and form verification. Export checks validate every generated text chunk.
- Show an Expanded PDF preview when output has additional pages. Its page selector displays each output page using one canvas. The flowing paragraph remains edited from its starting page; the extra preview is an inspection view.
- Enlarge narrow inline editing fields to the inferred lane and grow their height within the screen so new lines remain visible.

Validation:
- 151 Document Editor unit tests pass, including exact blank/long-line retention, continuation frames, shifted original-page mappings and canonical form-field preservation.
- Supplied two-page PDF: short final-line growth, repeated expanded edit, a 100-line replacement and adjacent expanded paragraphs passed export, retained text exactly once, downstream ordering, unchanged earlier page, undo/redo and refresh recovery.
- A middle-page variant with an existing following page also passed long replacement and preserved the following-page sentinel.
- Long exported pages were rendered and visually inspected.
- Five Enter/refusal regression scenarios passed. The former artificial 200-blank-line refusal expectation was removed; text length now follows pagination rather than that original single-page condition.
- Ten complex PDFs passed 39/39 checks. Added link/image movement, surviving native text and stationary form-widget regression passed.

Boundaries: unsafe graphic/form/rotation cuts and unsupported glyphs remain protected. Memory and geometry validation remain. Long text can introduce space before following original content on a later page; this is bounded PDF reconstruction, not exact Word pagination. Continuation previews are view-only; modify the flowing paragraph from its starting page. No claim of unrestricted editing for every PDF layout, physical-device certification, or freeze approval.

Only Document Editor and its isolated PDF copy/tests were changed. The supplied private PDF is not committed. Frozen Edit PDF and other tools are untouched.

Preview follow-up: output-page rendering is serialized so rapid page selections cannot render concurrently into the same canvas. The latest requested page wins; superseded requests are skipped. The delivery entry points were cache-versioned again for this small presentation fix.
