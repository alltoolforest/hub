# PDF Compressor — Task 5: Valid-PDF Compatibility

Status: **Task 5 started — compatibility audit and test plan only**. Based on the accepted Task 4 branch (`713bf8b054cdc86b932a0bc0bf68a431ff3996cc`). This document authorizes **no production/deployment, no merge, no freeze and no Task 6 changes**.

## Approved intent
Improve attempts on complex **valid** PDFs, without arbitrarily rejecting unusual encoding, large page or object counts, or embedded image complexity. Preserve PDF semantics, user content, selectable text, page count/geometry, colors, masks/transparency, shared resources, integrity receipts and safe downloads. Where technically and legally authorized, evaluate user-provided password support. **Signed/certified PDFs must never be silently recompressed, since signature validity can be destroyed.** Preserve fail-closed handling for corruption, resource exhaustion, unsafe active content, security restrictions and unverified outputs.

## Current implementation observations, not proposed new limits

- `input-inspector.mjs` defaults to **100,000,000 input bytes, 500 pages, 50,000 objects and 1,000 embedded images** and separately limits decoded resources. These are safety/resource budgets, not proof that a valid larger PDF is corrupt.
- `PDFDocument.load(...ignoreEncryption:true)` is used *only to detect encryption*; `encrypted-pdf` is currently rejected before content processing. Do not bypass by ignoring protection.
- Signature detection includes catalog `Perms`, `/Sig` and `ByteRange` markers. Current behavior blocks signed PDFs, which must remain unless separately approved signature-safe workflow exists.
- JPEG preflight intentionally preserves metadata-complex images rather than blindly recoloring them. Unknown codecs/chains need preserve-or-verified-replacement handling; never invent pixels or strip resources to achieve a target.
- Task 4 brought bounded LZW, RunLength, ASCII85, ASCIIHex and chunk-fed Flate decoding. Keep these budgets and memory safeguards.

## Task 5 scope and ordered acceptance gates

1. **Compatibility corpus:** test normal digital, image-heavy scans, text-heavy, mixed, high-resolution, many page/object/XObject, shared image references, unusual valid JPEG/CMYK/YCCK metadata, LZW/RunLength/ASCII, transparency/masks and unusual filters. Include normal 15.91 MB / 68-page reference PDF as a no-regression control. Record classification, time, memory/resource result and detailed error code.
2. **Reject-versus-preserve audit:** distinguish *valid but not transformable* elements from malformed or unsafe data. Unsupported images may remain byte-identical and other eligible objects can still compress, only if the complete document remains independently verifiable. Do not automatically loosen resource budgets or weaken security/error reporting.
3. **Scalability:** inspect valid high-page-count and high-object-count PDFs under realistic device budgets, reusing bounded/streamed parsing. Any limit changes require quantified mobile memory evidence, cancellation tests, and unchanged output integrity. The nominal 100 MB upper cap is not a guarantee for every structure/device.
4. **Authorized password path (conditional):** evaluate parser/decrypter availability, user-supplied password UX, local-only secret handling, and legal permission. Do not implement cryptographic bypass, persist passwords, or remove restrictions silently. If no vetted decryption pipeline exists, keep clear unsupported status and report as a dependency.
5. **Signed/certified PDFs:** retain non-destructive rejection/notice; test visible and invisible signature dictionaries, certification permissions and `ByteRange` combinations. Never claim a modified signed PDF retains its signature.
6. **Integrity, accessibility, security and performance:** for each accepted PDF, verify source/output page dimensions and order, extracted text, resource/color/alpha relationships, independent document inspection and truthful file-size result; download/open success on modern Chromium/Firefox/WebKit and Android. Abort/resource failures remain fail-closed.
7. **Release gate:** focused tests → full 12 CI jobs → isolated offline Android smoke with reference and new complex fixtures → user visual/integrity approval → Task 5 acceptance. No merge/deploy/freeze before the broader approved release sequence.

## Known pending decisions
- Whether a fully local authorized encrypted-PDF workflow can be implemented safely with the actual available parser(s). This is an investigation, **not a promise of support**.
- Which higher page/object/image limits can be supported reliably on lower-memory mobile hardware.
- Which rare image formats can remain safely unchanged inside verified output rather than trigger entire-document rejection.

Only the plan/audit is committed at this checkpoint; no compatibility implementation has yet been asserted as complete.
