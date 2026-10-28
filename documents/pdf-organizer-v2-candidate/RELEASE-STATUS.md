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
- Export now additionally runs PDF.js text-position and 320px pixel comparisons against each source page before publishing a download. This bounded visual check is complementary, not full-resolution proof.
- Source parsing/security inspection now runs in a cancellable Worker.
- Removed content/image/Form XObject stream references are checked against same-document output; retained references stop deletion conservatively. Shared legitimate images can therefore block removal.
- Export reparses output and checks page count, sequence/dimensions/rotation, content/resource fingerprints and metadata where applicable; rejects hidden page objects. Fingerprints use two noncryptographic checksums for stream bytes, not a security proof or independent rendering verification.
- Browser-local export in a dedicated module Worker; terminating it cancels export. Concurrent exports blocked. Explicit verified download link supports browsers that decline delayed automatic downloads. Stale links revoked on edits, history and blank-size changes.
- Rejects active content, unsupported URI protocols, signatures and XFA; filename controls/bidi/path/HTML characters sanitized. Escaped filename HTML attribute fixes confirmed injection point.
- Existing self-hosted PDF.js 6.3.289 and pdf-lib reused; SortableJS 1.15.6 self-hosted with MIT license. CSP restricts scripts, workers and network to local resources; no embedded PDF viewer execution.
- Keyed page cards preserve focus/DOM rather than replacing the entire grid. Lazy thumbnails, concurrency 2, 24-entry cache, bounded thumbnail dimensions and offscreen canvas release. Clear-session releases sources/previews/history/download URLs.
- Rapid preview navigation cancels superseded renders and releases temporary canvases; card reconciliation restores focus after DOM movement.
- Visible progress/cancel, 44px controls, responsive phone export area, a main landmark, live status, and native modal dialog.
- Candidate admission budgets: 64 MiB total source files and 2,000 pages. These are not a proven whole-parser memory bound.

## Tests actually run

- Existing organizer Node regression: **125/125 passed**, covering original integrity, forms, bookmarks, tags, removal, lifecycle, thumbnails and compatibility.
- Candidate Node engine suite: **13/13 passed**, covering reorder/remove, duplicate/rotation independence, blank sizes, simple merge, form preservation, metadata, dangerous content, tagged/label guards, invalid input, cancellation, filenames 200-page benchmark, hidden content-stream retention and shared-image rejection.
- 200-page synthetic text PDF, local Node: 108,709 input bytes -> 44,623 output bytes, approximately 0.39–0.45 s. This is neither a scan-heavy stress benchmark nor a phone result.
- Chromium 141 / Playwright 1.56.1: desktop 1366x900 and touch-enabled 390x844 workflows passed. Load, selection, duplication, undo/redo, blank, preview, verified 8-page download, cancellation. Zero external network requests observed.
- axe-core 4.14.0: **zero detected violations** in the tested desktop and narrow loaded states, after fixing the main landmark. Automated scanning does not establish full accessibility or screen-reader compatibility.
- Browser test found and fixed mobile Cancel being covered by the fixed export bar.
- Browser screenshots inspected internally; not published as user deliverables.
- Initial checkpoint a845788: CI Chromium and Firefox passed. WebKit was still installing dependencies when last checked. Checkpoint 3b8619d passed Chromium CI including source-inspection worker, independent visual/text verification, 14-page combining, 2-page extraction, cancellation and zero axe findings at both tested widths. Its Firefox/WebKit jobs were still running when recorded. The subsequent rapid-preview cancellation/focus patch needs final CI confirmation; read PR checks for the latest exact commit. Local browser execution after the session resumed is blocked by runtime socket restrictions.

## WebKit mobile export interaction fix (28 October 2026)

**Confirmed fixed in simulated touch-enabled WebKit CI, not yet verified on a physical iPhone.**

- Reproduced: a touch started on the Create PDF button but a roughly 50px layout shift moved the button before touchend, so the interaction landed on a surrounding DIV and export never began.
- Root cause: `content-visibility:auto` and `contain-intrinsic-size:auto 380px` on mobile page cards allowed a layout shift as cards were realized while scrolling to the bottom export area.
- Scoped fix: mobile viewports at or below 640px now render page-card layout with `content-visibility:visible` and no placeholder intrinsic height. Desktop retains `content-visibility:auto`; thumbnails stay lazy and bounded. No PDF engine changes.
- **Verified candidate commit:** `ef8094517c1b0ae2fc9e75b77dda51ce4c24e4d3`. Chromium, Firefox, and WebKit CI passed, each at desktop and touch-enabled 390x844; WebKit touch export downloaded a verified 8-page output, then tested extraction and 14-page combined PDF. Node suite **147/147 passed** in each browser-matrix job, including exact complex-PDF corpus cases.
- Outstanding: real iOS Safari/iPhone manual verification, low-memory mobile tests, very large page-card layout/performance, and the other confidential-content/fidelity gates below.

## Critical remaining release gates

1. **Confidential-content guarantee:** ordinary page deletion is not redaction. The inherited engine prunes unreachable objects, and the candidate rejects hidden page objects, but shared resources, retained pages, metadata, annotations or attachments may contain copies of removed information. Do not claim complete confidential-content removal. A specified sanitization policy plus adversarial corpus and independent decoded-object verification is required before that requirement can pass.
2. **Whole-process memory/performance:** source-byte/page limits and bounded thumbnails do not bound PDF decompression, parsing, encoding or object-graph allocations. Admission parsing has been moved into a cancellable worker. Still test image bombs, pathological graphs, large scanned PDFs, rapid scroll/preview changes, and low-memory phones.
3. **Independent fidelity/structure verification:** validate the newly added second-parser/renderer comparison across supported complex exports; add expanded real-world fixtures for fonts/images/transparency/annotations/links/labels/XMP/tags, and test every supported transformed structure. Current checks are useful but do not prove all possible PDFs correct.
4. **Cross-platform:** Chromium/Firefox/WebKit desktop and touch-emulated CI passed on the specific fix commit above. Physical Android/iOS touch/download behavior, Windows/macOS release-browser checks, keyboard-only navigation, dialog focus, screen-reader announcements and high zoom remain. Emulation is not real-device verification.
5. **Full candidate regression:** supplied features remain but not every interaction has been exercised (touch drag/autoscroll, rapid preview replacement, all selection-range errors, source removal/history, repeated failures and very large document cases). Source and dependency security review is partial, not a completed independent audit.

## Next checkpoint

Maintain all three browser CI passes across future changes. Build the adversarial resource/confidentiality corpus and implement a fail-closed sanitization policy without removing retained content silently. Complete memory work and validate the new admission-worker/independent-fidelity pipeline, then remaining fidelity and remaining UI regression. Only after critical gates pass: present exact candidate commit, report and limitations for explicit deployment approval. Deployment, production audit, user verification and freeze are separate later steps.

## Local reproduction

From repository root:

```
node --test tests/pdf-organizer*.test.mjs documents/pdf-organizer-v2-candidate/engine.test.mjs documents/pdf-organizer-v2-candidate/complex-corpus.test.mjs
npm install --no-save --ignore-scripts playwright@1.56.1 axe-core@4.14.0
npx playwright install --with-deps chromium firefox webkit
ORGANIZER_AXE_PATH=node_modules/axe-core/axe.min.js node documents/pdf-organizer-v2-candidate/browser.test.mjs
```

Browser test hosts its own local-only HTTP server on port 8765. Do not run another server on that port. The page is noindex and has a visible candidate notice; neither makes it an approved deployment.
