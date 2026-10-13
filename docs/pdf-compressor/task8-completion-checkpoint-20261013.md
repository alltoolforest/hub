# Task 8 — lifecycle gate complete

Added a reusable isolated session with empty/loading/ready/processing/completed/
failed/cancelled states, immutable retained source ownership, failed-replacement
recovery, repeated mode runs, concurrency rejection and generation-based stale
result suppression. Verified result receipts are checked against the active
source and exact received output before an immutable PDF Blob is downloadable.
Oversize input is rejected before reading. Errors provide recovery guidance.

The worker bridge creates a disposable worker for each operation, transfers a
copy rather than detaching the retained source, and terminates on success,
failure, cancellation, timeout or message failure. Termination cancels even
synchronous WASM. Download URLs are revoked on replacement, retry, cancellation,
reset and disposal. Disposal is safe as an unbound navigation callback.

Changed: compression-session.mjs, worker-bridge.mjs, isolated session worker,
unit/browser tests and a three-browser lifecycle CI job. The older minimal run
controller remains untouched; production UI wiring belongs to Task 11.

Local tests: 4 adverse lifecycle groups passed, covering retries, failed input
replacement, loading/processing cancellation, late successes, reset, duplicate
operations, preflight, invalid receipts, worker crashes and timeout. A real
Chromium worker test completed all modes from one retained source, recovered
after invalid replacement, cancelled processing, retried and reset. Seven
workers were started and terminated; four URLs were created and revoked.
Zero unexpected network requests. CI coverage for Firefox/WebKit is added;
physical navigation/BFCache behavior of the final UI is still a Task 11 check.

Unresolved: broad device memory/performance and final UI navigation testing;
these do not change the verified session model or authorize release. Any worker
failure retains the recoverable source and withholds output.

Risks: retained source plus worker input copy consumes memory; source ownership
is deliberate for reliable recovery and will be budgeted in Task 10. No source
data is persisted by this model. Task 9 may begin; Tasks 9–13 remain.
