# CSV Viewer & Cleaner — Task 6 release-readiness report

Date: 2026-10-08
Branch: csv-cleaner-task1-import
Status: NO-GO — verification incomplete.
Scope: final QA and readiness only; no deployment or changes to frozen tools.

## Evidence
- Existing Task 1–5 modules fetched and inspected.
- Focused integration checks executed in a JavaScript environment: 6/6 PASS.
- Shared editor module parsing: PASS.
- New consolidated Node test suite committed for later CI execution, but not executed through the repository's Node test runner.
- No end-to-end browser upload/edit/cleanup/export test executed.
- No mobile, screen-reader, memory or performance measurements collected.

## Required release-entry gates
1. Run ALL repository CSV tests with Node's native test runner (Task 1–6); resolve failures without changing frozen tools.
2. CSV import → edit → clean → undo/redo → search/filter/sort → export → re-import, including XLSX, using real browser sessions and fixture comparisons.
3. Validate dangerous spreadsheet payload behavior with CSV and XLSX opened by a spreadsheet application; document legitimate values vs blocked formulas.
4. Confirm operations after filtered/sorted views and across page boundaries with zero loss of hidden/non-visible rows.
5. Verify dirty-state behavior for successful downloads, cancelled downloads, reimport, new document, navigation, and undo to original.
6. Measure 2,000×100 on supported desktop and mobile browsers, including memory, responsiveness and load/cleanup/export responsiveness.
7. Perform keyboard and screen-reader checks, 200%/400% zoom, tablet and phone scroll/navigation and orientation changes.
8. Verify browser-local file processing with developer-tools network observations and validate dependency security and CSP/header behavior on intended hosting.
9. Test DOCX Viewer and Document Editor regression, as editor.js is shared. Never modify protected frozen tools.
10. Review CSV page title/description and site SEO configuration. robots.txt currently disallows all crawling and sitemap.xml still contains FINAL-DOMAIN placeholder; release configuration issue must be fixed only in its authorized site-wide launch workstream.

## Go/no-go
NO-GO until all P0/P1 issues are resolved, task 1–6 acceptance evidence passes, and shared-tool isolation is verified.
Do not enter pre-deployment audit, deploy, production audit, manual verification, regression, or freeze yet.

## Manual test script
- Open clean CSV with BOM, semicolon, tab, Unicode, quoted newlines, malformed quotes, ragged rows and max-size fixture.
- Verify preview counts and column alignment; explicitly choose encoding and delimiter as needed.
- Edit row 1, row 51, row 2000, then switch pages and revisit values.
- Apply trimming, blank-row removal, exact dedup, key-column dedup, sort, search and filter; undo/redo every destructive operation.
- Export both CSV and XLSX; reopen and compare all rows, including hidden and non-visible rows, signed values and leading-zero identifiers.
- Trigger formula-risk warning and validate resulting spreadsheet safety.
- Verify edit/focus, keyboard navigation, touch scrolling, screen reader announcements and unsaved-change prompts.

No assertion of production verification is made in this document.
