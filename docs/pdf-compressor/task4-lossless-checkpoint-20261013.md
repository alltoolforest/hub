# Canonical Blueprint v1.0 — Task 4 lossless checkpoint (13 October 2026)

Task 4 implements safe lossless structural compression and exact-byte resource
sharing, not image-quality reduction. Source of truth: master-blueprint-v1.0.md.
Development branch: pdf-compressor-task4-source-build-20261013; draft PR #195.
Starting checkpoint: Task 3 PR #194, a32dd5a57664ca20834d15474fc05ecb4730fffb.

## Implemented and independently verified

- qpdf 12.4.2 WASM built from immutable upstream source revisions. Compiler,
  zlib and libjpeg source pins, actual module version, runtime hashes and CI
  artifact provenance are recorded in the isolated vendor/provenance.json.
- Build success: https://github.com/alltoolforest/hub/actions/runs/38343404044
  Both input-integrity and source-build jobs conclusively succeeded.
- No adoption of qpdf-wasm-esm-embedded@1.1.1 as a production dependency.
- Existing lossless-core contract now has a real injected source-built provider.
- Complete catalog/Info/reachable-object and detached-material graphs are
  compared, with decoded Flate/ASCII streams and encoded special-image bytes.
  Forms/values, fonts, outlines/destinations, metadata, tags, annotations and
  attachment payloads participate in content hashes; presence alone is insufficient.
- Exact-byte sharing is confined to matching simple opaque image dictionaries.
  Masks, structure ownership, profiles and custom decode dictionaries are excluded.
- Classical staging removes obsolete structural containers but retains material
  orphan objects; qpdf then preserves those objects and unused named resources.
- Actual output files are independently reopened, text/geometry checked and all
  fixture pages rendered for exact pixel comparison. Larger/equal outputs return
  unchanged originals with truthful zero savings.
- Signed/encrypted inputs are rejected before any transformation. Temporary WASM
  filesystem input/output files are removed on successful and failed calls.

## Executed verification

Local unit/contract/invariant/dedup gate: 9 tests passed, no skips/failures.
Task 3 + adjacent tests previously passed 45/45; the CI input gate also passed.
Actual source-built output gate: all 12 cases passed graph/text/render checks;
7 compressed and 5 retained the original. One timed local Linux/Node trial per
case, not phone performance. QA scans are independently generated raster pages,
not a physical-scanner corpus. Signed fixtures include a cryptographically
validated disposable signature; no user documents or key material committed.

| Input | Original bytes | Returned bytes | Saved bytes | Elapsed ms |
| --- | ---: | ---: | ---: | ---: |
| digital | 1370 | 1370 | 0 | 239 |
| scanned | 339211 | 274423 | 64788 | 486 |
| image-heavy | 708693 | 571654 | 137039 | 945 |
| mixed | 113682 | 92301 | 21381 | 223 |
| form | 2124 | 2124 | 0 | 73 |
| bookmarks | 1489 | 1489 | 0 | 66 |
| attachment | 1441 | 1441 | 0 | 49 |
| tagged | 1287 | 1287 | 0 | 66 |
| independent-text | 4108 | 2261 | 1847 | 73 |
| independent-scan-color | 303667 | 233384 | 70283 | 919 |
| independent-scan-gray | 162729 | 127506 | 35223 | 1106 |
| duplicate-image-resources | 338978 | 137681 | 201297 | 307 |

Commands:

```sh
node --test tests/pdf-compressor-task4-invariants.test.mjs tests/pdf-compressor-task4-adapter.test.mjs tests/pdf-compressor-task4-dedup.test.mjs
PDF_COMPRESSOR_QPDF_MODULE=assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs PDF_COMPRESSOR_INDEPENDENT_FIXTURES=<generated-corpus> node tests/pdf-compressor-task4-source-gate.mjs
node tests/pdf-compressor-runtime-hashes.mjs
node tests/pdf-compressor-task4-worker-browser.mjs
```

The Chromium module-worker gate passed on six document profiles with strict
self-origin/wasm CSP and no unexpected network requests. PDF.js worker handshake
messages must not be mistaken for completed app results. Updated CI additionally
runs Chromium, Firefox and WebKit; those latest conclusions must be confirmed.

## Defects found and fixed

- Local Emscripten linker crashes even on --version/trivial input: built the same
  pinned sources in isolated GitHub CI instead; no compiler approval escalation.
- Cross-compilation could not find static JPEG: explicitly pinned the archive path.
- Keeping old object-stream containers confused a scan-based independent parser:
  stage a classical PDF, remove only those containers, preserve all material
  objects and verify their full graphs. Do not relax integrity checks to pass.
- ASCII filter chains and simple-image resource sharing require semantic
  normalization rather than object numbers; supported decoded resources remain
  exact and unsupported filters are guarded conservatively.

## Limits, risk and release

Changes are confined to isolated compressor modules, vendored runtime/notices,
compressor tests, its workflow and docs. Production HTML, shared engine/routing,
all frozen tools and Image Enhancer work remain unchanged. No deployment.

Task 4 is verified locally for its documented lossless transformation scope;
complete cross-browser CI acceptance is pending the latest run. Specialized
filter/predictor variants, large/low-memory devices and real-world visual corpus
remain additional acceptance/security/performance work. Decoded-page-resource
identity does not mean identical output PDF bytes or unchanged file IDs.

Task 5 must supply real embedded-image/scanned compression next. Tasks 6–13 are
not completed by this checkpoint. Overall release: NO-GO, not frozen.
