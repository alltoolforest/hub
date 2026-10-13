# Task 9 — security/privacy gate complete for isolated pipeline

Browser-local processing remains enforced. Source bytes move only through
retained local buffers and disposable workers, never document URLs or uploads.
Network-inspected engine/session tests allow same-origin static code resources
and local image Blobs only; all unexpected origins/methods are rejected. The
standalone diagnostic embeds code, fonts and WASM and makes no remote requests.
No persistent storage or telemetry is introduced for source data.

Reviewed structural guards reject encryption, signatures, XFA and active document
actions before independent parsing/transformation. Supported attachments, links,
forms, bookmarks, metadata and tags remain protected by complete graph checks.
Attachments are preserved rather than opened. Input/graph/pixel/decoded-stream/
text limits and worker timeout/termination reduce resource-exhaustion exposure.
They are not a physical-memory or arbitrary-malicious-PDF safety guarantee.

Confirmed dependencies use pinned PDF.js 6.3.289, the existing PDF-lib vendor and
source-built qpdf 12.4.2. Runtime hashes pass. qpdf arguments and in-memory file
names are fixed, input names never become commands, temporary files are unlinked
in finally, dynamic execution is disabled, and the WASM heap is capped at
256 MiB. Worker teardown and download-URL revocation are covered by Task 8.

Advisory review (13 October 2026): PDF.js GHSA-wgrm-67xf-hhpq lists fix 4.2.67
and GHSA-hq66-cqwq-w95j lists fix 6.2.108. The pin is newer than both fixes.
The parser adapters disable eval and XFA; no viewer scripting manager is used.
qpdf/PDF-lib repository advisory pages and qpdf release notes were reviewed;
absence of a published advisory is not proof of absence of vulnerabilities.

Primary references:
- https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq
- https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j
- https://github.com/advisories/GHSA-hq66-cqwq-w95j
- https://github.com/qpdf/qpdf/security
- https://github.com/Hopding/pdf-lib/security
- https://qpdf.readthedocs.io/en/stable/release-notes.html

Hardened session error handling against prototype/inherited message keys and
unbounded worker error codes. Download names strip path/control/bidi characters
and always end in a mode-specific .pdf extension. Filenames remain literal text
in the diagnostic; metadata/text are not inserted as executable markup.

Tests: 3 new security groups, 4 adjacent lifecycle groups and 5 final-output
integrity groups pass. Browser filename-injection check passes with no created
image element, no script execution and no remote requests. Existing CI checks
real encrypted/signed inputs, supported attachment preservation and malformed
input. Pinned qpdf source-artifact hash verification passes. No unresolved
security defect identified in this scope; final UI must retain text-only binding
and rerun its injection/network checks in Tasks 11/13.

Changed: minimal compression-session hardening, generic security unit/browser
tests and this review. No production or unrelated tools changed. Task 10 may
begin; Tasks 10–13 remain. Broad performance and final UI/release gates are open.
