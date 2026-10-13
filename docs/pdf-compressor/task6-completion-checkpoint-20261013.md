# Task 6 — complete

Implemented a single document-aware pipeline over the independently verified
image and lossless engines. Balanced is the default. Lossless never requests
image quality reduction. Digital/vector PDFs skip image transformation; eligible
scanned/mixed images use the approved preset and decoder before lossless
optimization. Each stage retains its existing integrity checks. Final sizes and
savings refer to the original PDF, with original-byte fallback for no reduction.
Settings report both allowed quality reduction and transformations actually
applied, avoiding a claim that every Balanced/Strong run degraded images.

Changed: compression-pipeline.mjs, mode-policy.mjs, isolated worker/browser
tests, private-corpus test routing, standalone diagnostic entry/build and CI.
No production, frozen-tool, shared engine or Image Enhancer changes.

Verified engine checkpoint: a27decc322afb135999ef9fb5ce99e77c9c1117b.
CI run 38360006000 completed successfully. The three-mode job passed 45 cases
per browser in Chromium, Firefox and WebKit (135 cases). Each browser recorded
30 reductions and 15 byte-identical original fallbacks, with zero unexpected
requests under strict local-only CSP. Independent reopening, page rendering,
exact extracted text/OCR coordinates, geometry and measured reporting passed.
The input, image, lossless and pinned source-artifact jobs also passed.

Local adjacent suite: 20 engine tests and 2 routing/cancellation tests passed.
The combined pipeline also passed 9 private real-scan runs; lossless render
differences were zero and lossy results remained inside the accepted bounds.
Private inputs, outputs and detailed results remain outside GitHub.

The standalone diagnostic now invokes the combined pipeline. Local file-mode
QA passed all modes, cancellation/stale-result suppression, oversize preflight,
no remote requests and narrow layout. This updates a test harness, not the final
Task 11 interface, and does not repeat or claim physical-device certification.

Unresolved: broader measured device performance and real-device coverage remain
Task 10 release gates. Unsupported larger/complex inputs retain their existing
safe rejection policy. Lossy presets have provisional quality thresholds; they
cannot promise a reduction for every PDF. Staging is isolated; no deployment.

Regression risk: combined stages add parsing/CPU overhead, to benchmark in Task
10. Verification errors fail closed rather than releasing an unchecked stage.
Dependency change: the mobile diagnostic uses orchestration instead of separate
engine calls. Tasks 7–13 remain in canonical order.
