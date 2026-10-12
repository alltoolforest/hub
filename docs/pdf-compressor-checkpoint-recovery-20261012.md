# PDF Compressor checkpoint recovery — 12 October 2026

Release decision: **NO-GO; not deployed, not frozen.**

## Verified starting point

GitHub PRs #185–#192 were read live. All are open drafts and form the reported
stack, starting on main `6d0b6530da248fd4af80a0eaa8d416405b46a2b2` and ending
at PR #192 `8884dfbd96ad8a2138da818115ed134855b1c586`.
The commit workflow-runs API returned an empty list for that head; this does
not establish a green CI result. The local checkout matches that SHA.
Recovery branch: `pdf-compressor-checkpoint-recovery-20261012`, based on #192.

## Confirmed defect and minimal fix

The Task 5 image candidate checked codec availability before checking decoded
alpha. Transparent input without an injected encoder threw `codec-unavailable`
instead of preserving the source. Move the codec check after alpha detection.
Tests additionally assert that an encoder is never called for transparent
pixels and that opaque input without a codec still fails closed.

Changed implementation: `assets/js/pdf-compressor-v2/image-candidate.mjs`.
Changed test: `tests/pdf-compressor-task5-image-candidate.test.mjs`.
Changed experimental gate: `tests/pdf-compressor-engine-browser-gate.mjs` now
logs each independently checked fixture's input/output bytes and elapsed time
before the complete run finishes, and bounds browser startup to 30 seconds.
This prevents a later browser startup failure hiding completed fixture evidence.
No PDF rewriting, production integration or release changes.

## Executed regression

Command:

```sh
node --test tests/pdf-compressor-task1-baseline.test.mjs tests/pdf-compressor-task3-policy.test.mjs tests/pdf-compressor-task3-image-inventory.test.mjs tests/pdf-compressor-task4-lossless.test.mjs tests/pdf-compressor-task5-image-candidate.test.mjs tests/pdf-compressor-remediation-policy.test.mjs
```

Before fix: 33 passed, 1 failed. After fix: 34 passed, 0 failed, 0 skipped.
Node v24.19.0, Linux x64. `git diff --check` passes.
The suite includes **known-defect assertions** against the legacy copier.
A green suite does not mean those production defects are fixed or that the
replacement is launch-ready. Fake JPEG bytes test a contract, not decodability.

Task 2 benchmark also executed successfully with native qpdf unavailable.
Its synthetic in-place serialization profiles are no substitute for a real
browser compressor or independent visual/text preservation.

## Blocking source and acceptance gates

The attached handoff was read completely. The canonical Master Blueprint v1.0
was not found in the repository, Library searches or retrieved prior context.
Retrieved context confirms that the original plan has 13 launch-critical and
6 deferred tasks but did not return the actual requirements. The handoff
explicitly requires that canonical plan as the controlling reference; this
report does not reconstruct or replace it. Supply the original blueprint or
its exact repository/file location before broad remaining-task implementation.

Tasks 3–5 still require realistic corpus acceptance, approved browser engine
provenance/licensing/security, real image replacement, independently checked
content and rendered output, genuine signed/encrypted cases and mobile data.
Tasks 6 and 8 have policy/lifecycle primitives only; 7 and 9–13 are not certified.
No physical Android/iOS or Windows/macOS tests or user manual acceptance were
performed. No meaningful real-world downloadable compressed result is claimed.

Experimental `qpdf-wasm-esm-embedded@1.1.1` and Playwright 1.56.1 were installed
in disposable untracked local node_modules only. The qpdf module hash is
`68e0beb59e25e5bba25ca8af498225f5095b630e33e05e3196b9374d73f3c462`.
Package metadata/license is not source-to-binary attestation or CVE clearance.
No experimental binary or test dependency is added to production or committed.

## Browser output evidence (synthetic experiment only)

The local Chromium gate independently reopened all eight candidates and matched
the existing partial structural profile. Signed-marker rejection also passed
before the next browser started. This is not pixel/text/OCR equivalence proof.

| Fixture | Input bytes | Returned bytes | Saved bytes | Elapsed ms |
| --- | ---: | ---: | ---: | ---: |
| scanned-like | 339211 | 274421 | 64790 | 2503 |
| image-heavy | 708693 | 571649 | 137044 | 4628 |
| mixed | 113682 | 92301 | 21381 | 788 |
| form | 2124 | 1834 | 290 | 69 |
| bookmarks | 1489 | 1489 | 0 | 67 |
| attachment | 1441 | 1441 | 0 | 67 |
| tagged | 1287 | 1287 | 0 | 52 |
| digital | 1370 | 1370 | 0 | 63 |

One local synthetic trial per fixture, not mobile performance or real scans.
The unchanged-original fallback was used for the last four fixtures; these
rows cannot certify preservation of transformed tagged/bookmarked PDFs.
The full three-browser gate is not certified PASS.
Firefox did not finish startup and the local run was interrupted; no Firefox
fixture result was emitted. WebKit was not reached, and browser installation
reported missing WebKit system libraries. These are environment/execution
blockers, not demonstrated product failures or cross-browser passes.

## Scope and release

Implementation and tests are confined to the isolated compressor candidate.
Frozen tools, Image Enhancer work, shared engines, routing and production HTML
were not edited. Regression risk of the fix is limited to alpha fallback order;
the opaque missing-codec behavior remains covered. Wider PDF integrity risks
remain unresolved and prohibit release.

Release sequence remains Implement → Pre-deployment audit → Deploy → Production
audit → Manual verification → Regression → Freeze. No release stage beyond
isolated implementation/regression has been certified in this recovery.
