# Document Editor V2 — PDF engine workstream

Updated: 2026-10-19. Branch: `feature/document-editor-phase1`.

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
| Text colour | Scan replacement preserves sampled colour; OCR added text has an explicit colour control; native added text now has a colour picker persisted through drafts and verified in exported PDF content. Existing editable native text recolouring is implemented through guarded reconstruction; this extension is unverified |
| Downward wrapping/reflow | Copied reflow planner and smart insertion V8; expanded corpus pending |
| Upward shortening/deletion | Copied behavior must be measured against handoff; not accepted yet |
| Cross-page reflow | Copied pagination; mixed native/OCR cascades can be refused; safe fallback and acceptance pending |
| Protect tables/forms/columns/headers | Copied safety classifications; representative preservation corpus pending |
| OCR recognition and correction | Copied Tesseract provider, local patch editing and mixed export; deterministic OCR tests pass; live recognition pending |
| Searchable OCR export | Implemented as an explicit opt-in transparent OCR layer; extraction is verified in exported PDFs and across recovery/save cycles. Unicode ToUnicode mappings with empty Type3 glyphs now replace the WinAnsi-only hidden layer; added scan text contributes searchable line geometry. These extensions are unverified; visible native Unicode font shaping remains separate |
| Distinguish original/OCR/added text | Copied scan controls; final UX and accessibility review pending |
| Image/object insert, replace, resize, move, delete, alignment | Implemented for added PNG/JPEG and supported axis-aligned original image placements; unverified. Clipped, rotated, inline and nested-form images remain protected |
| Hyperlink editing | URL rectangle add/edit/move/resize/delete implemented, unverified; internal destinations remain protected |
| Find/next/previous/replace/all/case/whole-word | Native selectable/editable text supported through the workspace adapter, with literal matching, next/previous, case/whole-word, replace/all, and guarded export validation. Scanned OCR now supports page-local literal search, navigation, case/whole-word filters and safe single/replace-all edits after OCR runs on that page. Document-wide OCR indexing, cancellation between pages and checkpointed cross-page replacement are implemented, unverified. Multi-box phrases, protected-region search and exact substring highlighting remain pending |
| Undo/redo | Shared workspace history covers native and OCR state snapshots; pending edits block history operations. Recovery and save-cycle tests pass |
| Autosave/crash/refresh/revision recovery | Workspace adapter serializes source-bound native/OCR snapshots, autosaves changes, stages fresh-engine recovery, and refuses unsafe/pending states. DOM + IndexedDB test double coverage passes; real browser storage remains pending |
| Unsaved change warning/original preservation | Original-copy export inherited; complete workspace lifecycle integration pending |
| Page navigation and zoom | Copied controls; pending-edit protections pass |
| Thumbnails/current-page display | Combined PDF preview and groups of six navigable thumbnails implemented, unverified |
| Copy/paste | Native text editing inherited; rich/range/image clipboard behavior pending |
| Validated PDF export | Copied native and combined validation; real native/OCR export tests pass; wider corpus pending |
| PDF-to-DOCX architecture | Implemented editable-text extraction and rendered-page-image modes with explicit fidelity limits, progress and cancellation; unverified. Editable layout reconstruction remains open |
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
2. Extend OCR search across all pages with OCR-on-demand or clear per-page coverage, add exact native match highlighting, and extend native text colour to existing text replacement.
3. Implement hyperlink and image/object editing, then validate against preserved-content corpus.
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
layout replacements retain the existing session. Scanned-page search is scoped
to the active page after OCR runs there; cross-page OCR and protected-region
search remain excluded. Search navigation focuses the matching text region;
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

Still blocking PDF completion: cross-page OCR search, broader searchable OCR
coverage, image/object editing, hyperlink editing, existing-text colour controls, page thumbnails,
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

## 2026-10-17 — native added-text colour

Added an accessible colour input to the copied native engine's Add Text controls.
The chosen six-digit colour is applied to the editing preview, stored on the
insert transaction and source-bound workspace draft, and emitted as a PDF fill
colour during export. Invalid draft or transaction colour values normalize to
black. Existing native text recolouring is not represented as supported; the
control is hidden while editing existing native text.

Verification: a real PDF serialization test inspects the decoded page content
stream for the selected RGB operator and checks draft round-trip. Adapter,
source-isolation, searchable OCR, and all 28 `document-editor-v2*.test.mjs`
tests pass. This does not clear browser/device or full PDF acceptance gates.
The original frozen Edit PDF source hash remains unchanged.

## 2026-10-18 — scanned-page OCR find and replace

