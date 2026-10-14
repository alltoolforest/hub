# PDF Compressor font and performance follow-up — 2026-10-14

The second OnePlus Nord4 report (roughly three minutes and only a small reduction) reopens performance acceptance. Earlier desktop results do not establish usable phone speed. No deployment or freeze is approved.

## Confirmed cause and scoped changes

The supplied 21,607,943-byte digital PDF contains 1,004 embedded font programs and no image streams. Strong's image stage therefore does not apply. Previously only opaque images were deduplicated. The new lossless path consolidates byte-identical, dictionary-compatible, catalog-reachable font programs while preserving individual font dictionaries, descriptors, widths, mappings and names. Custom stream dictionaries and detached font material remain intact. 810 duplicate font programs were consolidated in the provided file.

Fingerprinting treats only eligible opaque font-program payloads as shareable values, while retaining their complete dictionary and decoded-byte identity. Byte changes, width changes, custom dictionaries, detached material and aggregate decoded-byte budgets have explicit regression tests. Repeated encoded streams reuse decode/digest work only within a fingerprint operation and only with identical SHA-256 bytes and ordered filter chains.

Repeated full inspections are reused only within one compression operation for identical SHA-256 content and resource limits. Independent page inspection also computes the same exact text/placement fingerprint used by final verification, avoiding a second PDF.js parse. Custom text limits use the independent fallback reader. Failed/cancelled operations cannot populate a valid report; callers get separate report copies.

The downloadable candidate now performs bounded header/EOF checks at selection, then all mandatory structural, security, resource, independent text, protected-graph and output checks inside the compression operation. This avoids doing the full parser pass twice before the first result. The UI explicitly says full checks run when Compress is clicked. Signed PDFs still fail before optimization and cannot expose a download.

## Local evidence

- Supplied PDF: **21,607,943 → 4,873,041 bytes (77.45% reduction)** with no intentional quality reduction.
- Final feature candidate: 396 ms selection and 27,306 ms from Compress click to completed on local Linux Chromium. This is not a physical Nord4 measurement. Host timings vary; do not compare with yesterday's figures as a controlled benchmark.
- The actual downloaded output passed protected graph/exact text verification and **all three pages rendered pixel-identically in independent Poppler at 72 DPI**.
- Real independently generated repeated-TrueType fixture: 167,979 → 27,151 bytes, with independent exact text and rendered-pixel equality.
- Focused regression: 40 passed, one optional native-reference test skipped. Added font mutation/orphan/budget, inspection cache, shared text-reader and selection-boundary cases.
- Offline final candidate: all-mode actual download hash/size, accessibility, cancellation/reset, signed-file rejection, narrow reflow and no remote requests passed.
- Identifying footer: **Test build: 2026-10-14-fonts**.

Full CI status and final artifact hash are recorded after verification. Physical-phone performance acceptance remains open. All private PDFs, font payloads and detailed receipts stay outside Git. Frozen tools, Image Enhancer, shared libraries, production routes and deployment configuration are untouched; only the isolated PDF Compressor and its QA workflow changed.
