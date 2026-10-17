# Document Editor V2 — PDF engine workstream

Updated: 2026-10-17. Branch: `feature/document-editor-phase1`.

## Scope and sequence

The full handoff remains the acceptance contract. User instruction: separate
format engines under one workspace; finish PDF before proceeding to another
engine. DOCX, spreadsheet and TXT feature development is paused.

The candidate lives at `documents/document-editor-v2-lab/pdf-engine/`. This is a
noindex development test harness, not a new public tool or a deployment. The
workspace lab routes PDF uploads into the copied engine through
`assets/js/document-editor-v2/engines/pdf.js`. The separate harness remains for
isolated regression work. Shared autosave/history integration now has a DOM test;
real browser/device acceptance remains pending.

## Isolation and provenance

Copied native editor, layout, mutation, export, rendering, font, OCR and regression
source from `documents/edit-pdf/`. `source-baseline.json` records the source commit
and SHA-256 of every original product source. Tests verify the original hashes
and refuse imports back into frozen product logic. Existing pinned PDF.js and
PDF-lib vendor assets are read-only shared dependencies, not copied product code.
No frozen files, production routes, catalog or ongoing enhancer/compressor files
were edited. Future changes apply only to the candidate and its workspace adapter.

## PDF acceptance tracker

| Requirement | Current evidence / remaining work |
| --- | --- |
| Native/scanned/mixed routing | Copied per-page classifier and hybrid routing; representative mixed corpus still needed |
| Existing text edit/delete | Copied source-operator mutation and font checks; real native edit/export regression passes |
| Add text and paragraphs | Copied native and scan paths; scan insertion, re-edit and removal tests pass |
| Fonts, decimal size, bold/italic | Copied formatting and precision controls; full formatting corpus pending |
| Text colour | Scan replacement preserves sampled colour; explicit colour controls and native validation pending |
| Downward wrapping/reflow | Copied reflow planner and smart insertion V8; expanded corpus pending |
| Upward shortening/deletion | Copied behavior must be measured against handoff; not accepted yet |
| Cross-page reflow | Copied pagination; mixed native/OCR cascades can be refused; safe fallback and acceptance pending |
| Protect tables/forms/columns/headers | Copied safety classifications; representative preservation corpus pending |
| OCR recognition and correction | Copied Tesseract provider, local patch editing and mixed export; deterministic OCR tests pass; live recognition pending |
| Searchable OCR export | Pending; visual OCR patches alone do not meet this requirement |
| Distinguish original/OCR/added text | Copied scan controls; final UX and accessibility review pending |
| Image/object insert, replace, resize, move, delete, alignment | Pending |
| Hyperlink editing | Pending |
| Find/next/previous/replace/all/case/whole-word | Pending PDF adapter |
| Undo/redo | Copied native history works in regression; OCR and unified history pending |
| Autosave/crash/refresh/revision recovery | Pending candidate snapshot/restore contract and workspace integration |
| Unsaved change warning/original preservation | Original-copy export inherited; complete workspace lifecycle integration pending |
| Page navigation and zoom | Copied controls; pending-edit protections pass |
| Thumbnails/current-page display | Page label inherited; thumbnails pending |
| Copy/paste | Native text editing inherited; rich/range/image clipboard behavior pending |
| Validated PDF export | Copied native and combined validation; real native/OCR export tests pass; wider corpus pending |
| PDF-to-DOCX architecture | Pending; do not claim lossless conversion |
| Mobile/accessibility | Copied touch controls and keyboard paths; DOM/coordinate tests pass; actual browser/device checks pending |
| Large-file bounded resources | Copied canvas budgets and cleanup; inherited 60 MB/250-page guards remain; broader stress tests pending |
| Password/encryption/security | Candidate explicitly rejects encryption rather than bypassing protection; unlocking workflow and adversarial corpus pending |
| Privacy | Browser-side file processing; OCR runtime/language downloads may use external CDN; runtime disclosure/dependency review pending |

## Verification checkpoint

- 21 V2 tests, including 4 new source-isolation/import/HTML/encryption checks.
- Copied OCR style suite: 14 checks passed.
- Copied rotated/cropped OCR geometry: 8 cases passed.
- Copied scan-mobile suite: 5 groups passed.
- Copied OCR export suite: real two-page serialization and repeated replacement passed.
- Copied browser stability suite: 26 checks passed (DOM simulation).
- Copied readable-stream Safari compatibility: 4 checks passed.
- Copied runtime policy: 6 checks passed.

The VM-based suites require `node --experimental-vm-modules`. Canvas and DOM
simulation are not physical-device certification. OCR recognition is deterministic
in these tests, not a live Tesseract accuracy benchmark. PDF.js emitted missing
standard-font-data warnings in native Node tests; resolve or explain those with
real browser rendering before acceptance.

## Next implementation order

1. Integrate the copied engine through a PDF-specific workspace adapter with
   explicit change notifications, safe disposal and snapshot/restore. Do not fake
   autosave or lose edits during page/mode switching.
2. Complete native and OCR undo/recovery, search, styling and navigation.
3. Complete searchable OCR, hyperlink and image/object editing.
4. Prove expansion, shortening and cross-page behavior on native/scanned/mixed
   corpus with tables, forms, images and complex fonts.
5. Finish security, resource, accessibility and browser/device gates; only then
   consider the PDF engine complete and begin the next engine.

Release sequence stays Implement → Pre-deployment audit → Deploy → Production
audit → Manual verification → Regression → Freeze. No deployment in this checkpoint.

## 2026-10-17 — native recovery foundation

