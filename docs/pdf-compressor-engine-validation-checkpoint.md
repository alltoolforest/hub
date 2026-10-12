# PDF Compressor — engine validation checkpoint

## Approved sequence
Complete Tasks 3–5 engine and image dependencies before moving to Tasks 6–9, then 10–12, then integrated release Task 13. Do not touch main, frozen tools, shared production PDF engines, or Image Enhancer work.

## Changes in this branch
- `tests/pdf-compressor-engine-browser-gate.mjs`: genuine browser-WASM structural recompression candidate, fed through isolated Task 4 lossless decision core; synthetic fixture checks against actual saved bytes, metadata, page geometry, forms and presence of structural elements. Tests only, not production.
- `.github/workflows/pdf-compressor-engine-gate.yml`: ephemeral installation of a previously researched community qpdf-WASM build, multiple desktop browser engines and earlier regression checks.
- No unapproved WASM vendor asset added, no production code touched.

## Limitations / blocking gates
1. Package `qpdf-wasm-esm-embedded@1.1.1` remains **experimental and unapproved**. GitHub CI test does not establish trusted source-to-binary provenance, security maintenance, compatibility on physical devices or CSP correctness in production.
2. Fingerprints are still **partial**: do not equate catalog key presence with genuine accessibility tag integrity, cryptographic signature validity, complete annotations, font/text or image equivalence.
3. Image XObject recompression/downsampling, transparent/masked/color-managed images, shared references and actual optical OCR are **not independently verified**. Task 5 still incomplete.
4. Tests on synthetic PDFs cannot replace real-world document corpus and visual comparisons; signed PDFs are intentionally rejected.
5. No UI/SEO/deployment work allowed until first critical safety gates pass. Existing PDF Optimizer remains unchanged.
6. CI run conclusions must be separately confirmed before marking test cases pass.

**Launch readiness: NO-GO.** This checkpoint is additional implementation/verification work only; no claim that Tasks 3–13 have passed.
