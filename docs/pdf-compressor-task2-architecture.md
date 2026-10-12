# AllToolForest PDF Compressor — Task 2 Architecture Feasibility Decision

**Source of truth:** PDF Compressor Launch-Ready Remediation Master Blueprint v1.0 — **Task 2 only**.
**Task 1 checkpoint:** `cb18a1a38e1e94a9c62adf276cd8316d14919f20`.
**Isolation:** `pdf-compressor-task2-architecture-20261012`, stacked on Task 1, not production main.
**Execution boundary:** comparative RESEARCH + architecture choice; **no new compressor, PDF object mutation feature, UI integration, dependency installation in production, or Task 3+ work**.

## Requirements from Task 2

1. Evaluate feasible PDF-aware structural optimization, embedded-image pathways, browser/WASM alternatives.
2. Compare actual size and time on the Task 1 synthetic corpus, plus document-structure preservation.
3. Evaluate browser worker/WASM/codec facilities in Chromium/Firefox/WebKit (desktop and simulated mobile).
4. Record startup/asset size, memory and licensing considerations **without claiming untested device compatibility**.
5. Select a candidate architecture, mark residual dependencies, document a stop condition if basic viability fails.

## Candidate architecture alternatives

| Candidate | Browser integration | Structure preservation | Embedded image savings | Footprint / licensing | Decision |
| --- | --- | --- | --- | --- | --- |
| A. Existing pdf-lib `copyPages` rebuild | Already shipped | **Fails** forms, attachments, bookmarks, tags, metadata | No downsample / re-encode | Existing JS dependency, MIT upstream | **Reject** as primary engine; retain as negative-control benchmark |
| B. Existing pdf-lib `PDFDocument.load` → **in-place** save | Already shipped, no new dependency | Likely stronger because document catalog is preserved; subject to file-specific verification | No automatic image downsample | No new browser payload; MIT upstream | **Select provisionally as document-preserving structural baseline**, only behind Task 3 capability checks / Task 7 validation |
| C. Native qpdf structural optimization | Native CLI; browser requires separate vetted WASM build | QPDF designed as content-preserving transformer; still independently test | Current versions optionally recompress supported images, no image resampling | Apache-2.0 upstream, WASM distribution size/maintenance yet unmeasured | **Keep conditional option** for structural backend if compatible, tested WASM is better than B |
| D. MuPDF.js WebAssembly | Browser and Node APIs supported by publisher | Potentially broad document support, but independent preservation study needed | Specialized image operations possible; exact requirements unverified | AGPL-3.0-or-later or paid commercial license; substantial WASM runtime | **Do not select** for distribution without licensing decision and measured benefit |
| E. Ghostscript/pdfwrite | Native reference; browser deployment requires separate WASM integration | May change, flatten or rewrite complex structures; loss must be tested | Strong image reprocessing possible | AGPL/commercial licensing and potential functional loss | **Not selected** for privacy-first static-site initial launch |
| F. Browser Canvas / OffscreenCanvas + Worker + selective resource processing | Native JPEG/PNG (WebP conditional), no service | **Not itself PDF-aware**; only encode an image independently | Real JPEG/WebP re-encoding is feasible; safe PDF resource replacement not yet proven | No new library for codecs, but possible main-thread/image memory spikes | **Select provisionally as isolated image codec path**, not a full PDF writer |

Official source references, reviewed October 2026:
- qpdf: https://qpdf.readthedocs.io/en/stable/cli.html and https://github.com/qpdf/qpdf (Apache-2.0).
- pdf-lib: https://github.com/Hopding/pdf-lib (MIT).
- MuPDF.js: https://github.com/ArtifexSoftware/mupdf.js (AGPL/commercial).
- Ghostscript: https://ghostscript.com/faq/ (AGPL/commercial).
- Community qpdf WASM packaging: https://github.com/neslinesli93/qpdf-wasm and https://github.com/sharevb/qpdf-wasm-esm (not certified or shipped).

## Selected design: privacy-first, preservation-first, modular hybrid (conditional)

**Core document layer (provisional):** Start from a full source PDF and preserve its object graph and document catalog, rather than reconstructing the PDF from copied pages. Existing pdf-lib in-place save is the **measured minimal-dependency candidate**; qpdf/WASM remains a comparison option, NOT a required dependency.

