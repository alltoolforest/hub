# AllToolForest — PDF Compressor Task 1 Baseline & Isolation

**Source of truth:** PDF Compressor Launch-Ready Remediation Master Blueprint v1.0, Task 1 only.
**Baseline SHA:** `6d0b6530da248fd4af80a0eaa8d416405b46a2b2` (`main`, 2026-10-12).
**Isolated branch:** `pdf-compressor-task1-baseline-isolation-20261012`.
**Production changes:** NONE; not deployed; current name remains **PDF Optimizer**.

## Existing production architecture and immutable boundaries

Production route:
- `documents/pdf-compressor/index.html` supplies page metadata and `data-tool=pdf-compressor`.
- `assets/js/app.js` dispatches to the existing shared `assets/js/pdf.js`.
- `assets/js/pdf.js` invokes `assets/js/core.js` for file selection, error/status reporting, downloads and library loader.
- Vendored PDF library: `assets/vendor/pdf-lib.js`, declared as `pdf` in `assets/vendor/manifest.json`.
- Tool catalog/landing navigation: `assets/js/catalog.js`, `documents/index.html`, `index.html`.
- Current route preserved: `/documents/pdf-compressor/`.
- Existing method: load the input with pdf-lib; create an empty PDF; use `out.copyPages(doc,doc.getPageIndices())`; save with `{useObjectStreams:true}`. No embedded-image re-encoding or scan downsampling.
- User file bytes are handled in the browser; no compressor-specific backend route was found.
- Current shared UI is synchronous/main-thread, with responsive site CSS but no independent compressor lifecycle.

Protected/forbidden files for Task 1: **all production assets** including shared `assets/js/pdf.js`, `assets/js/core.js`, `assets/js/app.js`, `assets/js/catalog.js`, entire `assets/vendor/`, existing tool HTML, shared CSS, and all frozen-tool files. Do not touch `main`, deployed GitHub Pages, or related tools.

Task 1 allowable modifications ONLY:
1. `assets/js/pdf-compressor-v2/README.md` — inactive isolation scaffold.
2. `tests/pdf-compressor-task1-fixtures.mjs` — deterministic synthetic corpus.
3. `tests/pdf-compressor-task1-baseline.test.mjs` — Node behavior/defect characterization.
4. `tests/pdf-compressor-task1-browser.mjs` — real existing browser UI baseline.
5. `docs/pdf-compressor-task1-baseline.md` — this evidence and boundaries document.
6. `.github/workflows/pdf-compressor-task1.yml` — QA and PR file-allowlist guard.

## Fixture corpus and risk coverage

The fixture generator creates PDFs *in memory*, deterministically, with fixed timestamps and synthetic content. No customer documents or personal files are committed. Generated samples deliberately contain distinctive structures; no PDF image-compression technique is implemented in Task 1.

| ID | Synthetic category | What it establishes |
| --- | --- | --- |
| digital | Three-page native-text PDF | Page count, geometry, metadata and ordinary text |
| scanned | Two-page raster-only scan-like images | Image-only content, no OCR or selectable text |
| image-heavy | Three-page image-heavy PDF | Repeated image-encoding/resource pressure |
| mixed | Text plus embedded image PDF | Mixed native and raster content |
| form | Fillable text field with value | Existing field-loss regression |
| bookmarks | Valid nested/reference navigation outline | Existing bookmark-loss regression |
| attachment | Embedded associated XML file | Existing attachment-loss regression |
| tagged | Synthetic logical structure tree | Existing accessibility-tag loss regression |
| signed-marker | Synthetic `/Perms` catalog marker | Signature-risk detection only — NOT a genuine signed PDF |
| invalid | Malformed PDF-looking header | Safe parsing error baseline |

**Important qualification:** Synthetic scanned-like pages, signature markers and generated tagging are intentionally **not** substitutes for real-world scanned PDFs, cryptographically signed files, genuine encrypted PDFs, accessibility conformance or third-party independently validated production documents. The broader corpus must be strengthened in later approved tasks; do not misrepresent these fixtures.

## Expected-known-failure register — baseline defects, NOT acceptance criteria

- **K01** Rebuild can discard title/author and other document metadata.
- **K02** Fillable field and value lost.
- **K03** Embedded attachment `Names`/`AF` lost.
- **K04** Outline/bookmark navigation lost.
- **K05** Tagged structure tree `StructTreeRoot` and `MarkInfo` lost.
- **K06** Signature permission catalog entry lost; signed PDF integrity is not established.
- **K07** Embedded scanned images are not re-encoded/downsampled and meaningful reduction is not guaranteed.
- **K08** Poor or zero size savings, sometimes larger output, are possible.
- **K09** Invalid replacement input can clear the previous working document state (browser reproduction).
- **K10** No quality modes, compressor-specific cancellation, output integrity contract or lifecycle.
- **K11** Dedicated mobile compatibility, accessibility and performance acceptance data remain outstanding.
- **K12** The visible title is PDF Optimizer, not the future PDF Compressor.
- **K13** Some malformed PDF-looking input is parsed lazily and only fails during page access; the UI can show an unhelpful low-level exception and lose the previous valid session.

Node tests deliberately **pass when they reproduce** K01–K06. This must never be reported as a fixed defect, a valid compressor, or a launch-ready result. Future approved tasks should replace the defect-characterization tests with positive preservation tests as implementation matures.

## Baseline verification commands

Node:
`node --test tests/pdf-compressor-task1-baseline.test.mjs`

Browser:
`python3 -m http.server 8765 --bind 127.0.0.1`
`PDF_COMPRESSOR_BASE_URL=http://127.0.0.1:8765/ node tests/pdf-compressor-task1-browser.mjs`

CI:
`.github/workflows/pdf-compressor-task1.yml` runs Node and a Chromium desktop/mobile, Firefox desktop and WebKit mobile browser matrix. All tests target the **unmodified** production route hosted locally. GitHub Pages is not a test target or deployment action.

## Task 1 completion evidence and rollback

At completion record:
- exact isolated branch head and untouched main SHA;
- CI run ID, native tests passed and browser matrix results;
- PR-scope diff: only six allowlisted baseline/scaffold/docs/workflow files;
- reproducible known-defect evidence (do not claim bug fixes);
- unresolved real-world corpus gaps and feasibility dependencies.

Rollback strategy: discard the isolated branch/PR. Because the production route, shared modules and main are unchanged, no production rollback is required. Task 2 must not begin until explicit user approval.
