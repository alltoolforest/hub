# Interrupted continuation checkpoint — 2026-10-13

## Saved versus unsaved work

The saved executable checkpoint is fc169a1ae2b507b06bb9eb0530d269552cea7baa,
in draft PR #202. CI run 38406470260 passed all 12 jobs. That saved code is the
earlier checkpoint: configurable size plumbing, parser-name fix, initial
interface/content, and near-100 MB attachment probes. Its default device limits
were not yet raised.

The execution environment disconnected with `409 environment_offline` during
the final provided-document check. Two reconnection attempts failed. The newer
working-tree changes below had not been committed or pushed. Their survival has
not been verified; this document is a recovery journal, not a source-code backup
or release approval.

The user authorized continued automated work and deferred manual verification
to the end before freezing. No manual action is requested now. No production
deployment, merge, freeze, shared-vendor or frozen-tool change occurred.

## Latest local continuation

- Standard and known-capability mobile input budgets changed to 100,000,000
  bytes, 2,000,000 drawing operations, 2,000,000 invariant entries, 512 MB
  cumulative decoded-resource budget and 32 MP total image budget. Per image
  remains 8 MP. Unknown-memory mobile retains 12 MiB/12 MP and low-memory
  retains 8 MiB/8 MP, with 200,000 operators and the earlier invariant budgets.
- Session retains an immutable File for retry, independently hashes source in
  the main thread, and enables File-input worker transport explicitly.
  Inspection/compression workers read File bytes locally. Existing byte-only
  worker APIs remain compatible. Receipt binding, generation checks and cleanup
  were retained and tested.
- Removed redundant full-input clones before the pinned read-only parser and
  independent readers that already clone their transferable data. Removed
  duplicate serialization Uint8Arrays. Private restoration graphs share
  parser-owned image bytes read-only; provider/verifier defensive boundaries
  remain. A test proves changing parsed stream payloads cannot mutate input.
- Added scalar guards: names <=4096 encoded bytes, literal strings roughly
  <=1 MB, hex strings roughly <=2 MB encoded, aggregate scalar strings <=32 MB.
- Added stream/predictor preflight before independent decoding: decoded streams
  <=32,000,000 bytes and cumulative profile budget; predictor row allocation
  bounded. General Flate/ASCII decoding uses existing bounded helpers.
- The isolated parser fork additionally bounds buffer capacity to 32 MiB,
  aggregate parsed object/xref-stream expansion to 128,000,000 bytes per context,
  and object-stream counts to 50,000 before offset-array allocation. Provenance
  contains exact source replacement recipes and hashes. Shared parser unchanged.
- JPEG header checks scan through entropy to reject DNL height redefinitions
  and duplicate frames before decoder allocation, validate sampling factors,
  bound coefficient overhead, and preserve images with post-scan metadata.
- Integrated offline candidate host mounts the Task 11 interface, applies a
  restrictive local-only CSP, embeds the verified runtime/fonts/licenses and
  includes prepared tool-level explanatory HTML. Result explicitly shows the
  mode actually used even if the next selected mode changes.
- Candidate browser QA checks actual downloaded bytes against the receipt,
  initial/completed/error WCAG states, cancellation/reset, narrow reflow and
  no remote requests. New large-scan and managed-worker-memory scripts added.

## Verified local evidence before disconnection

57 affected unit tests passed, no skips. These include parser provenance,
source immutability, decoded expansion, predictor rows, scalar budgets,
object-stream count/aggregate guards, JPEG DNL/sampling preflight, final
integrity, File ownership, receipts, cancellation and security.

Near-100 MB protected attachments passed all modes; high-entropy resources
returned the exact original with zero savings. Four 8 MP scan pages (96 MB)
passed Balanced/Strong/Lossless. A mixed 96 MB version with native text passed
Strong and exact text/placement verification. Generic evidence is in local
compressor docs; user source/results remain outside Git.

Managed-worker backing-storage samples varied from about 873 MB before copy
work to about 688 MB in a later hardened run. They are sampled CDP counters,
not full physical RAM or a certified percentage improvement. Fixture/main/native/
GPU memory and some transient/unresponsive targets are excluded. CPU utilization
is unavailable; wall time and heartbeat were measured.

The integrated offline candidate passed all-mode actual download/hash checks,
cancellation/reset, 320px layout, initial/completed/error axe WCAG checks and
no remote requests before the final JPEG header changes. It must be rebuilt
and checked after recovery. The supplied complex digital document passed an
earlier experimental full-integrity run; its final integrated rerun was
interrupted before a result and must not be claimed successful.

## Recovery sequence

1. Reconnect and inspect the existing working tree first; do not redo completed
   Tasks 1-9 or accepted private scan-quality evidence.
2. Recover only unpublished continuation changes. Primary source modules:
   compression-session, worker-bridge, input-inspector, device-policy,
   independent-input-reader, lossless-invariants, image-output-verifier,
   image-compression, embedded-image-transform, lossless-image-dedup,
   output-integrity, qpdf-lossless-adapter, jpeg-source-decoder, scalar-budget,
   compressor-ui and the isolated parser fork/provenance.
3. Recover candidate host/browser QA, large-scan QA, managed-memory sampler,
   decoded-resource tests, existing adjusted compressor tests, builder,
   compressor workflow and continuation docs. Exclude node_modules, private
   documents/results and generated intermediate artifacts from Git.
4. Finish the interrupted provided-document check, rebuild/test the latest
   offline candidate, run directly affected regression and publish with a
   lease against the actual branch head. Run/record CI for that source commit.
5. Save the user-facing candidate only after its final source/runtime verification.
   Carry physical-device and assistive-technology checks to the final manual
   checklist at the user's requested stage. Do not deploy or freeze automatically.

Formal Tasks 10-13 completion and launch readiness remain pending. The latest
local work must be recovered and verified before an end-of-blueprint manual
handoff can be made.
