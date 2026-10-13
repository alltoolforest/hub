# Task 7 — output integrity gate complete

Added a final handoff gate over the verified mode pipeline. It independently
reopens the source and final output, compares geometry, page profiles and
protected-feature inventory, compares exact independently extracted text and
placement fingerprints, validates status/byte accounting and binds the handoff
to source/output SHA-256 digests. Equal-size fallback must be byte-identical.
Text extraction has aggregate item/character limits and serial page cleanup.

This final postcondition complements, rather than replaces, the engines' full
protected-object graph checks and independent image-quality verification.
Arbitrary lossy bytes are not authorized by passing a presence-only profile;
compressAndVerifyPDF always invokes the verified stage composition first.
Original source bytes remain available; any failure throws before handoff.

Changed: output-integrity.mjs, independent-text-reader.mjs, isolated Task 7
worker/browser and corruption tests, and a separate three-browser CI job.

Local verification: 45 Chromium mode/corpus cases passed reopening, exact text
and geometry, output digests, independent full-page render comparison and
local-only network/CSP checks. All output sizes match the already cross-browser
verified Task 6 engine results. Five deliberate corruption/adverse tests passed:
malformed bytes, inaccurate reports, false original fallback, cancellation,
same-count native-text mutation, text budgets and metadata-changing optimizer.
Existing lower-level tests also reject protected-graph and image-quality faults.

No known silent loss in the supported corpus. The final checker performs no
compression transformation. Browser automation for the new wrapper is added to
CI; broad platform/device certification remains a later release gate and is not
claimed by this local functional completion checkpoint.

Risks: additional parsing/text verification costs will be measured in Task 10.
Very text-heavy inputs can hit the new exact-text budget and fail safely.
No production or unrelated-tool changes. Task 8 may begin; Tasks 8–13 remain.
