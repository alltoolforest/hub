# Document Editor flow checkpoint — 2026-11-01

Status: local implementation, not deployed; not freeze-ready. User will decide freezing after manual feature testing.

## Implemented

- Ordinary paragraphs flow across unequal columns while retaining one editable field per logical paragraph. User-created parts from Enter also paginate separately.
- Continuation typing and deletion retain original model offsets. Cross-fragment selection deletion updates the model directly, avoiding Chromium whitespace rewrites.
- Logical selection restoration handles rebuilt fragment text nodes.
- Measurement preserves inherited typography and formatting even when both endpoints lie inside one run. Visual fragments preserve those run wrappers too.
- Left/right indentation, first-line indentation, and before/after spacing are included in fragment layout.
- Clipboard serialization removes visual fragment wrappers.
- Excessive or unsupported paragraph measurement falls back to the intact block without modifying source text or leaving measurement surfaces behind.
- Table fragments preserve original editable row/cell identities and restore original row-group containers. Rowspan-zero groups are handled by section.
- PDF scan geometry uses bounded canvas strips and rejects invalid geometry/boundaries.

## Verified this continuation

- 139 unit checks pass; git diff --check passes.
- Chromium paragraph test, both plain and with indentation/spacing: unequal widths, bounded heights, one editing field, continuation typing/Backspace, cross-fragment deletion/upward flow, exact exported text, no extra model paragraph, plain/rich clipboard round trip, undo/redo, reload recovery, Enter creating two model paragraphs and flowing the second part.
- Table browser test: continuation-cell typing, 24 cells retained, one exported table with 24 rows, undo/redo.
- Existing Word layout browser checks at 1280px and 390px: controls, undo/redo, exported XML, recovery. Viewport checks are not physical-device certification.
- Real scanned PDF: six <=1M-pixel canvas strips produce exactly the same occupied-row geometry as full-page rendering, including ink crossing strip boundaries and touching page edges. This bounds canvas allocation, not the entire PDF decoder's memory.
- Mixed native/scan reflow: 3 pages, all 12 blue scan bands preserved, 1920 red marker pixels and 640 added green marker pixels preserved, OCR correction and native inserted text retained.

## Remaining before release

- Composition/IME, rich paste interaction, backward/cross-part selection, and more complex paragraph objects/explicit breaks need focused browser coverage. Browser simulation does not replace device testing.
- Exact layout for embedded/floating objects and oversized indivisible table rows is not established by the ordinary-paragraph checks. Complex merged-table layout needs more browser cases.
- Broader difficult PDF boundary cases remain unfinished; no claim of unrestricted scanned/native reflow or universal OCR recognition.
- Pre-deployment audit, deployment, production audit and the user's manual feature testing remain outstanding for this local update.

Only Document Editor code/tests/docs changed. Frozen tools and unrelated ongoing work remain outside scope.
