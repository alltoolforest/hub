# Organize PDF V2 candidate — 27 October 2026

**NOT RELEASE READY. Do not merge or deploy as the current organizer. Explicit deployment approval is still required after critical gates pass.**

Base: alltoolforest/hub commit 97b3a4831e966aace5882e2aa783fff505403ce7.
Input: supplied pdf-organizer-upgrade(1).md. Its CDN-based drop-in deployment instructions were not followed.

## Scope and delivered changes

Only this new candidate directory and its dedicated CI workflow are changed. Existing organizer, shared modules, live routing, and all frozen tools are unmodified. Candidate imports the existing organizer integrity engine without editing it.

- Retains supplied multi-selection, range selection, bulk rotation/removal/restore, duplicate, blank insertion, combine, extraction, history, full-page preview, drag/touch reorder and keyboard alternatives.
- Safe preservation path for single-source nonduplicated pages: original PDF objects, supported forms, bookmarks, metadata and tagged removal remain handled by the existing integrity engine. No automatic tag/bookmark discard permission is supplied.
- Tagged reordering is blocked rather than silently preserving a misleading reading order.
- Extended page copying fails closed for complex catalogs, annotations, unknown page structures and multiple-source metadata. These capabilities work on the supported simple-PDF subset; general complex-PDF merge/duplicate support is not claimed.
- Export reparses output and checks page count, sequence/dimensions/rotation, content/resource fingerprints and metadata where applicable; rejects hidden page objects. Fingerprints use two noncryptographic checksums for stream bytes, not a security proof or independent rendering verification.
- Browser-local export in a dedicated module Worker; terminating it cancels export. Concurrent exports blocked. Explicit verified download link supports browsers that decline delayed automatic downloads. Stale links revoked on edits, history and blank-size changes.
- Rejects active content, unsupported URI protocols, signatures and XFA; filename controls/bidi/path/HTML characters sanitized. Escaped filename HTML attribute fixes confirmed injection point.
- Existing self-hosted PDF.js 6.3.289 and pdf-lib reused; SortableJS 1.15.6 self-hosted with MIT license. CSP restricts scripts, workers and network to local resources; no embedded PDF viewer execution.
- Keyed page cards preserve focus/DOM rather than replacing the entire grid. Lazy thumbnails, concurrency 2, 24-entry cache, bounded thumbnail dimensions and offscreen canvas release. Clear-session releases sources/previews/history/download URLs.
- Visible progress/cancel, 44px controls, responsive phone export area, a main landmark, live status, and native modal dialog.
- Candidate admission budgets: 64 MiB total source files and 2,000 pages. These are not a proven whole-parser memory bound.

## Tests actually run

- Existing organizer Node regression: **125/125 passed**, covering original integrity, forms, bookmarks, tags, removal, lifecycle, thumbnails and compatibility.
- Candidate Node engine suite: **11/11 passed**, covering reorder/remove, duplicate/rotation independence, blank sizes, simple merge, form preservation, metadata, dangerous content, tagged/label guards, invalid input, cancellation, filenames and 200-page benchmark.
- 200-page synthetic text PDF, local Node: 108,709 input bytes -> 44,623 output bytes, approximately 0.39–0.45 s. This is neither a scan-heavy stress benchmark nor a phone result.
- Chromium 141 / Playwright 1.56.1: desktop 1366x900 and touch-enabled 390x844 workflows passed. Load, selection, duplication, undo/redo, blank, preview, verified 8-page download, cancellation. Zero external network requests observed.
- axe-core 4.14.0: **zero detected violations** in the tested desktop and narrow loaded states, after fixing the main landmark. Automated scanning does not establish full accessibility or screen-reader compatibility.
- Browser test found and fixed mobile Cancel being covered by the fixed export bar.
- Browser screenshots inspected internally; not published as user deliverables.
- Firefox runtime was downloaded, but local execution did not produce a completed verification result. WebKit could not launch due missing system libraries; dependency installation was unavailable. Dedicated CI matrix is provided; its results must be checked separately.

## Critical remaining release gates

1. **Confidential-content guarantee:** ordinary page deletion is not redaction. The inherited engine prunes unreachable objects, and the candidate rejects hidden page objects, but shared resources, retained pages, metadata, annotations or attachments may contain copies of removed information. Do not claim complete confidential-content removal. A specified sanitization policy plus adversarial corpus and independent decoded-object verification is required before that requirement can pass.
2. **Whole-process memory/performance:** source-byte/page limits and bounded thumbnails do not bound PDF decompression, parsing, encoding or object-graph allocations. Admission parsing still runs partly on the UI thread. Move it into cancellable workers and test image bombs, pathological graphs, large scanned PDFs, rapid scroll/preview changes, and low-memory phones.
3. **Independent fidelity/structure verification:** add a second-parser/renderer comparison for supported complex exports, expanded real-world fixtures for fonts/images/transparency/annotations/links/labels/XMP/tags, and test every supported transformed structure. Current checks are useful but do not prove all possible PDFs correct.
4. **Cross-platform:** complete Firefox/WebKit CI, Android/iOS touch/download behavior, Windows/macOS browsers, keyboard-only navigation, dialog focus, screen-reader announcements and high zoom. Desktop narrow-viewport Chromium is not real Android/iOS verification.
5. **Full candidate regression:** supplied features remain but not every interaction has been exercised (touch drag/autoscroll, rapid preview replacement, all selection-range errors, source removal/history, repeated failures and very large document cases). Source and dependency security review is partial, not a completed independent audit.

## Next checkpoint

Run candidate CI; fix any browser failures. Build the adversarial resource/confidentiality corpus and implement a fail-closed sanitization policy without removing retained content silently. Complete admission-worker and memory work, then independent fidelity and remaining UI regression. Only after critical gates pass: present exact candidate commit, report and limitations for explicit deployment approval. Deployment, production audit, user verification and freeze are separate later steps.

## Local reproduction

From repository root:

```
node --test tests/pdf-organizer*.test.mjs documents/pdf-organizer-v2-candidate/engine.test.mjs
npm install --no-save --ignore-scripts playwright@1.56.1 axe-core@4.14.0
npx playwright install --with-deps chromium firefox webkit
ORGANIZER_AXE_PATH=node_modules/axe-core/axe.min.js node documents/pdf-organizer-v2-candidate/browser.test.mjs
```

Browser test hosts its own local-only HTTP server on port 8765. Do not run another server on that port. The page is noindex and has a visible candidate notice; neither makes it an approved deployment.
