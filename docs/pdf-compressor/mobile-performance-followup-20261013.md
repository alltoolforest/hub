# PDF Compressor mobile performance follow-up — 2026-10-13

The OnePlus Nord4 manual report reopened the performance launch gate: the supplied 21,607,943-byte digital stress PDF stayed at “Optimizing PDF structure” for more than three minutes. This is not considered launch acceptance. Frozen tools and production integration remain untouched.

## Changes

- Feed resident compressed stream bytes directly into bounded native decompression instead of scheduling Blob stream reads for every stream. The supplied PDF has 1,613 streams. Decoded-byte limits, corrupt-stream rejection, and cleanup remain mandatory.
- Cache independent page inspection only within one compression operation, keyed by SHA-256 of exact bytes plus parser limits. Return isolated report copies; retain no document bytes or parser instances. Mutated bytes, different limits, another operation, and cancellation cannot reuse the result. Structural inspection, lossless graph fingerprints, independent output parsing, exact text verification, and receipt checks remain in force.
- Retain lossless compression level 9. The bottleneck fix is stream scheduling and repeated page inspection, preserving the previous compression effort and small-file savings.
- Show distinct source-preservation inspection, optimization, and output-preservation verification stages.
- Enforce the two-minute operation deadline on worker messages and tab visibility restoration as well as the timer. A delayed timer cannot permit an expired result. This is hardening, not a confirmed explanation for the phone report.

## Intermediate local measurements (level 6 experiment)

- Optimizer-only, unstaged input: level 9 = 3,550 ms; level 6 = 2,526 ms. These are not full-workflow or phone times.
- File-session instrumented workflow at level 6: before direct stream feeding 56,521 ms; after direct stream feeding 37,534 ms. Inspection separate: 5,591 / 4,261 ms. Both preserve exact text and structure; output 20,680,436 bytes.
- Actual self-contained updated candidate with operation-scoped inspection reuse: 30,546 ms from Compress click to completed, plus 4,563 ms initial inspection. Linux Chromium, no CPU throttling; not a physical Nord4 measurement.
- Focused local regression: 32 passed, 1 optional native-reference test skipped. Includes damaged/truncated streams, backpressure, decoded-byte limits, cache isolation and stale worker deadline rejection.
- Self-contained candidate: all modes, downloaded bytes/hash, accessibility, cancellation/reset, narrow reflow, and zero remote requests passed.

Private PDF bytes and digest-bearing receipts remain outside Git. Final CI and matched candidate comparison are recorded below when completed. Manual OnePlus retest remains required before freezing or launch.

## Intermediate candidate comparison

The previous downloadable candidate completed in 66,080 ms plus 7,665 ms initial inspection. The updated candidate completed in 30,546 ms plus 4,563 ms inspection with the same local Chromium harness and private source. These are single runs, not a statistical device guarantee. A page-target CDP throttling probe also passed, but does not establish worker CPU throttling or Nord4 performance.

The final candidate retains level 9: the level 6 experiment caused the small-fixture lossless savings gate to fail, although integrity passed. Restoring level 9 preserves that regression guarantee without giving up the verification-overhead fixes.

Direct inflation feeds at most 64 KiB of compressed input per write to retain backpressure for large streams. Regression input includes 2 MiB of incompressible data to exercise multiple writes, exact decoded limits, truncated data and bad checksums.
