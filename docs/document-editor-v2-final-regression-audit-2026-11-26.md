# Document Editor — final regression and freeze readiness

Audit date: 26 November 2026. Functional release: `9c7c99e7562abf4e02a10a16350a435677d75180` on main. Public release marker: `2026-11-26-load-recovery`.

## Completed work

The previously unfinished loading fix is implemented, tested and deployed. PDF transport imports use at most three attempts; syntax/evaluation failures are not retried. Shared native loading precedes the hybrid importer. Release identifiers were updated together in the entry HTML, workspace, adapter and hybrid native import.

Fresh retry URLs cannot always clear the browser's cached failure of a static dependency. Persistent failures therefore keep the open document intact and expose **Save draft and reload editor**. This action waits for applied edits and successful draft persistence before reloading. Storage failure refuses reload and retains the document. After reload, the saved draft can be restored and the PDF reopened. No editing/export operation is replayed.

Editing, reflow and export algorithms were not changed in this release. The frozen Edit PDF tool and other tools are unchanged. Private fixtures and generated user-document exports are excluded from commits.

## Verification

| Check | Result |
| --- | --- |
| Document Editor unit suite | 163 passed; zero failures/skips |
| PDF/OCR regression scripts | All 9 passed, including 26 DOM-simulated stability checks |
| Local ten-PDF corpus | 39/39 passed |
| Final live ten-PDF corpus | 39/39 passed, zero failures; initial failed run retained separately below |
| Loading injection at 1280px and 390px | Transient recovery, bounded failure, retained session, draft-safe reload, restoration, PDF reopening and storage-denied refusal passed |
| Word unequal-column paragraphs/tables | Continuation typing/deletion, formatting, export, Undo/Redo and 24-cell table integrity passed |
| Supplied PDF deletion workflows | All 8 passed: deletion before/after expansion, expanding after deletion, removing expanded paragraphs, shortening across pages, adding after deletion and deleting moved text; export/Undo/Redo/recovery retained earlier content |
| Supplied PDF length workflows | All 4 passed: short-line growth, repeated expanded editing, 100-line pagination and adjacent expanded paragraphs |
| Live TXT/DOCX/XLSX/CSV | Editing and exported contents passed |
| Live replacement at phone/desktop widths | Multiline/long replacement, page flow, deletion/upward movement, repeated edits, batch Undo and atomic rollback passed |
| Live zoom at phone/desktop widths | Bounds, keyboard control, scale label, unchanged export and unfinished-edit protection passed |
| Live layout-preserving deletion | Diagnostic rerun passed at both widths: surviving text coordinates, pixels outside deletion, links, page count, Undo/Redo, recovery and download |
| iPhone delivery simulation | Direct-tap sharing receives exported bytes; fallback downloads match. Passed locally and live for TXT/DOCX/XLSX/CSV |
| PDF download fallback | Automatic and fresh-tap retry exports have identical valid bytes |
| Deployment | GitHub Pages build/deploy succeeded. Five changed runtime resources match the release byte-for-byte |
| Source isolation/whitespace | Only Document Editor runtime, tests and this audit changed; diff checks passed |

## Initial live failures and retests

The first live corpus run recorded **38 passes and 1 failure**: PDF07 (mixed native/scan) reported `Export validation failed` during Undo/Redo/recovery. The first live structured-deletion run also timed out awaiting the original heading after Undo at 390px; its desktop case passed. Neither first attempt is counted as a pass.

PDF07 subsequently passed an isolated retest and a second diagnostic retest (4/4 checks each). The structured-deletion diagnostic rerun passed at both widths. Diagnostic response transforms only enrich validation-error messages; they do not change validation decisions or production files. These failures have not been reproduced in those reruns, and their cause is not established. Do not describe them as diagnosed or fixed.

The final complete live diagnostic corpus run then passed **39/39 checks, zero failures**, including PDF07 and encrypted input. The initial failures remain recorded above; passing reruns do not establish their original cause.

## Independent CI finding

An unrelated PDF Compressor workflow failed while installing test dependencies: its Playwright 1.56.1 does not support the GitHub runner's `ubuntu26.04-x64`. Its product tests never ran. This release did not modify that workflow or compressor code. GitHub Pages deployment succeeded independently.

## Freeze decision and boundaries

Feature development remains stopped. This audit covers the bounded existing feature scope, not unrestricted PDF editing, exact Microsoft Word pagination or universal device certification.

Physical iPhone saving remains unverified in this environment. The user's Ctrl+Shift+R success concerned the opening incident; it must not be counted as physical-iPhone save acceptance. Implementation, deployment and automated regression work are complete. Status: **READY FOR FINAL DEVICE ACCEPTANCE / FREEZE REVIEW** for the bounded current scope. No FROZEN declaration has been made because physical-iPhone save acceptance is still outstanding. The two non-reproduced initial live failures are a documented reliability risk, not a diagnosed/fixed defect or a hidden pass.
