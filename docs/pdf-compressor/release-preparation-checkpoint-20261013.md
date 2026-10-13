# Release preparation checkpoint — not launch ready

The user authorized automated testing and continuation of remaining blueprint
work, deferring their manual verification until the end before freezing. Manual
checks are now tracked in the final release checklist; their deferral is not a
physical-device pass. No deployment, merge or freeze occurred.

## Implemented and tested

- Configurable qpdf input budgets; expanding output retains exact input. A
  filesystem-size check avoids allocating an expanded output buffer.
- Compressor-only pdf-lib fork fixes lowercase hexadecimal PDF name escapes.
  One regex change, provenance hashes, original license and regression checks;
  the shared vendor file is unchanged. This fixes a real false preservation
  failure for attachment MIME names after qpdf rewriting.
- Task 11 isolated interface uses the existing verified session and worker flow:
  file selection, three explained modes, cancellation, clear/retry, accessible
  status, exact measured savings and honest original-file fallback. CSS is scoped.
- Task 12 explanatory HTML and intended-domain canonical metadata are prepared
  for the existing `/documents/pdf-compressor/` URL. No live page, catalog,
  shared navigation, robots or sitemap changed. Candidate remains noindex.
- CI adds interface tests across Chromium/Firefox/WebKit and experimental
  near-100 MB protected-resource probes. CI results must be recorded separately.

Local results: 27 affected unit tests passed; 45 Chromium corpus/mode cases passed
with independent text/geometry and rendered-output checks; pinned qpdf hashes
passed. Chromium interface checks passed at 320/390/768/1280 px, keyboard
activation, literal hostile filename, verified Blob download and clear/reset.
Automated axe WCAG A/AA checks passed for the initial interface state. These do
not substitute for TalkBack/VoiceOver or real mobile download checks.

Large-file evidence: 99,999,995-byte PDFs with ten distinct embedded CSV datasets
completed all three modes through full integrity verification. A
99,999,455-byte high-entropy attachment PDF safely retained the exact original
with zero savings and equal source/output hashes. Evidence is synthetic and
generic, with no user documents. No percentage is promised for other PDFs.

## Remaining engineering gates

Task 10 remains open: target-size scanned/mixed/complex digital corpus, full
session memory/copy accounting, decoded resource and operator budgets,
cancellation/repeated-run checks at target size, and coherent 100 MB device
policy. Experimental tests do not raise the current advertised/device limits.

Task 11 is an implemented isolated candidate; remaining checks include the CI
browser matrix, completed/error-state accessibility, final runtime packaging and
manual assistive-technology/download checks at the user's chosen final stage.
Task 12 is prepared content, pending integrated candidate review and approved
release wiring. Task 13 audit has started; no READY decision is justified yet.

Final manual checklist: OnePlus Nord 4, supported iPhone/desktop browsers,
representative near-100 MB PDFs, all modes, repeated compression, cancel/retry,
open and inspect downloads, existing text/OCR/forms/attachments, narrow-screen
interaction and TalkBack/VoiceOver. No manual action is requested now.

## Scope and rollback

Changes are limited to compressor modules/vendor fork, compressor tests,
compressor documentation and its isolated CI workflow. Existing production
paths, frozen tools, Image Enhancer and shared engines remain untouched.
These changes exist only on a development branch; rollback before deployment is
to withhold/revert this candidate. Deployment rollback planning belongs to the
final integrated release candidate once its runtime and exact commit are fixed.
