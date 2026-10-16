# Large-image experiment — 2026-10-15

Base: main e2bf00e6e4794d24bca74717d8e162943589d325. Main not modified.

## Implemented
- Removed arbitrary 12MP/50MiB rejection. Header-based memory advice allows original-size override.
- Files decoded in worker (except existing HEIC helper); original numeric enhancement core unchanged.
- Strip PNG encoding removes full-resolution output canvas where CompressionStream exists. Small comparison previews avoid full output re-decoding.
- Native-size failure offers explicit-consent smaller copies at up to 4MP, 1MP, 0.25MP; no silent resizing. Cancel/file-change/pagehide invalidate stale results.
- Local TIFF fallback (UTIF 3.1.0/pako 1.0.11), orientation handling; supported camera RAW embedded JPEG previews require separate consent. No full RAW development.

## Validation
PASS: mocked UI consent/native override/100MiB file/no size cutoff, progressive retries, cancellation, timeout, stale results, invalid output rejection.
PASS: PNG encoder 12000x8500 (102MP), independent inflate/unfilter checks every channel including alpha. Highly compressible synthetic fixture: 471320 bytes, measured Node encoding peak RSS about 98MiB. This is NOT real-photo or phone end-to-end evidence.
PASS: four TIFF compression fixtures (raw, LZW, Adobe deflate, PackBits), exact RGB/alpha pixels; JPEG EXIF rotation dimensions; reduction geometry.
PASS: photo/wavelet/portrait numeric engine files byte-identical to base.
Run using Node 24: node tests/large-photo-consent.mjs; node tests/format-decode.mjs; node tests/png-strip.mjs from project root.

## Outstanding / release gates
- Full bounded-memory decoding is NOT implemented. Native browser bitmap decode can allocate full source; HEIC and UTIF allocate full rasters. Smaller retries may therefore still fail for huge inputs.
- PNG encoded Blob parts remain in memory; browsers without CompressionStream use full output canvas. Not an unlimited-memory solution.
- 102MP real JPEG/HEIC/TIFF end-to-end and Android/iOS browser checks remain pending. Original user's 8.19MB file is unavailable; attached copy is resized.
- No universal RAW, BigTIFF or unsupported native-format guarantee. Corrupt/unsupported inputs cannot always yield even a reduced image.
- PNG envelope verification checks header/end, not every exported pixel at runtime. Encoder independently tested with synthetic roundtrip.
- New decode/export integration requires real-browser regression (orientation, alpha, color, preview, cancellation, large allocation failure). No browser QA tool available in this environment.
- Further engineering needed: truly incremental codecs (including downsampled JPEG decode), disk-backed encoded output where available, codec-specific format validation and resource budgets, broad device corpus.

Do not promote to main or claim complete 102MP support until these gates pass.

## Continuation — 2026-10-16
Static source audit found and corrected:
- RAW embedded JPEG resizing incorrectly reused RAW IFD dimensions, potentially stretching a differently proportioned preview. The preview now uses its own JPEG header and the standard reduced decoder path.
- Reduced RAW-preview exports bypassed the selected megapixel validation. All reduced exports now receive that validation.
- Intermediate bitmaps were not closed if a second resize or TIFF orientation canvas allocation failed. Cleanup now covers those failure paths.
These follow-up fixes have NOT been executed or browser-tested: the execution environment failed to initialize. Previous PASS results above describe the earlier checkpoint, not these changes.
Remaining validation: differently proportioned RAW/JPEG preview fixtures; reduced preview area limit; failed resize/canvas allocation cleanup; existing consent suite and real-browser integration. Private test Site remains unpublished (version 0). Main remains unchanged.

## Restored execution and integration evidence — 2026-10-16
Execution restored. PASS: decoder-recovery.mjs checks RAW preview geometry, selected reduced area, explicit preview consent and failed-resize bitmap cleanup with mocked APIs. Existing consent and TIFF/JPEG metadata suites pass against latest fixes. Static module/worker paths and JS syntax checks pass.

PASS: native-canvas worker integration at 12000 x 8500 = 102MP. The fixture was an enlarged supplied portrait, not a real native 102MP camera file. Decode, unchanged numeric enhancement, strip PNG export and independent full-image PNG decode completed. Input 5768390 bytes; output 75340112 bytes; elapsed 149 seconds; peak observed process RSS 1095 MiB. Node/native canvas is not a browser, and its close shim does not model browser bitmap release. This memory figure is harness evidence, not a phone estimate or browser guarantee.

PASS: 1152 x 1536 portrait candidate output pixels exactly match the accepted main worker output after independent PNG decoding. Photo, wavelet and portrait numeric modules remain byte-identical. This demonstrates pipeline parity for this fixture, not broad visual quality certification.

Added reproducible harnesses tests/decoder-recovery.mjs and tests/worker-native-stress.mjs (the latter requires sharp and @napi-rs/canvas in CODEX_PRIMARY_RUNTIME_NODE_MODULES, plus the photo fixture path as third argument). Reports saved as tests/worker-stress-102.json and tests/worker-stress-2.json. User photograph is not committed.

Still outstanding: browser/device validation and truly bounded source decoding. The test page is for manual evaluation, not a production readiness or universal 102MP support claim. Production main remains untouched.

## Compatibility audit continuation — 2026-10-16
- User reported successful phone processing of the previously rejected camera photo. Supplied output PNG fully decoded: 3072x4096 (12.582912MP), opaque RGBA. Attached input copy is 1152x1536, so native source/output equality cannot be verified from these attachments. No inference of 102MP phone support.
- PASS 24MP (6000x4000) and 48MP (8000x6000) worker stress: original-size enhancement, streamed PNG and independent full PNG decode. 24MP: 22s, observed RSS 465MiB; 48MP: 54s, 561MiB. Both use enlarged portrait fixtures in a Node native-canvas harness, not browser/device tests. Earlier 102MP test retained; not repeated.
- PASS alpha-worker.mjs: zero/partial/opaque alpha across strip boundaries, all alpha exact; full RGBA equals accepted main output (max delta 0).
- PASS tiff-orientation.mjs: all eight TIFF orientation transforms/dimensions using native canvas and fixture decoder. Actual TIFF compression was covered by the earlier format tests; this is not a real-browser decoder integration test.
- Fixed HEIC native decode timeout ownership: late-resolving bitmaps are now closed. PASS heic-timeout-cleanup.mjs: late cleanup, successful ownership, rejection and timer cleanup. No numeric quality parameters or decoder dependency versions changed.
- Remaining release blockers: real browser integration and real HEIC/HEIF corpus; native 48/102MP camera files on mobile; genuinely bounded source decoding / output storage. The HEIC fallback still runs on the UI thread and cannot be forcibly cancelled, although stale results are suppressed. Device termination from memory pressure cannot always be caught to offer a reduced copy.
- Do not promote or freeze on the strength of these harness tests alone. Main and other tools remain unchanged.