Added native engine `snapshot()` / asynchronous `restore()` APIs. Drafts contain
versioned editing intent and the SHA-256 of original PDF bytes, not live parser
or font objects. Restore reconstructs source references, validates the resulting
PDF before committing, and rolls back if preview installation fails. Pending
text edits are refused rather than discarded. Snapshot restore resets native
history closures; the shared workspace will own history across snapshots.

Fresh-session tests cover JSON serialization, exact recovered text on export,
invalid source/text rejection retaining current edits, and restoration to the
unedited state. These are real PDF parse/export tests with simulated canvas
painting. The first test fixture used a replacement wider than the mapped region;
the engine correctly refused it. Recovery was then tested with an in-bounds edit;
this does not establish wider replacement/reflow acceptance.

OCR snapshots and shared workspace wiring remain pending. The candidate's new
APIs do not yet enable automatic recovery in the workspace UI. No other engine
feature work or frozen tool code was changed.

## 2026-10-17 — OCR and hybrid recovery foundation

Added asynchronous scan snapshots/restoration with original-file SHA-256 binding,
recognized word metadata, replacement records, added text and lossless PNG pixels.
PNG dimensions, page geometry, duplicate pages and encoded-memory budget are
checked before installation. Restoration stages state before replacing the live
session; invalid drafts retain existing work. Page freezing now uses PNG to avoid
JPEG degradation across recovery/navigation; transparent pixels are cleared before
rehydration to avoid compositing them twice. Pending edits and OCR operations block
snapshot/restore until finished.

The hybrid editor now exposes `snapshot()` and `open(file, draft)` for a **fresh**
session. It stores the actual OCR page bytes used as the recognition base, plus the
active scan draft, native editing intent, and the selected page. Recovered OCR page
boxes/rotation must match the original. The workspace adapter must stage a new
hybrid instance and keep the old instance until recovery succeeds; `open` is not
an in-place restore method for an existing hybrid session.

New `ocr-draft-regression.mjs` verifies structured-clone persistence, byte-identical
edited canvas PNG recovery, word retention, pending-edit refusal, corrupt/source
mismatch rejection, reset and two-page PDF export. It also restores a hybrid OCR
session and validates its export. OCR recognition/classification and scan rendering
are deterministic in this test; canvas pixels and PDF serialization are real.

Affected native recovery/isolation, browser stability, OCR geometry, scan mobile
and OCR export regressions pass. Shared-workspace automatic saving, change
notifications and history integration are still pending. No production deployment.

## 2026-10-17 — workspace integration and native find/replace

The shared PDF adapter now mounts the copied native/OCR engine with its precision
formatting and reflow extensions. It stages restoration into a fresh instance and
replaces the live session only on success. Shared export, asynchronous local
snapshots, history and refresh recovery use the same workspace actions as the
other formats. Binary history is trimmed toward a 64 MB budget, retaining at least
the latest snapshot; a single larger snapshot can exceed that history budget.
Pending edits prevent snapshot/history operations rather than being discarded.
Native and OCR change notifications trigger the workspace autosave path.

Native PDF find/replace supports literal search, next/previous region navigation,
replace/all, case matching and Unicode word boundaries. Replacements are rebuilt
against source regions and validated as one operation before installation. Unsafe
layout replacements retain the existing session. OCR and protected-region search
remain explicitly excluded. Search navigation focuses the matching text region;
exact substring highlighting is pending.

New `document-editor-v2-pdf-adapter.test.mjs` exercises actual PDF parsing/export
through the workspace UI with DOM/canvas simulation and an IndexedDB test double:
open, edit, save draft, undo, redo, restore, search/replace, invalid replacement
retention, download and unfinished-edit protection. It does not certify a real
browser's IndexedDB or physical devices.

A real Chromium test runner was added in `document-editor-v2-pdf-browser.mjs` for
1280 px and 390 px viewports. Runtime installation succeeded, but browser launch
was blocked by the execution environment: `socket() failed: Operation not
permitted`. The browser test did **not run** and must not be counted as passed.
The runner remains available for a permitted browser environment.

Still blocking PDF completion: OCR search/replace, searchable OCR output,
image/object editing, hyperlink editing, text-colour controls, page thumbnails,
complete reflow/preservation corpus, conversion support, live OCR validation,
resource/security review and real browser/device accessibility verification.
Other format engines stay paused. Nothing deployed or frozen.

## 2026-10-17 — searchable OCR export and save-cycle preservation

Scanned-page controls now offer an explicit searchable OCR text option. Export
adds transparent text for recognized/reviewed words, verifies text extraction
from the actual exported PDF, and retains visible scan pixels. It supports the
current Helvetica/WinAnsi character set; unsupported glyphs fail with an explicit
message, retaining the draft. Unicode font embedding and searchable added scan
text remain pending, so this is not complete searchable-PDF acceptance.

The hybrid engine now retains original per-page scan bytes plus editable OCR
snapshots separately from the validated export bytes. This prevents stale hidden
words from surviving subsequent edits, retains recognized words after save/page
switching, and avoids cumulative raster/export overlays. Inactive page drafts can
be recovered with their validated export and original geometry checks.

Evidence: 27 focused V2 tests, native browser-stability DOM regression, scan-mobile
regression, rotated/cropped geometry regression, and OCR recovery/export tests.
The OCR recovery suite additionally checks searchable export, a second edit/save
cycle with the former hidden word removed, persisted searchable option, and
turning searchable output off without retaining the generated hidden layer.
Real browser execution is still blocked as described above. No launch-ready or
physical-device claim is made.
