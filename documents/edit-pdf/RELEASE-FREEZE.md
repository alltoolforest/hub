# Edit PDF release audit — 4 October 2026

Scope: current native-text editing, scanned-word OCR replacement/deletion, scanned-page Add text, page-by-page native/OCR routing, and combined PDF export. This record does not certify future universal OCR, image editing, forms, signatures, annotations or redaction features.

## Verified baseline

- User manual verification: “it's working” followed by authorization for final regression and freeze, 4 October 2026.
- Scan controls and cache refresh: PRs #113 and #114.
- Final audit found and corrected a confirmed rotated/cropped scan export defect in PR #116. Previous export scaled against the media size without respecting page rotation or crop origin. Export now uses the inverse PDF.js viewport transform for replacement and insertion patches.
- Code merge: `7e6aef8191a4f0070181fa1b4ae93d4b1565ef80`.
- Only files within `documents/edit-pdf/` changed. Frozen tools and unrelated categories were preserved.

## Regression evidence

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Native editor stability and resource bounds | 26/26 pass | Pending-edit guards, save/reopen, undo/redo, navigation, memory/file/page bounds, OCR loader retry and worker disposal. DOM simulation. |
| PDF.js runtime policy | 6/6 pass | Local runtime files; Safari/iPad selection and modern-browser path. |
| Safari ReadableStream compatibility | 4/4 pass | Reader release, cancellation, and preservation of native implementations. |
| OCR appearance matching | 14/14 pass | Font family/weight, ink colour, baseline, glyph bounds and source preservation. Real canvas. |
| Dependent insertion planning | 6/6 pass | Ordered replanning and refusal of unsafe dependent moves. |
| Text clustering | 6/6 pass | Independent table cells and normal adjacent text grouping. |
| Rotated/cropped scan export | 8/8 pass | 0/90/180/270 degrees with/without crop origin. Real PDF.js viewport parsing and PDF export, independent PyMuPDF rendering. Position, orientation and unchanged pixels outside edits checked. Input painting uses a deterministic fixture. |
| OCR replacement and export integration | Pass | Repeated replacements preserve source style; valid two-page export. Rerun after geometry correction. |
| Scan insertion/mobile-control integration | Pass | Insert before OCR, scaled tap coordinates, re-edit/delete, invalid bounds, unfinished edits, word picker, failure/retry/empty feedback and export. Rerun after geometry correction. |

70 individually counted regression cases passed, plus two broader integration suites. No completed unrelated tests were repeated after the narrow geometry correction.

## Scope and compatibility limits

- OCR currently defaults to English. Recognition and typeface matching depend on scan quality and available device fonts; this is not universal OCR or exact recovery of every original font.
- Complex-background edits and replacements that cannot fit safely remain refused. Existing file, page and memory limits remain in force.
- Live cloud Chrome testing and user manual confirmation are evidence for this release, not certification on every physical Android, iOS, Windows and macOS device.
- Prior cloud-browser download events timed out although the editor validated the PDF and exposed its download link. Independent local PDF export/reopen/render tests passed. Do not claim cloud download retrieval passed or silently treat this automation limitation as an application failure.

## Freeze policy

After final deployment/live verification is recorded below, lock this current feature baseline. Reopen only for a confirmed production defect, security/compatibility/legal requirement, or an explicitly approved future release. Do not polish, refactor, redesign or add deferred features during the freeze.

## Final deployment and live audit

- GitHub Pages run `37189825512`: build, report and deploy succeeded for the geometry correction.
- Live Chrome loaded the versioned `20261004-scan-geometry` module entry.
- Mixed three-page PDF: page 1 routed native and accepted `Native final audit`; page 2 routed OCR, recognized eight words, and changed `sample` to `tested`; page 3 retained its original native text.
- Navigating away from and back to the scan preserved the visible replacement.
- Combined Save a copy completed: `Hybrid PDF validated — 1 native change, 1 OCR change — download ready.`
- No application error was observed in this workflow. Captured browser-console errors came from the browser extension metadata channel.
- Screenshot evidence: `editpdf-final-regression-20261004.jpg`.
- The previously documented cloud download-event limitation was not repeatedly retried. User manual confirmation and independent local PDF render/reopen checks remain the applicable evidence; downloaded-file retrieval from cloud Chrome is not claimed.

## Decision

**FROZEN — current native/scanned-text feature baseline, 4 October 2026.**

The confirmed audit blocker is fixed and deployed. The scoped regression and live workflow checks pass. Preserve this baseline under the freeze policy above. This is a release decision for the tested feature scope, not certification of all PDF structures, all OCR languages, or every physical browser/device combination.
