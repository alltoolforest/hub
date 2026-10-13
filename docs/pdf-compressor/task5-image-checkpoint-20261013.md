# Task 5 incremental checkpoint — 13 October 2026

Base: PR #195, 019e1456ca6132998493cffb1e9397e6beff6ae1.
Task 4 cross-browser gate closed: CI run 38347809055 succeeded, including
Chromium, Firefox and WebKit lossless module-worker/CSP checks.
Completed Task 3/4 implementations were preserved.

Task 5 now includes bounded streaming Flate decoding, exact decoded-length
checks, sequential RGB/grayscale image processing, area-average downsampling
(Balanced 2400px max, Strong 1800px max), worker-local JPEG encoding, stable
image references and page content/layout preservation. Masks, profiles,
custom dictionaries and unsupported encoding are preserved. Already encoded
JPEGs remain unchanged. Only smaller output is eligible for release.

The actual integration requires canonical Task 3 input inspection. Its output
verifier checks JPEG dimensions, decoded pixel RMS error and average color
bias; then restores declared image streams in an in-memory verification copy
and requires the full Task 4 graph fingerprint to match. A separate PDF.js
reader checks page profiles. This is still isolated engine code, no production UI.
The pixel thresholds are provisional safeguards, not proof of OCR readability.

Verification executed: 17 selected unit/adjacent regression tests passed with
zero skips. Tests include real JPEG compression, unchanged content stream bytes,
geometry, declared-image graph verification, metadata tampering rejection,
codec rejection, cancellation, original immutability and downsampling.
Chromium worker + strict CSP gate passed seven synthetic PDFs with no unexpected
network requests. Balanced outputs: scanned 339211 -> 72969 bytes;
image-heavy 708693 -> 148806; mixed 113682 -> 26149. Four non-image PDFs retained
exact original bytes. These savings do not predict savings on user documents.

Firefox local executable is absent. WebKit host libraries are absent. An isolated
three-browser CI job was added; its results must be confirmed before acceptance.
Remaining Task 5 gates: Strong browser tests, varied image/OCR and high-resolution
fixtures, representative page render comparisons, real physical-scan acceptance,
mobile memory/performance checks and CI cross-browser verification. Tasks 6–13
remain gated. Overall release NO-GO, not deployed or frozen.
All changes stay within isolated compressor modules/tests/workflow/docs;
frozen tools, production routes and Image Enhancer remain untouched.