Added literal OCR text search to the active scanned page after OCR has been run
there. Results support previous/next navigation, visible target-word highlighting,
case and whole-word filters, one replacement, and replace-all within each matched
word. Replacement uses the existing background-safety, fit, patch and OCR-history
path; unsafe edits are refused and the workspace receives change notifications.
The UI states that results cover the current OCR-processed page. Cross-page
search, automatic OCR of unprocessed pages and exact substring highlighting
remain open.

Verification: `ocr-search-regression.mjs` uses deterministic OCR recognition,
real canvas patching and PDF-backed page setup. It checks literal partial-word
search, navigation highlighting, replace-all, whole-word filtering and updated
OCR targets. Node VM test passed. The full 28-test V2 suite and copied OCR draft,
scan-mobile, rotated/cropped geometry and export regressions also pass. PDF.js
still emits standard-font-data warnings in Node; real browser validation remains
blocked and required.


## 2026-10-19 — implementation checkpoint; testing deferred

User explicitly deferred testing until all Document Editor engines are built.
No tests, builds, syntax checks or browser validation were run for this checkpoint.
Earlier passing results above are historical and do not validate these changes.
PDF implementation remains incomplete; the other engines remain paused.

Implemented in the isolated candidate and workspace adapter:

- Document-wide OCR search, optional recognition of missing pages, progress and
  cancellation after the current page. Replacement groups edits by page and
  restores a checkpoint when an edit is refused. Matching stays within OCR word
  boxes; multi-box phrases are not supported.
- Existing editable native text colour via guarded reconstruction; inherited
  source-font and protected-layout restrictions still apply.
- PNG/JPEG insertion and supported original image move, resize, replace, delete
  and alignment. Original image edits rewrite identified image draw operators;
  ambiguous placements are refused. Complex image/form/vector editing is open.
- URL hyperlink rectangle editing and source-bound object drafts integrated with
  shared history, recovery and export. Internal destination links are protected.
- Combined PDF preview and six-page thumbnail groups. Added scan text contributes
  line geometry to opt-in searchable OCR export within WinAnsi coverage.
- Snapshot/export revision guards prevent returning an artifact assembled across
  concurrent workspace changes. Draft recovery validates source object identity.

Object edits currently refuse nonzero text reflow, changed page counts, and
original-image edits on OCR-modified pages. These are implementation boundaries,
not completed coordination features. Unicode font embedding, password unlocking,
PDF-to-DOCX conversion, full object support, rich clipboard and mixed-page reflow
remain open. Testing, accessibility, performance and release gates are deferred,
not waived. No production or frozen-tool changes or deployment are included.


## 2026-10-19 — Unicode OCR and Word conversion implementation

Testing remains deferred by user instruction. No test, build, syntax-validation,
or browser run was performed for these additions.

- Replaced the Helvetica-only invisible OCR layer with self-contained Type3
  character mappings and ToUnicode CMaps, including supplementary Unicode
  characters. Empty glyph procedures and invisible text preserve the visible
  scan; per-word geometry controls selection placement. This does not implement
  visible native-script font shaping. Search/extraction compatibility must be
  verified across PDF viewers in the later testing phase.
- Added PDF-to-DOCX conversion from current native/OCR/object output. Editable
  text mode extracts reading-order text with source-page sections and refuses
  pages without extractable text. The UI explains that images, tables and exact
  layout are not retained. Page-image mode renders each page into Word, retaining
  appearance rather than editable content. Both modes include progress,
  cancellation and memory budgets; renderer cleanup runs on success or failure.
- Conversion refuses an export assembled while the source workspace changes.
  Closing a session cancels its conversion and prevents a stale download.

Still open: encrypted-PDF unlocking/decryption, complex source objects,
object/reflow coordination, mixed native/OCR page flow, rich clipboard, and
editable Word layout reconstruction. No suitable PDF decryption library is
present in the candidate; PDF.js rendering alone cannot supply decrypted editable
source bytes. Do not substitute a rasterized copy for native editable content
without explicit user-facing choice. Full PDF completion is not claimed.

## 23 October 2026 — PDF regression blockers repaired

Repaired the module-link failure that stopped the shared PDF workspace: the isolated PDF library wrapper now exports `PDFString` for hyperlink annotation writes. No frozen Edit PDF library or product logic was edited.

Corrected text assembly in the isolated extraction validator and PDF-to-Word editable conversion. PDF.js already returns inferred spaces; inserting another separator between every item produced `Reviewed   text`. Text items now concatenate with explicit line boundaries. The invisible Unicode layer emits contiguous codes per font chunk and refuses malformed surrogate input before creating fonts. Regression expectations now verify Telugu, Hindi, Greek, accented Latin and supplementary Unicode rather than expecting the superseded WinAnsi rejection. Ordinary phrases are asserted exactly at all four orthogonal transforms; PDF.js whitespace normalization of repeated spaces remains a viewer behavior, not a claim of exact whitespace reproduction.

