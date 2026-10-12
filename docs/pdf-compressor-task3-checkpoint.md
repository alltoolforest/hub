# PDF Compressor — Blueprint v1.0 Task 3 checkpoint (isolated)

**Status: BLOCKED / PARTIAL. Do not describe Task 3 as completed.**

## Exact Task 3 scope
Embedded-Image and Scanned-PDF Compression: meaningful compression for embedded images and scans without changing page layout, dimensions, rotation, masks, transparency, color spaces, shared image references, selectable text or OCR. Balanced/Strong should have honest quality behavior. Unknown image encodings are unchanged or explicitly rejected; never rasterize full pages. Acceptance: measurable savings on independently sourced unoptimized scans, no damaged images or missing content, stable appearance, and measured mobile memory.

## Task 2 checkpoint protected
Task 2 was marked PASS as conditional architecture selection on PR #186, head `73503bfa6caa22b1a0d7f4b29dad32fc58ed3cad`. The chosen qpdf-family WASM binary is **not approved for production**; browser-native image encoding alone is not PDF-resource replacement. No Task 2 file is modified here.

## Work performed within Task 3
- Added a read-only PDF embedded image XObject inventory probe for synthetic scan, image-heavy, mixed, digital fixtures.
- Probe inspects dimensions, encoding filter, color spaces, masks and image stream byte lengths; checks it does not mutate source bytes.
- Explicitly **does not** recode or rewrite resource streams, flatten pages, change shared engines, integrate UI, alter previous tests, or deploy.

## Blocking dependencies and safety rule
The Task 2 decision assigns **Task 4** to selecting/integrating a supported PDF-aware structural engine and **Task 5** to verifying safe embedded image replacement for soft masks, indexed/ICC color, transparent content, shared references and OCR. Task 3 cannot be truthfully certified as complete without those dependencies; doing those jobs now would violate the instruction not to pre-implement later tasks. Do not silently use legacy `copyPages` to claim a size reduction: it loses forms, outlines and tags.

## Remaining Task 3 acceptance tests (not yet completed)
1. Safe embedded image compression, Balanced and Strong, with actual output byte measurements across independent real-world scanned/photo/color/grayscale/mixed/transparent/OCR PDFs.
2. Check content streams/graphics transforms and resource pointers, rendered before/after pixel comparisons, image transparency/color/rotation and complete selectable text/OCR retention.
3. Measure high-memory and constrained Android/iOS runtimes; stress/cancellation and unsupported encoding safely fail-closed.
4. Verify full output independently and reject larger, invalid, changed or unverifiable results.

No user-file data used or committed. No production changes. No claims about mobile devices from desktop browser simulation. Stop before Task 4.

## Unresolved issue
Architectural sequence is inconsistent if Task 3 is required to fully implement image-resource replacement **before** Tasks 4 and 5. Defer its completion gate instead of introducing unsafe production processing or working ahead.