**Image processing layer (provisional):** Browser-local canvas codecs inside an isolated worker when supported; no page flattening. Controlled image re-encoding/downsampling will require a future PDF image resource layer with filter/color-space/mask/ICC correctness. **This is an architecture decision, not implementation.**

**Integrity gate:** If any document's structural invariants cannot be confidently preserved, stop/fail without an altered downloadable PDF. Do not silently remove bookmarks, forms, tags, links, attachments, metadata or invalidated digital signatures. Signed PDFs must be explicitly detected and rejected or have a separately authorized safe no-op policy before processing.

**Quality/performance policy:** Report factual original and output bytes; never guarantee a compression percentage; do not serve larger output as a success. When the browser lacks a required codec, leave affected images alone (or fail closed); never silently rasterize entire PDF pages. Use bounded image pixels, worker progress and cancellation in later tasks.

**Isolation:** Keep the production route and all frozen tools unchanged. Future Task 3 classification, Task 4 lossless engine, Task 5 image pipeline, Task 7 independent verification and Task 10 physical-device profiling are explicitly **not implemented** here.

## Experiment specification (Task 2 only)

Run `node tests/pdf-compressor-task2-benchmark.mjs` against all 9 valid Task 1 synthetic PDFs. This records:
- legacy page-copy, in-place pdf-lib object streams on/off, native qpdf CLI reference if installed;
- actual byte delta, elapsed milliseconds and approximate observed resident-memory delta;
- page count, page geometry, title/author/subject, form fields+values, bookmark root, attachment entries, tagging, and synthetic permissions marker;
- whether outputs re-open and which fingerprint fields differ.

Run `node tests/pdf-compressor-task2-browser.mjs` against the existing PDF Optimizer page hosted *locally*, to probe:
- Chrome desktop and mobile viewport, Firefox desktop, WebKit mobile viewport;
- WASM instantiate, Blob Worker availability and worker WASM, OffscreenCanvas presence;
- browser-native PNG/JPEG/WebP encode/decode, byte sizes and elapsed time;
- outbound network requests.
- NOTE: WebKit mobile viewport is not a physical iPhone; high-memory/low-memory devices are not yet benchmarked.

The CI output is the **evidence record** and should be attached by run URL. These experiments do not prove real-world PDF compression performance; synthetic samples and one-trial elapsed times are insufficient. Do not interpret qpdf native availability as a working qpdf-WASM candidate.

## Risks, stop conditions and downstream dependencies

1. If in-place pdf-lib loses structural content on representative PDFs or a qpdf WASM candidate cannot be licensed/supported, reject that path before it is shipped; do not force a workaround by dropping PDF features.
2. Browser raster encoding alone does **not** prove safe in-PDF image recompression; validate transparency, masks, color profiles and shared resources before approving Task 5 export.
3. Real cryptographic signature and encryption tests remain missing; the synthetic `/Perms` test proves *only* a marker persists, not signature validity.
4. Static CI desktop browser emulation does not prove Android/iOS physical performance, worker stability or memory consumption; those are explicit downstream gates.
5. WASM package size/maintenance, startup cost and legal review are unresolved for qpdf variants; no package selected for deployment.
6. Structural profiles are basic indicators, not byte-perfect text/OCR or visible-fidelity proof; independent validation remains Task 7.
7. If measured results show neither preservation nor practical mobile feasibility, **STOP** for architecture review. Do not pre-build Task 3/4/5.

## Task 2 completion gate

- At least the shipped legacy negative control and an in-place preservation candidate are measured on all synthetic fixture types.
- qpdf structural CLI benchmark recorded when available, labeled *native reference only*.
- Browser native codec, WASM and worker probes pass across four CI configurations, with device caveats.
- Structural losses and compression limitations compared transparently.
- A provisional architecture is selected with clearly assigned downstream feasibility gates.
- Task 1 baseline tests remain green and ONLY these four Task 2 research files differ from Task 1.
- CI results and benchmark figures added after execution; otherwise Task 2 remains **IN PROGRESS**.

**Do not start Task 3 without explicit user approval.**
