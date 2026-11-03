# Word-generated PDF clipping and reflow fix — 2026-11-03

The previous Enter fix was insufficient for the supplied two-page Word-generated PDF. Reproduced the current refusal: adding a leading Enter to the declaration triggered GRAPHIC_CROSSES_REFLOW_BOUNDARY inside the atomic expansion path. No source text was committed in this refusal.

Root cause: PDF.js emits `constructPath` with `endPath` for the PDF's page-sized even-odd clipping paths. The graphics collector treated those invisible paths as painted objects covering the entire page, so every content-band cut intersected a supposed graphic. The vector preflight also considered non-painted clipping paths as candidate borders.

Fix: exclude non-painting endPath operations from painted-graphics and vector-border inspection. The original PDF streams, including their clipping behavior, are retained when slices are embedded. Actual painted fills/strokes, images and form-field boundaries continue to be guarded. Updated only Document Editor's isolated PDF copy and its import versions; the frozen Edit PDF tool is untouched.

Validation:
- 148 Document Editor unit tests pass. New regression distinguishes page-sized non-painted clips from painted crossing objects.
- The actual supplied PDF passes both leading Enter and adding two new lines. Tests verify the full declaration and added text, downward movement of at least three following lines, unchanged earlier text/positions, export, one-step undo, redo and reload recovery.
- Exported page 2 rendered and visually inspected after both edits. Page 1's rendered PNG bytes match the original.
- Ten complex PDFs pass 39/39 regression checks, including native text, OCR, mixed pages, forms, images/links, rotated/cropped, overflow and encrypted inputs.
- The synthetic declaration fixture now includes the same full-page clipping construction, preventing recurrence of the original test-coverage gap. Validation waits allow up to 60 seconds for PDF work rather than the prior 10-second download timeout.

The supplied private PDF and generated copies remain local test inputs/outputs and are not part of the repository. Manual acceptance and freeze remain the user's decision.
- All six clipping-enabled declaration browser cases passed: one/two leading blank lines, middle/trailing Enter, unsupported glyph refusal and excessive expansion refusal.
