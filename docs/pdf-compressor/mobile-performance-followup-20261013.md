# PDF Compressor mobile performance follow-up — 2026-10-13

The OnePlus Nord4 manual report reopened the performance launch gate: the supplied 21,607,943-byte digital stress PDF stayed at “Optimizing PDF structure” for more than three minutes. This is not considered launch acceptance. Frozen tools and production integration remain untouched.

## Changes

- Feed resident compressed stream bytes directly into bounded native decompression instead of scheduling Blob stream reads for every stream. The supplied PDF has 1,613 streams. Decoded-byte limits, corrupt-stream rejection, and cleanup remain mandatory.
- Cache independent page inspection only within one compression operation, keyed by SHA-256 of exact bytes plus parser limits. Return isolated report copies; retain no document bytes or parser instances. Mutated bytes, different limits, another operation, and cancellation cannot reuse the result. Structural inspection, lossless graph fingerprints, independent output parsing, exact text verification, and receipt checks remain in force.
- Use lossless compression level 6 instead of 9. This changes CPU/size tradeoffs, not image quality. On this input output increases by 35,796 bytes relative to level 9 and still saves 927,507 bytes (4.29%).
- Show distinct source-preservation inspection, optimization, and output-preservation verification stages.
- Enforce the two-minute operation deadline on worker messages and tab visibility restoration as well as the timer. A delayed timer cannot permit an expired result. This is hardening, not a confirmed explanation for the phone report.

## Local evidence

- Optimizer-only, unstaged input: level 9 = 3,550 ms; level 6 = 2,526 ms. These are not full-workflow or phone times.
- File-session instrumented workflow at level 6: before direct stream feeding 56,521 ms; after direct stream feeding 37,534 ms. Inspection separate: 5,591 / 4,261 ms. Both preserve exact text and structure; output 20,680,436 bytes.
- Actual self-contained updated candidate with operation-scoped inspection reuse: 30,546 ms from Compress click to completed, plus 4,563 ms initial inspection. Linux Chromium, no CPU throttling; not a physical Nord4 measurement.
- Focused local regression: 32 passed, 1 optional native-reference test skipped. Includes damaged/truncated streams, backpressure, decoded-byte limits, cache isolation and stale worker deadline rejection.
- Self-contained candidate: all modes, downloaded bytes/hash, accessibility, cancellation/reset, narrow reflow, and zero remote requests passed.

Private PDF bytes and digest-bearing receipts remain outside Git. Final CI and matched candidate comparison are recorded below when completed. Manual OnePlus retest remains required before freezing or launch.
