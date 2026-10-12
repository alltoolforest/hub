# PDF Compressor v2 — isolated work area (Task 1)

This directory is **reserved** for the PDF Optimizer → PDF Compressor replacement.

- Source-of-truth blueprint: AllToolForest PDF Compressor Remediation Master Blueprint v1.0.
- Task 1 creates the isolation boundary and reproducible test corpus only.
- There is **no compression engine, UI, worker, dependency, routing change, or deployment** in this directory.
- Existing production tool: `documents/pdf-compressor/index.html` → `assets/js/app.js` → `assets/js/pdf.js`.
- Source-of-truth production legacy algorithm is documented in `docs/pdf-compressor-task1-baseline.md`.
- Do not import from here in a production route or shared frozen-tool module until later tasks are approved and verified.
- For any future changes, preserve the original and establish task-specific checkpoints. All frozen tools remain protected.
