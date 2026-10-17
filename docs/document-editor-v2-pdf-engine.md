# Document Editor V2 — PDF engine workstream

Updated: 2026-10-17. Branch: `feature/document-editor-phase1`.

## Scope and sequence

The full handoff remains the acceptance contract. User instruction: separate
format engines under one workspace; finish PDF before proceeding to another
engine. DOCX, spreadsheet and TXT feature development is paused.

The candidate lives at `documents/document-editor-v2-lab/pdf-engine/`. This is a
noindex development test harness, not a new public tool or a deployment. The
workspace lab links to the harness for development. The shared workspace PDF
adapter still uses the earlier additive implementation until the candidate has a
safe snapshot/restore/lifecycle contract. This integration is **pending**; the
copied candidate must not be described as the active shared PDF engine yet.

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
