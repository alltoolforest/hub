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
