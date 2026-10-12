# AllToolForest — PDF Compressor Task 5 checkpoint

**Status: PARTIAL. Not production-ready, do not merge or deploy.**

## Scoped requirement
Task 5 is the embedded image compression path. Preserve selectable text, OCR, page layout, rotation, images, masks/transparency, profiles, and shared-resource relationships while achieving measured size reductions where possible. Reject unsupported cases rather than flattening entire pages. No changes to unrelated tools, prior blueprinted tasks, or production files.

## Implemented
- Isolated `image-candidate.mjs` module, without production imports, takes a bounded, predecoded RGBA buffer and emits a JPEG *candidate* via an injected encoder.
- Delegates image eligibility to preexisting Task 3 policy; refuses transparency, unknown/unsupported types, missing size savings, invalid JPEG framing, malformed input or cancelled work.
- Candidate output explicitly requires independent PDF-resource verification. No PDF writer is provided and no PDF is rewritten.
- Unit-level regression scenarios and an isolated CI workflow.

## Not implemented / blockers
1. No vetted JPEG encoder is integrated; test encoder is a synthetic stub and **not proof of valid decodable JPEG payload**. SOI/EOI bytes are insufficient validation for production.
2. No PDF XObject replacement: shared references, SMask/Mask, ICCBased/Indexed/DeviceCMYK, Decode/DecodeParms and genuine transparency require preservation tests.
3. No independent rendered before/after image checks, textual OCR extraction, color fidelity metrics, real photo/scan tests or actual compressed downloadable PDFs.
4. Task 4 browser WASM and structural checker were not approved/completed. Cannot safely output a PDF without those gates.
5. CI execution and actual device tests are not yet confirmed. Mobile memory, progress/cancellation end-to-end and performance remain unverified.

## Safety
No client uploads, external network fetch, production deployment, common assets or frozen tools changed. Preserve original when there is no measured image stream benefit. **Never claim overall PDF savings based on image stream savings.**

## Remaining roadmap
Finish Task 5 acceptance criteria and unresolved Task 3/4 dependencies in separately approved scopes. Tasks 6–13 remain untouched. Stop here.
