# Document Editor blocker remediation — 27 October 2026

Continues from the deployed Word reflow fix b0af290. Changes are restricted to Document Editor. Other tools, including frozen Edit PDF, are unchanged. Current main's independently completed PDF Splitter changes are retained.

## Completed

- Ordinary native PDF text outside verified AcroForm widget areas is editable. The previous whole-document AcroForm lock is replaced with region checks. Unknown/malformed widget locations and XFA remain protected; signed and encrypted source locks remain.
- Export checks field values, field dictionaries, widget geometry and appearance graphs against the original. Overlapping text/image/link edits are refused. Signed PDF edits are refused at final export. Form layout remains fixed: reflow and upward page reconstruction are not enabled for form-bearing documents.
- Workspace PDF snapshots and exports are serialized. Export waits for a running Done operation, including its preview/render completion, then saves the committed revision. Unapplied edits still require Done/cancel. Autosave no longer replaces export confirmation or misreports a snapshot/readiness error as a storage failure.

## Validation

- 56 current V2 automated tests passed, including immediate Done/export in the workspace, preserved form value, protected widget areas, appearance/geometry/value tampering, signature protection, pending-edit refusal and serialized operations.
- Five focused complex Chromium scenarios passed locally: form-bearing native edit/export, crop/rotation, encrypted complex PDF, damaged-input retention and no-form native editing.
- Desktop 1280px and phone-width 390px Chromium scenarios passed same-turn Done/export on the complex form-bearing PDF, unfinished-edit refusal, form preservation and persistent export confirmation.
- Real OCR correction and searchable export passed on the mixed PDF containing the form; field/widget preservation remained enforced.
- The first local OCR test attempt reached the managed network proxy instead of localhost. A localhost proxy bypass corrected the test setup; the application case then passed. This was not an application regression.

## Still open

- User acceptance of the deployed Word deletion fix on the affected real DOCX.
- Physical Android/iOS/Windows/macOS and Safari/Firefox verification. Phone-width Chromium is not device certification.
- Original full-editor feature gaps: cross-field Word selection/deletion, advanced table/image/header/footer editing, legacy DOC/XLS support, and complex PDF object/text coordination. Basic XLSX/CSV/TXT engines remain at their verified simple scope.
- Form filling, XFA editing and form-aware content reflow are not implemented by this change. Protected cases are explicitly refused.

This checkpoint does not freeze Document Editor or claim the original full-editor scope complete. Existing completed features were not rebuilt; directly affected paths were retested for regressions.