New focused coverage exercises added/original hyperlink export, source-bound draft recovery, unsafe URL rejection, original-link update/deletion, editable PDF-to-DOCX phrase preservation, blank-page refusal and cancellation. Also repaired the shared workspace's zero-byte export guard specifically for TXT; PDF and other document exports must remain nonempty. An end-to-end DOM test deletes all TXT content, exports and reopens the empty file.

Validation: the complete `tests/document-editor-v2*.test.mjs` suite passes 44/44. Isolated browser bundle compilation with esbuild passes. Frozen-source isolation tests pass. Node PDF.js emits standard-font-data/legacy-build warnings; these runs do not establish visual PDF fidelity.

Deployment gate remains open: no usable Chromium binary exists here. A fresh headless-shell installation returned truncated/invalid ZIP downloads. The real browser PDF script therefore remains unrun; real canvas rendering, actual IndexedDB reload recovery, mobile interaction and download verification must pass before production replacement. Existing limitations remain: encrypted-PDF unlocking, complex objects, coordinated object/text reflow and exact editable Word reconstruction are not supported. Do not reinterpret this repair as full PDF feature completion or freeze approval. No deployment performed.

The copied PDF sweep also completed successfully: all nine `fortress/tests/*regression.mjs` scripts passed using `--experimental-vm-modules`. Coverage includes DOM-simulated browser stability (26 checks), OCR draft/export/search/style/geometry, runtime policy, ReadableStream compatibility and simulated mobile scan interactions. These are automated simulations, not real Safari/Android/iOS certification.

## 23 October 2026 — Encrypted PDF and real-browser checkpoint

This checkpoint supersedes the earlier unavailable-browser and unsupported-encryption status for the shared Document Editor PDF adapter. The standalone copied-engine development page retains its original encrypted-input refusal; the shared adapter prepares encrypted inputs before handing them to that engine.

### Native encrypted input

Added local QPDF 12.2.0 WebAssembly from pinned `@neslinesli93/qpdf-wasm` 0.3.0, with archive integrity checked against the registry SHA-512. Unmodified runtime files, upstream package metadata/README, QPDF license and provenance notices live in the isolated PDF vendor directory. Files and passwords are not uploaded. A dedicated worker performs decryption, verifies page count and is terminated after completion/error or a 60-second deadline. Passwords are read from a private virtual file and are never written into workspace history or recovery records. Correct-password decryption retains native PDF content; this is not a raster conversion.

The password dialog supports retry/cancel, states that local recovery contains a decrypted document copy, and explains that exports are unencrypted. Recovery binds decrypted bytes to the original encrypted source digest and validates plaintext/page count before reuse. Recovery does not request or store the password. AES-256, AES-128, empty opening-password cases, native text, page count and form values pass automated tests. Passwords containing newline/NUL controls are explicitly unsupported. The 60 MB/250-page editing limits remain.

### Object and reflow coordination

Object validation now uses final export metrics where available and guarded live-state fallback otherwise. Changes on unaffected pages can coexist with native text reflow. The guard now includes upward compaction (`shiftY`), cascade and overflow metrics, and rejects unknown movement ownership. Changed page counts, same-page object/reflow conflicts and original image edits combined with same-page OCR remain protected. A discard-object-edits action lets the user resolve a conflict while retaining text/OCR changes, with workspace Undo available afterward. Source objects that become nested in reflow slices are not remapped by guesswork.

### Verification and release boundary

- Complete `tests/document-editor-v2*.test.mjs`: **49 pass / 0 fail**.
- Real Chromium 153.0.8010.0 at **1280px** and **390px**: canvas rendering, native edit, real IndexedDB autosave, undo/redo, reload recovery, search/replace and downloaded PDF all passed.
- Additional real Chromium encrypted workflow: AES-256 wrong-password retry, native edit after unlock, real reload recovery without password, unencrypted two-page download, and cancellation retaining the prior session passed.
- Browser runtime was obtained through the isolated test-only `@sparticuz/chromium` package after Playwright CDN archives failed. It is not a website dependency.
- Existing browser test search selector was scoped to the native search panel because the current workspace also has an OCR search panel.
- Isolated browser bundle compilation passed; frozen-source isolation checks and whitespace checks passed.

Reproduction: run the two browser scripts with a local static server in the same execution/network namespace; set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and, for the test-only extracted Chromium, its library path. `tests/document-editor-v2-pdf-unlock-browser.mjs` generates its own encrypted fixture and exercises the actual local WASM worker.

The supported PDF workflows are candidates for controlled staging review. This is not full feature completion or production freeze approval. Physical Android/iPhone/Safari/Firefox checks, real OCR corpus/device coverage, complex object manipulation, same-page object/text coordination and exact editable Word reconstruction remain open. The main editor, frozen Edit PDF and other frozen tools were not changed. No deployment was performed.
