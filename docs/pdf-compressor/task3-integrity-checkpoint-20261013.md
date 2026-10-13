# Canonical Blueprint v1.0 — Task 3 input integrity checkpoint

Source of truth: `master-blueprint-v1.0.md`, preserved from the user attachment.
Earlier handoff/checkpoints mislabeled Task 3 as image compression. The actual
Task 3 is **PDF Input Validation and Document Integrity Foundation**. Task 5 is
image/scanned-PDF compression. Historical reports are not rewritten; this
canonical mapping supersedes their task labels. Original completed baseline and
conditional architecture work remain protected.

Starting verified GitHub checkpoint: draft PR #193, commit
`3748fbbe7828b26feffab5fe019fdcfbbc27c56f`. Local parent `919b1e99` has the same
tree `7f108dc7f06e14a32bd1782299c4d6c014a9cb7d`; only commit metadata differ.
Branch: `pdf-compressor-task3-integrity-foundation-20261012`.

## Requirements implemented

- Strict complete-PDF header/EOF validation and read-only structural parsing.
- Page geometry, crop/rotation, text layers, image inventory, digital/image-only/
  mixed classification verified by structural parser plus independent PDF.js.
- Forms, annotations, links, outlines, attachments, metadata and tags detected.
- Signature fields/dictionaries, ByteRange and certification markers rejected,
  including markers outside the catalog. Encrypted PDFs are rejected without
  asking for a password, decrypting or transforming them.
- Broken references, invalid objects, unsupported XFA/actions and reader
  disagreement produce specific errors. Known PDF image dimensions are budgeted
  before independent decoding. Attachment payloads are not decompressed for
  inventory.
- Transactional input replacement retains the last valid source/report on
  failure. Late selections and cleared sessions cannot restore stale sources.
- Inspection never claims compression, approval to process, or scanner/OCR
  provenance merely from image-only/mixed classification.

## Files and test environment

Implementation: `assets/js/pdf-compressor-v2/input-inspector.mjs`,
`assets/js/pdf-compressor-v2/independent-input-reader.mjs`.
Tests: `tests/pdf-compressor-task3-input-inspector.test.mjs`,
`tests/pdf-compressor-task3-independent-inputs.test.mjs`,
`tests/pdf-compressor-task3-browser.mjs`.
Independent fixture recipe: `tests/pdf-compressor-independent-fixtures.py`.

Node v24.19.0, Linux x64; existing pdf-lib and independent PDF.js 6.3.289 legacy
reader. Test-only reader path can be overridden via `PDFJS_TEST_MODULE`; no
unrelated build files are modified or added to production dependency imports.
Fixture recipe uses ReportLab/Pillow/pypdf and pyHanko 0.37.0. It generates a
disposable self-signed certificate, checks the real PDF signature using a local
trust context with network fetching disabled, and deletes its PKCS#12 key file.
Generated PDFs/certificates are temporary and are not committed.

## Executed commands and evidence

```sh
PYTHONPATH=/workspace/scratch/ab9513c45012/qa-python python3 tests/pdf-compressor-independent-fixtures.py /workspace/scratch/ab9513c45012/independent-pdf-fixtures
PDF_COMPRESSOR_INDEPENDENT_FIXTURES=/workspace/scratch/ab9513c45012/independent-pdf-fixtures node --test tests/pdf-compressor-task3-independent-inputs.test.mjs tests/pdf-compressor-task3-input-inspector.test.mjs tests/pdf-compressor-task1-baseline.test.mjs tests/pdf-compressor-task3-policy.test.mjs tests/pdf-compressor-task3-image-inventory.test.mjs tests/pdf-compressor-task4-lossless.test.mjs tests/pdf-compressor-task5-image-candidate.test.mjs tests/pdf-compressor-remediation-policy.test.mjs
```

Fixture recipe: cryptographic signature validation **PASS**; AES-256 encrypted
fixture generated. Regression: **45 tests passed, zero failed or skipped**.
The encrypted fixture exposed a minified-library Error-name discrepancy; the
inspector now reads the encryption marker and rejects before content inspection.
No encrypted processing support or password bypass is provided.

Updated local Chromium integration verified seven supported document profiles
and signed/encrypted rejection, with no non-local or network-write requests.
The browser gate passed after browser-cache restoration and the final input
budget/attachment changes. No protected routes were modified for this test.
No GitHub CI or physical-device acceptance is claimed.

## Scope, limits and readiness

Supported input scope is conservative: ordinary complete PDFs without signatures,
encryption, XFA or unverified document actions. Limits are provisional inspection
ceilings (20 MiB, 500 pages, 8 million pixels per known image), not promises of
phone memory capacity. Compressed-object/font/inline-image resource exhaustion
still requires worker/resource hardening and device profiling in later tasks.
Independent authoring-stack scans are generated raster pages, not physical
scanner output; real-world compression acceptance remains Task 5/7/13 work.

Task 3: **PASS for the documented isolated input-inspection scope**. Integration
and full processing lifecycle remain later tasks. Release: **NO-GO**.
Tasks 4–13 must meet their canonical gates before a release candidate; Task 13
does not authorize deployment/freeze. No production routes, frozen tools,
shared libraries, Image Enhancer logic, catalog or indexing configuration changed.
