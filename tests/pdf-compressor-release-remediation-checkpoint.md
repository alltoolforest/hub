# PDF Compressor — isolated pre-deployment blocker remediation

**Scope:** draft PR #219, based on the unchanged Task 7 PR #218. No merge, deployment or freeze. This release branch is *not* a production release artifact.

## Defects addressed in source (automated verification required)

1. **A01 scoped website route staging:** the original `/documents/pdf-compressor/` page now imports `assets/js/pdf-compressor-v2/site-boot.mjs` instead of activating the legacy copier. Its own HTML metadata and sole catalog row use “PDF Compressor.” Shared application routing and other tools are untouched; the legacy algorithm remains intact for history/regressions. Page keeps exactly one H1 and mounts the compressor as an H2 within the workspace.
2. **A03 main-thread source-memory regression:** File-owned selection no longer eagerly reads and copies the full PDF in `compression-session.mjs`. The disposable worker preflights and hashes the same immutable File bytes; an inspection report without a valid 64-hex SHA-256 fails closed. The final independently verified PDF receipt must still match that source hash and independently computed output hash in the main thread. The worker reads the source during compression as before.
3. **Staged static worker bundling:** a separate CI-only Python/esbuild builder generates `assets/js/pdf-compressor-v2/dist/worker.js` from the pinned PDF.js, qpdf/WASM/fonts and the approved source, uploads a SHA-256 manifest and artifact. This worker is *generated only on CI*, not checked into the branch and not deployed. **Before any production activation, the tested generated runtime bytes must be published atomically with the new route.**
4. **Integrated-site regression:** new headless Chromium, Firefox and WebKit test navigates to the actual compressor site URL on a local server with explicit restrictive CSP, exercises all four compression modes with real downloaded/reopened PDFs and signed-file rejection. Separate unit test rejects absent/mismatched worker source hashes and detects any main-thread `File.arrayBuffer()` use. Existing full 19-job CI coverage is retained, with one additional integration job. Baseline regression history is preserved; its route assertion now targets the approved v2 replacement.

## Still blocked (do not mask with automated green)

- **A02 unknown/low-memory mobile:** conservative 12 MiB / 8 MiB limits are unchanged by design, because increasing them without measured available RAM would compromise bounded-memory safety. The real 15.91 MB reference may be rejected on iOS/unknown mobile. Requires physical device profiling, user-approved safe admission strategy or explicit acknowledged support limitation before final launch decision.
- **Artifact publication:** `dist/worker.js` is a reproducible CI artifact, not a committed or deployed asset. The source route in this draft will not work on GitHub Pages unless that exact reviewed artifact is published. Do not merge an incomplete route alone.
- **Real-world corpus / physical device:** no new OnePlus Nord4, iPhone, high-entropy scanner or broad third-party PDF compatibility certification is asserted.
- **Hosting:** response headers in GitHub Pages / Cloudflare need actual network validation; the CI test applies a simulated restrictive CSP but cannot establish host headers. Review production SEO, robots/canonical, cache, worker/WASM MIME before release.
- **Time limits:** standard 120 seconds and target-mode up to 240 seconds remain; a fast universal result is not guaranteed for complex documents.

## Release sequence

1. Get fully passing CI for PR #219, including new route integration and focused source-digest tests.
2. Prepare an atomic, separately approved stage/deployment bundle containing the exact CI worker, page, scoped catalog change and rollback material; do not modify other tools.
3. Carry out the combined end-of-blueprint manual real-document/device tests, starting with the OnePlus Nord4 and the 15.91 MB reference.
4. Resolve A02 only with measured bounded-memory evidence and full integrity regressions; use explicit support limitation if safe universal support cannot be delivered.
5. Conduct final pre-deployment audit and request explicit deployment authorization. After authorized deployment: production audit, manual verification, regressions, then explicit freeze.

**Current decision:** engineer-only staged remediation, no production approval. Missing artifact publication and physical/mobile admission gates remain blockers.
