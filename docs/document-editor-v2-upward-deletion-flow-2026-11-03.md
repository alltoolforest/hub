# PDF deletion and upward flow — 2026-11-03

The reported error was a legacy blanket refusal: "Finish line deletion compaction before adding new text on the same page." Existing inserted/reconstructed paragraphs and native line deletion were deliberately incompatible in the old wrapper. The user confirmed downward flow and requested the opposite operation.

Changes in Document Editor only:
- Map released source rows through the existing downward/page movement ledger, then compact the actual output page. Removed the blanket insertion/cascade exclusions; unsafe geometry still refuses atomically.
- Retain the exporter's page/chunk validation checks through upward compaction, so multi-page paragraphs are not incorrectly checked as a single source-page string.
- Handle each released row when shortening/deleting multiline native blocks. Normalize PDF.js font document prefixes when measuring row advance.
- Allow clearing an expanded or added paragraph. Remove its insertion and source pairing together, with undo/redo and recovery, then rebuild pagination from the original source.
- Position native edit hits using both flow directions, suppress removed-row hits, and use stable block identities in the insertion bridge. Normalize new insertion coordinates before final upward compaction so adding after deleting does not shift intent twice.
- Preserve explicit upward object maps and continuation-page counts. Added-object overlap protection remains.
- Respect embedded Form XObject bounding clips and explicit path clipping when inspecting painted graphics. This prevents invisible copies of header graphics in cropped page slices from falsely blocking another edit. Unknown geometry and unsupported groups/shading remain protected.
- Keep successive row-compaction slices in the same PDF context to avoid importing resources repeatedly.

Validation:
- 157 Document Editor unit tests pass, including partial/whole multiline release, row pitch across PDF.js document prefixes, upward object overlap protection, cropped Form paint bounds and malformed-clip protection.
- Supplied PDF browser scenarios passed: original-line deletion; deletion after expansion; expansion after deletion; clearing an expanded paragraph; shortening a 100-line paragraph; adding text after deletion; deleting a line already moved to a later page through Find/replace; and adding after an expanded paragraph plus deletion.
- Checks assert removed text is absent, following content moves upward for deletion, earlier page content/positions stay unchanged, remaining content survives, and export/undo/redo/reload recovery agree. When more text is subsequently added, its downward displacement may offset the earlier upward movement.
- Shortening the long paragraph reduces generated continuation pages.
- The exported deletion-after-expansion page was rendered and visually reviewed.
- Ten complex PDFs pass 39/39 checks; image/link/upward movement and stationary form-widget regression also passes.

Continuation previews remain inspection views: edit a flowing paragraph from its starting page, or use the PDF Find/replace workflow for a moved native line. This change does not promise unrestricted editing through every protected PDF layout or exact Word pagination. Physical-device acceptance and freeze remain pending the user's verification.

Only the Document Editor paths, isolated PDF copy, tests and this report are changed. The private source PDF and generated copies are not committed. Frozen Edit PDF and all other tools are untouched.
