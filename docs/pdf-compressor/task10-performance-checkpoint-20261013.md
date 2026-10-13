# Task 10 — engineering checkpoint; device gate open

Resumed the verified Task 9 commit bd1b4bc62dadd85466f6ce3f8481863d9fb23bdd
after scratch maintenance removed unpublished experiments. No completed task was
rebuilt or replaced. Confirmed dependencies were minimally extended for resource
limits and progress while preserving existing default behavior and integrity.

## Implemented

- Provisional standard/mobile/unknown-mobile/low-memory resource profiles. Limits
  are never raised above the existing 20 MiB/8 MP/32 MP aggregate defaults.
  Lower device budgets apply before File.arrayBuffer and before PDF/image parsing.
- Direct and generally wrapped JPEG frame dimensions are checked against the dictionary before the
  independent reader may decode them. A forged frame cannot bypass the pixel
  guard by declaring a smaller PDF Width/Height. Aliases and ASCII/Flate wrappers cannot bypass the check; unsupported precision/component counts and filter chains reject safely.
- PDF.js image/canvas budgets, serial existing image/page handling, disposable
  workers and retained-source recovery remain enforced. WASM binary is unchanged.
- Real processing-phase messages supplement elapsed-time/heartbeat reporting.
- The offline diagnostic now uses the actual Task 8 session, Task 7 handoff
  verification and selected device budget. Blob worker code is cached for reuse,
  revoked on navigation, and no terminated worker handles are retained.
- Base64 decoding fills a typed array directly rather than building a large
  generic iterable array. Whole-run sampled memory varies with GC/automation;
  no percentage reduction or whole-process memory guarantee is claimed.

## Verified locally

36 affected unit/adjacent tests passed, including forged JPEG dimensions rejected
before independent decoding, valid and forged wrapped JPEGs, aliases/components, bounded ASCII equivalence, device preflight, original retention, exact text,
invalid receipts, cleanup, cancellation and injection guards. Runtime hashes pass.
The integrated file-mode diagnostic passed all modes, repeated source use, queued
stale-result suppression, oversize rejection, reset/navigation lifecycle, narrow
layout and no remote requests. Filename-injection regression passes after waiting
for the newly asynchronous input inspection.

Synthetic Chromium benchmark: 11 runs across 113,682-byte mixed, 3,800,479-byte
scan-like and 12,152,803-byte scan-like PDFs; all modes complete, no larger output.
Repeated Balanced outputs remain the same size. The largest input completed in
about 3.3 s Balanced, 2.8 s Strong and 17.2 s Lossless in this environment. Heartbeat
gaps were at most 102 ms. Cancellation during the large lossless stage withholds
download and leaves zero active workers. Reset releases owned source/output state.
The generic evidence JSON records exact measurements, versions and limitations.

Memory measurements are CDP managed-heap/backing-storage/embedder counters sampled
about every 100 ms. They exclude complete GPU/native/process RAM and may miss
transient peaks. Process CPU-time counters are unavailable here and recorded null;
engine and wall duration are measured, not mislabeled as CPU utilization. No
physical peak-RAM or lower-memory device pass is inferred from navigator hints.

## Pending completion gate

Task 10 remains open for the measured real-device envelope: updated integrated
Android repeated-run/cancel/download checks, lower-memory phones, iPhone Safari,
Windows Chrome/Edge/Firefox, macOS Safari and appropriate device CPU/memory evidence.
Automated cross-browser regression and the new diagnostic/performance CI job are
required; their final commit/run result must be recorded separately.

The earlier physical Android scan-quality/completion evidence remains accepted;
it does not verify the newly integrated stages or complete this device matrix.
The 21.61 MB complex stress PDF remains unsupported by the unchanged upper size
and drawing-operation guards. No file-limit bypass or full-page rasterization.

Tasks 11–13 are not started, per the canonical sequential gate. No production,
frozen tools, Image Enhancer, shared routing, site-wide SEO, deployment or freeze.
All changes are confined to isolated compressor modules, tests, docs and workflow.

## Reproduce

Install test-only pins: pdfjs-dist 6.3.289, Playwright 1.56.1, canvas 1.0.11,
esbuild 0.28.2. Install Chromium and the CI browser dependencies.

```sh
PDF_COMPRESSOR_MOBILE_QA_OUTPUT=/tmp/mobile.html python tests/build-pdf-compressor-mobile-qa.py
PDF_COMPRESSOR_MOBILE_QA_OUTPUT=/tmp/mobile.html node tests/pdf-compressor-mobile-qa-browser.mjs
PDF_COMPRESSOR_MOBILE_QA_OUTPUT=/tmp/mobile.html PDF_COMPRESSOR_PERFORMANCE_OUTPUT=/tmp/performance.json node tests/pdf-compressor-task10-performance.mjs
```
