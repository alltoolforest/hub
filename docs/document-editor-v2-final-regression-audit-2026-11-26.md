# Document Editor final regression audit — 26 November 2026

Initial checkpoint (superseded by the completion record below): automated checks passed, but fresh browser acceptance could not yet be completed.

## Release examined

GitHub main: 764800b2386a505d41d2b49d81b00e816c855241, “Preserve PDF layout when deleted text cannot safely compact”. Verified through the GitHub connector. Public release marker: 2026-11-13-layout-deletion.

Seven public resources were fetched and compared byte-for-byte against this commit: Document Editor HTML, workspace.js, interface.js, stylesheet, PDF adapter, hybrid-editor.js and fortress/src/main.js. All match. This verifies deployment consistency for those resources, not every transitive dependency or a previously cached browser session.

## Fresh verification

- `node --test tests/document-editor-v2*.test.mjs`: 163 passed, zero failures/skips. This exercises the existing local working tree, including four tests for an unpublished module-loader change. It must not be described as 163 tests on deployed code.
- All nine `documents/document-editor-v2-lab/pdf-engine/fortress/tests/*regression.mjs` scripts passed with `node --experimental-vm-modules`. Coverage includes 26 DOM-simulated stability checks, OCR draft/export/geometry/search/style, PDF.js runtime policy, ReadableStream compatibility and simulated mobile scan workflows.
- `git diff --check` passed.
- No new implementation changes, pushes or deployments were made for this audit. Other tools were not modified.

## Incomplete browser verification

The module-loading browser runner and ten-PDF browser corpus could not launch Chromium. `/usr/bin/chromium` exists as a wrapper but its `/usr/lib/chromium/chromium` executable is missing. An attempted Playwright headless-browser installation failed to download. Neither attempted browser run reached the application; these are environment failures, not demonstrated product regressions. Earlier passing browser results are historical evidence and are not counted as fresh passes.

## Pending local work and acceptance

Pre-existing unpublished changes add bounded PDF module transport retries and release identifiers in workspace.js, engines/pdf.js, hybrid-editor.js and the entry HTML, plus module-loader.js and tests. They remain local and are excluded from the deployed-release freeze decision. Their unit tests pass; their request-interruption browser checks have not run successfully in this environment.

The user's hard-refresh success resolves the observed opening incident for that session, but does not prove automatic cache recovery. The visible conversation also does not contain explicit physical-iPhone download acceptance; desktop hard-refresh success must not be treated as that confirmation.

## Remaining freeze gates

1. Run fresh browser edit/export, undo/redo and recovery checks on the deployed release, including the ten-PDF corpus and four-engine phone/desktop workflows.
2. Resolve the unpublished loader change deliberately: validate and release it if retained; do not silently include it in a freeze.
3. Confirm physical-iPhone saving if this acceptance remains outstanding.

No code regression was found in the completed checks. Final acceptance remains incomplete, so the conditional authorization to freeze has not been exercised.


## Completion record — 26 November 2026

The browser blocker was resolved by installing the official Chrome for Testing headless executable in scratch. Fresh browser checks now run successfully. The unfinished loader change was corrected after injection testing exposed browser module-map caching of failed static dependencies.

### Final loading behavior

- PDF transport imports make at most three attempts, with short delays and fresh retry URLs. Release identifiers are retained.
- Syntax/evaluation errors are not retried. Editing/export operations are never replayed.
- Native imports resolve before their hybrid importer, avoiding a competing initial request.
- Persistent or cached dependency failures leave the open document intact and offer **Save draft and reload editor**.
- That action waits for committed edits and successful draft persistence before reloading. Storage failure refuses the reload and keeps the document available. The draft can be restored after reload, then the PDF reopened.
- Entry HTML, workspace, adapter and hybrid native import are versioned together as `2026-11-26-load-recovery`.
- Editing, reflow and export algorithms are unchanged by this release. Frozen Edit PDF and other tools are untouched.

### Fresh browser results

- Ten complex PDFs: **39/39** checks passed, covering opening, untouched export, native editing/export, Undo/Redo/recovery, scanned OCR and encrypted input.
- PDF layout-preserving deletion at 1280px and 390px: removed text is absent; surviving text coordinates, graphics outside the removal region, link geometry and page count are preserved; Undo/Redo, recovery and downloads pass.
- PDF replacement at 1280px and 390px: multiline/long replacements, page flow, deletion/upward movement, repeated edits, batch Undo and atomic rollback pass.
- Zoom at 1280px and 390px: bounds, keyboard use, scale label, unchanged export and unfinished-edit protection pass.
- TXT, DOCX, XLSX and CSV editing/export pass. Simulated iPhone direct-tap sharing receives the exported bytes; retry download bytes match. This is not physical Safari certification.
- PDF automatic and fresh-tap retry exports produce identical valid bytes.
- Word unequal-column paragraph typing/deletion/export and 24-cell table continuation/edit/export/Undo/Redo pass.
- Loading-injection checks cover transient adapter/hybrid failures, persistent hybrid/native/nested failures, draft-safe reload and restoration, reopening the PDF, and refusal to reload when draft storage fails.
- All **163 unit tests**, all nine PDF/OCR regression scripts (including 26 DOM-simulated stability checks), and diff whitespace checks pass.

The source PDF fixtures and generated private document exports are excluded from commits.

### Release decision

Technical regression evidence supports the bounded current feature scope. Physical iPhone saving is not independently verified by this environment, and the visible user confirmation of Ctrl+Shift+R concerns the desktop opening incident. Do not count it as iPhone save acceptance. Feature development remains stopped. Freeze readiness is subject to successful public deployment verification of this exact update; physical-device acceptance must remain recorded separately. No unrestricted PDF editing, exact Word pagination or universal device certification is claimed.
