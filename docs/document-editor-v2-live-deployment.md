# Document Editor public testing deployment — 26 October 2026

User authorized replacing the current public Document Editor and continuing pending development on the live branch. This is a public testing candidate, not a frozen release.

- Public route: `documents/document-editor/` (same URL).
- Rollback baseline: `f120efa` on main; restore its `documents/document-editor/index.html` to return to the old editor. `assets/js/editor.js` remains intact for rollback and CSV Cleaner.
- Included: isolated V2 workspace/engines, Word/Excel/CSV/TXT editing, copied native/OCR PDF engine, local QPDF runtime, JSZip dependency and notices, and regression scripts.
- Kept: current main's other tools, site assets and ongoing work. Existing vendor manifest entries retain their exact values; only the ZIP entry is added.
- Unsupported legacy DOC/XLS files are excluded from the public picker. The page states the supported formats and protected-structure limitations.
- Pending work from the engine trackers remains open; physical devices, Safari/Firefox and wider editing/format fidelity require further verification. Nothing is frozen by this deployment.

Validation before publishing: all 49 V2 Node regression cases passed on the latest main-based candidate. Browser verification results are recorded after completion below.

The pre-replacement website snapshot is preserved remotely at `backup/document-editor-before-v2-2026-10-26`. Public-route Chromium checks passed TXT, DOCX (actual ZIP runtime), XLSX and CSV editing/export, plus PDF desktop/phone-width and encrypted-PDF edit/recovery/export workflows.
