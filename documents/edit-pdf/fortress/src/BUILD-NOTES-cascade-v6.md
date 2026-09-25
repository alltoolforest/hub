# Edit PDF Cascade v6 validation notes

Scope: Edit PDF only.

Target regression cases:
- Add `3.DANCING`, then `4.SINGING`: each new line must appear after the current visual list tail.
- Mixed workflow: after Add Text inserts, multiline Edit Text additions must append after the current visual list tail rather than after the original source line.
- Lower content should use available whitespace before reflow.
- When Page 1 runs out of room, whole text blocks must cascade into the existing Page 2 body before a new page is appended.
- Overflow boundaries must never cut through a text block.
- Once a source block has cascaded off Page 1, its old Page-1 hit region must no longer be interactive.
- Repeated insertions must use cumulative Page-2 bottom geometry.
- Complex annotations cause a conservative refusal rather than partial page mutation.

Exact user regression document: KAVALI SAIPRASAD two-page resume. Expected Page-1 language overflow is absorbed by existing Page 2; no Page 3 should be necessary for this test.
