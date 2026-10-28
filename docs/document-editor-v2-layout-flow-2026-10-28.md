# Document Editor — Word layout and PDF object/reflow checkpoint

28 October 2026. Continues main `97b3a48`; changes confined to Document Editor modules, tests and this report. Frozen Edit PDF and other tools are unchanged.

## Word editing

The Paragraph layout panel adds left/center/right/justified alignment, spacing before/after, left/right indentation, first-line/hanging indentation, and multiple/exact/minimum line spacing. Select existing editable paragraphs, open the panel and apply the values. It operates on whole original source paragraphs, including all parts split from them; this is explicitly described in the UI. Appended-at-end paragraphs do not yet use this panel.

Preview reads direct paragraph properties and inherited paragraph-style/default properties. Layout overrides are validated before draft mutation, included in workspace history/recovery, written as Word paragraph properties, and retained when a paragraph splits. Unrelated paragraph properties and package parts are preserved. Old drafts without layout overrides remain readable. The browser preview is approximate, especially minimum spacing, font substitution, numbering and complex layouts; Microsoft Word pagination parity is not claimed.

## PDF reflow coordination

Added image/link coordinates remain source-page coordinates in drafts. Export and combined preview derive a fresh position from verified same-page upward-compaction metrics. Objects fully inside the moving region follow its shift. Header/footer/side regions stay fixed. Objects crossing a slice boundary, entering the stationary upper region, relying on original image/link identities on reconstructed pages, or affected by page cascades remain refused. Repeated export/recovery does not accumulate shifts.

Object edits on earlier unaffected pages now coexist with verified append-only page flow. Unexplained page count changes and affected cascade destinations remain protected. Form/signature guards are retained. This expands supported coordination; it is not unrestricted complex-PDF reflow, mixed OCR/native cascade support, form-aware movement, or original-object identity reconstruction.

## Validation

- Full V2 automated suite: 69/69 passed; one additional boundary/mutation test was then added and the final focused Word/PDF suite passed 11/11 (70 current test cases total).
- Existing five-fixture complex Word suite: 60/60 passed.
- Existing Word selection browser suite: 9/9 passed.
- New Word layout browser checks at 1280px and 390px: 2/2 passed, including multi-paragraph controls, preview styles, real undo/redo, download XML and IndexedDB reload recovery.
- New PDF browser integration: real native upward compaction, added-link coordinates, pixel-checked added-image rendered position and retained text passed.
- Node PDF integration also exercises real compaction output, added links, recovery/repeated exports, appended-page compatibility, guarded boundaries and non-mutating coordinate transforms.
- Frozen-source isolation checks and whitespace checks passed.

Reproduction: `node --test tests/document-editor-v2*.test.mjs`; generate fixtures with `tests/generate-word-complex-fixtures.py`, then run `tests/document-editor-v2-complex-word.mjs`. Browser runners: `document-editor-v2-word-layout-browser.mjs`, `document-editor-v2-word-range-browser.mjs`, `document-editor-v2-pdf-object-flow-browser.mjs` under tests. Supply PLAYWRIGHT_MODULE, CHROMIUM_PATH and DOCUMENT_EDITOR_URL when needed. Tests used isolated Chromium 153 and the installed Node runtime; no production dependency was added.

The first new browser attempts exposed a layout select accessible-name ambiguity (fixed with explicit labels), and missing worker initialization/incorrect cleanup in the standalone PDF test harness (corrected to use the normal worker configuration and loading-task cleanup). Successful reruns are counted above. Node PDF.js emits standard-font-data warnings; the real browser image-position check passed separately.

## Remaining scope

Word table structure/image/header/footer editing, full styles and numbering, rich clipboard, per-split-part layout, appended paragraph layout/cross-selection, complete section fidelity and legacy DOC remain open. PDF original-object remapping on reconstructed pages, downward/cross-page object movement, mixed OCR/native cascades and form-aware reflow remain open. Physical Android/iOS, Safari/Firefox, Microsoft Word rendering and user acceptance remain release-verification work. No freeze or full feature-completion claim.
