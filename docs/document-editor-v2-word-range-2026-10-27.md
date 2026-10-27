# Document Editor Word selection checkpoint — 27 October 2026

Continues from PDF blocker remediation 85a0183. Only Document Editor Word modules, related tests and this documentation are changed. The completed PDF fixes, other engines and all other tools are retained.

## Delivered

Adjacent ordinary source paragraphs now share a browser editing host. Mouse/keyboard selections can span these paragraphs, including across preview columns/pages. Delete, Backspace, cut, typing and multiline plain-text paste apply one validated model change, preserving surviving prefix/suffix run formatting and paragraph structure. Font, size, colour, bold and italic controls can format a multi-paragraph range without merging its paragraphs.

Transactions validate endpoints, source adjacency, protected boundaries, run origins and draft limits before committing. They participate in workspace undo/redo, autosave, actual reload recovery and validated DOCX export. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y use workspace history. Browser formatting commands are refused in favour of the document formatting controls.

Source indexes remain stable for recovery: consumed source paragraphs have zero structural parts. Newly retained text keeps its original run templates and font overrides. Group wrappers are excluded from the existing nested-table test's editable-field count; nested-table hierarchy and unique actual paragraph content remain asserted.

Caret preservation avoids repainting an active selection when browser focus moves from a paragraph to its shared host. Formatting guidance is stable on initial focus so it does not shift the document during a pointer drag.

## Validation

- Current V2 Node regression suite: 62 passed, 0 failed.
- Complex Word package/model and DOM suite: 60 passed, 0 failed.
- New Chromium browser suite: 9 scenarios passed: desktop and phone-width pointer selection/formatting/deletion/upward movement/undo/redo/export/reload recovery; range typing and multiline paste; multi-paragraph formatting; native keyboard selection through section end; clipboard cut; protected table-boundary refusal; cross-page deletion reducing the preview to one page; host-boundary typing retained in an exported paragraph.
- Existing keyboard deletion/page-break browser suite: 4 cases passed, covering disabled and intentional page breaks.

The five original DOCX fixtures were reused. Completed engines were not rebuilt. Regression checks cover related functionality rather than redoing the previous entire multi-format corpus.

## Boundaries and remaining work

Shared selection is restricted to adjacent ordinary source paragraphs in one body section or table cell. Cross-cell/table, numbered/list, complex field/bookmark/hyperlink/control, section-property and intentional-page-break boundaries remain guarded. Appended new paragraphs retain their existing separate editing behaviour; selections spanning original and appended content are not implemented here.

Real IME and touch selection on physical Android/iOS devices, Safari/Firefox and Microsoft Word rendering remain unverified. Chromium at 390px is a viewport check, not physical-device certification. Composition-start selections are reduced through the same model path, but this does not certify platform-specific IME behaviour.

Advanced table/image/header/footer editing, paragraph layout controls, legacy DOC/XLS, complex PDF reflow and final manual acceptance remain open. Document Editor is not frozen.

## Reproduction

Run the standard V2 Node test glob and `tests/document-editor-v2-complex-word.mjs` with the established five DOCX fixtures. Serve the repository and run `tests/document-editor-v2-word-range-browser.mjs` with `DOCUMENT_EDITOR_URL`, `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and browser library paths configured. The browser suite generates its DOCX input internally and validates actual downloads. `tests/document-editor-v2-word-deletion-browser.mjs` retains the prior disabled/intentional-break regression.
