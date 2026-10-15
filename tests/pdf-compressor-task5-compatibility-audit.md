# PDF Compressor — Task 5: Valid-PDF Compatibility

Status: **Task 5 implementation and compatibility regressions underway; not manually accepted**. Based on the accepted Task 4 branch (`713bf8b054cdc86b932a0bc0bf68a431ff3996cc`). This document authorizes **no production/deployment, no merge, no freeze and no Task 6 changes**.

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

## Task 5 implemented/verified checkpoint — 15 October 2026

- RGB/gray JPEG APP1 EXIF and APP13 Photoshop metadata use a **preserve-only** inspection route. Malformed, unknown or inconsistent markers still reject.
- CMYK/YCCK Adobe APP14 legacy metadata now uses the same **signature validation** for APP1/APP13 when preserved; an EXIF marker with correct length but false identifier is rejected.
- A **36-page mixed scan-like** fixture with shared XObjects and an SMask, and a **120-page** text/object corpus, pass the independent inspection tests. A referenced soft/explicit image mask is no longer accidentally treated as a standalone lossy RGB/gray image candidate. Input bytes remain unchanged.
- Six **synthetic signature/certification marker** cases (DocMDP and UR3 catalog permissions, visible/invisible widget fields, isolated ByteRange and orphan /Sig) are rejected before independent page reads. These are marker-level negative fixtures, **not cryptographic signatures**; the independently generated, validated pyHanko-signed PDF remains the cryptographic negative control.
- An actual **source-built qpdf** full-pipeline test passed in lossless, balanced, strong and maximum modes on one synthetic two-page PDF with a shared RGB JPEG carrying EXIF+Photoshop markers. Each output was independently verified and the image's complete original encoded bytes were unchanged. Source size **3923 bytes**, measured output **3807 bytes** in each mode; small synthetic proof, not a general compression promise. Evidence: Actions run `38755934810`, lossless-output job.
- New synthetic valid/negative compatibility PDFs have been added to a CI artifact collection to facilitate the required OnePlus Nord4 manual check. Artifact availability and full-job results need confirmation on the final head before claiming this step passed.

## Authorized password-handling feasibility review — no implementation authorized

The current `input-inspector.mjs` loads with `ignoreEncryption:true` solely to identify `/Encrypt` and deliberately returns `encrypted-pdf`; it never authenticates or decrypts. The independent PDF.js reader has no credential-handling integration in the compressor. The reviewed `qpdf-lossless-adapter.mjs` receives only raw input bytes and runs *optimization arguments*, not a user-provided-password workflow. The presence of cryptographic capabilities inside underlying libraries is **not** proof of an approved browser decryption pipeline.

No independently verified local-only sequence currently covers password entry, wrong-password handling, permission checks, decrypted-source equivalence, bounded worker operation, zero retention of passwords, cancellation, source/output integrity, and device/browser regression. **Decision for Task 5: retain explicit encrypted-input rejection.** A separate, approved engineering design and security gate would be required before enabling authorized password support. Do not silently remove `/Encrypt` or use parser ignore-encryption as decryption.

## Remaining Task 5 acceptance gaps

1. Confirm final **12/12 CI green on the newest PR head** after fixture-artifact additions; review artifact outputs and regression logs.
2. Continue unusual valid-image/filter and large-object edge cases only with real fixtures and independent reader evidence. **Do not expand current resource caps without phone memory data.**
3. Run isolated HTML build and synthetic complex fixtures on the available OnePlus Nord4, then rerun the original **15.91 MB / approximately 68-page** reference in Balanced, Strong, Maximum and Lossless modes. Confirm content, text, pages, masks, download and honest result labels. Historical sub-60-second benchmark is not new measurement.
4. Obtain explicit user manual acceptance before Task 5 closure. Do not start later tasks or deploy/freeze.

