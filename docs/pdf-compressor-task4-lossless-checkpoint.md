# PDF Compressor Blueprint v1.0 — Task 4 lossless engine checkpoint

**Status: PARTIAL / BLOCKED. No production approval.**

## Requirements (Task 4 only)
Build a genuine PDF-aware lossless structural optimizer using a maintained, pinned, security- and license-reviewed browser-WASM engine. Preserve metadata, outlines, forms/values, attachments, tags, links, page geometry and embedded image content; reject signed/encrypted or unverifiable documents; accurately report real byte savings; use unchanged input when no size benefit. Do not implement image downsampling (Task 5), UI lifecycle, broad independent rendering verification (Task 7) or physical mobile profiling (Task 10).

## Changes
- `assets/js/pdf-compressor-v2/lossless-core.mjs`: isolated injected optimization/inspection contract. Rejects invalid/restricted inputs, larger/non-saving candidates; checks fingerprint match on smaller candidates; never imports from or alters production.
- `tests/pdf-compressor-task4-lossless.test.mjs`: contract behavior tests with mock adapters (not evidence of real compression).
- `tests/pdf-compressor-task4-native-reference.test.mjs`: **native Linux qpdf CLI only** reference, generated fixture corpus; signed marker and malformed input rejected. Real byte results should be read from CI logs; CI pass not yet independently confirmed at authoring time.
- `.github/workflows/pdf-compressor-task4.yml`: scoped test workflow and directly related previous-task regressions.
- This document.

## Decision
Task 2 `qpdf-wasm-esm-embedded@1.1.1` succeeded on limited synthetic browser tests but **remains an unapproved, older community package**. This Task 4 branch does **not** vendor, fetch at runtime, or install it. No maintained version-pinned audited browser-WASM release with source-to-binary provenance has been verified and approved in this task. Therefore actual production browser optimization is **not yet implemented** and the full Task 4 completion gate is blocked.

## Safety and limitations
- The injected `inspect` adapter is a trust boundary: the core cannot prove its fingerprint is complete. Native test fingerprints check basic synthetic structure (pages, geometry, metadata, form names/values, outline/tag/attachment presence), not links, annotation behavior, actual attachments, text/OCR equality, cryptographic signatures, PDF/A, color, visual fidelity or preservation on independent real-world files. **Do not ship on these alone.**
- No actual scanned-photo downsampling or image recompression attempted; those are outside Task 4.
- Native CLI reference is NOT browser-WASM production capability.
- No shared/frozen tool was edited, no production deployment, no changes to Task 1–3 files.

## Required Task 4 follow-through (unresolved)
1. Review qpdf upstream release and build chain, audited version, license notices, known vulnerabilities, long-term maintenance and ESM browser compatibility. Pin and attest exact WASM bytes before use.
2. Supply the approved browser adapter and structural validator with comprehensive output checks; verify cross-browser behavior before any integration.
3. Verify Task 4 CI and all previously completed work remains green; test both successful saving and unchanged-original fallback on independent complex PDFs.
4. Keep draft/unmerged until the gates pass; **stop without beginning Task 5**.

This is a checkpoint rather than a Task 4 PASS claim.
