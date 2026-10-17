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
| B. Existing pdf-lib in-place save | Already shipped | 9/9 synthetic structures preserved | No automatic image downsample; 0% measured savings | 525 KB existing JS, MIT upstream | Retain as preservation/no-op fallback, not primary compressor |
| C. qpdf-family native + browser-WASM | Native CLI and browser ESM/WASM synthetic trials passed | Native 9/9 + browser 36/36 measured structural profiles preserved | Flate stream compression: ~19% size reduction on synthetic raster, not scan downsampling | Apache-2.0 upstream; old community build 1.76 MB unpacked, security/maintenance approval pending | **Selected preferred structural engine family**, conditional on Task 3/4/7/9/10 gates |
| D. MuPDF.js WebAssembly | Browser and Node APIs supported by publisher | Potentially broad document support, but independent preservation study needed | Specialized image operations possible; exact requirements unverified | AGPL-3.0-or-later or paid commercial license; substantial WASM runtime | **Do not select** for distribution without licensing decision and measured benefit |
| E. Ghostscript/pdfwrite | Native reference; browser deployment requires separate WASM integration | May change, flatten or rewrite complex structures; loss must be tested | Strong image reprocessing possible | AGPL/commercial licensing and potential functional loss | **Not selected** for privacy-first static-site initial launch |
| F. Browser Canvas / OffscreenCanvas + Worker + selective resource processing | Native JPEG/PNG (WebP conditional), no service | **Not itself PDF-aware**; only encode an image independently | Real JPEG/WebP re-encoding is feasible; safe PDF resource replacement not yet proven | No new library for codecs, but possible main-thread/image memory spikes | **Select provisionally as isolated image codec path**, not a full PDF writer |

Official source references, reviewed October 2026:
- qpdf: https://qpdf.readthedocs.io/en/stable/cli.html and https://github.com/qpdf/qpdf (Apache-2.0).
- pdf-lib: https://github.com/Hopding/pdf-lib (MIT).
- MuPDF.js: https://github.com/ArtifexSoftware/mupdf.js (AGPL/commercial).
- Ghostscript: https://ghostscript.com/faq/ (AGPL/commercial).
- Community qpdf WASM packaging: https://github.com/neslinesli93/qpdf-wasm and https://github.com/sharevb/qpdf-wasm-esm (not certified or shipped).

## Selected design: qpdf-family browser-WASM structural optimizer plus selective local image codecs (conditional)

**Core document layer:** Select a **qpdf-family browser-WASM structural optimizer**, with independent structural inspection, preservation-first export checks and an unchanged-original fallback if savings are absent. A temporary pinned community ESM/WASM build passed synthetic feasibility; it is **NOT an approved production binary**. Task 4 must select or build a maintainable, version-pinned, license/security-reviewed qpdf-WASM distribution before any actual integration. The existing pdf-lib in-place pathway remains a structural preservation reference and possible safe no-op fallback, but it achieved 0% savings. Never substitute page-copy reconstruction.

**Image processing layer:** Use browser-local JPEG/Flate-compatible encoding in isolated workers where supported, and only selectively replace PDF image resources after Task 5 validates masks, transparency, color profiles, shared references and OCR/text preservation. WebP may be useful for temporary previews but is **not a standard PDF-embedded image codec**. No such resource transformation was implemented in Task 2; do not flatten entire PDF pages.

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

## Measured feasibility results — GitHub Actions on 2026-10-12

**Benchmark provenance:** CI run [38266049932](https://github.com/alltoolforest/hub/actions/runs/38266049932); Node v22.23.3, Ubuntu Linux x64, qpdf CLI **11.9.0**. Tested nine Task 1 **synthetic** well-formed PDFs, one timed trial per reference. Every output was reopened with the vendored pdf-lib; the comparison profile checked pages, geometry, metadata, form fields/values, outlines, attachments, tagging and the synthetic signature permission marker.

| Reference variant | Sample PDFs preserving all measured profile fields | Average byte-size change vs source | Representative scanned-like and image-heavy results |
| --- | ---: | ---: | --- |
| Existing page-copy rebuild | **0/9** | **−8.49%** (misleading due to field loss) | Approximately 0% change; metadata still lost |
| Existing pdf-lib, in-place save with object streams | **9/9** | **0.00%** | 0% change — safe *synthetic baseline*, NOT compression |
| Existing pdf-lib, in-place classic serialization | **9/9** | **+46.21%** | Larger files on most document types; reject as default |
| Native qpdf CLI (object streams, flate recompression level 9) | **9/9** | **−4.44%** (not guaranteed) | Scanned-like **−19.10%**, image-heavy **−19.34%**, mixed **−18.81%**; some text/bookmark PDFs became larger |

The native qpdf image-heavy benchmark took roughly **0.65 s** on a CI runner versus a few milliseconds for in-place pdf-lib serialization; this is **not** directly comparable computational cost because subprocess startup and aggressive flate recompression differ. The qpdf CLI proof does **not** constitute an approved JavaScript/WASM implementation. It optimizes Flate streams on synthetic generated raster inputs and **does not demonstrate downsampling of genuine scans**.

**Browser codec and off-thread probe:** CI run [38265911380](https://github.com/alltoolforest/hub/actions/runs/38265911380), Chromium desktop + 360 px mobile viewport, Firefox desktop, WebKit 390 px mobile viewport. **4/4** supported minimal WASM instantiation, Blob Workers, worker WASM, PNG/JPEG encoding and decoding, and OffscreenCanvas in worker. All four also encoded WebP in the tested environment, **but WebP is not a standard PDF embedded-image format and is not a directly selectable PDF output codec**. A synthetic 640 × 900 px page-like raster required **2,304,000 bytes** before encoding; JPEG was actually **larger than PNG** for this mostly text-line synthetic input in all four browsers. This proves why the future pipeline must choose transformations based on content and real measured output size.

**Performance caveat:** CI WebKit took roughly 255 ms for PNG and 161 ms for JPEG on that test raster, compared with approximately 16 ms/11 ms on Chromium desktop in the same infrastructure. CI device emulation has desktop-class memory and is **not** physical iOS/Android profiling. Scaling decoded images to 8 MP would use at least 32 MB for a single RGBA surface before copies and PDF object buffers. All future memory/cancellation limits remain Task 10 work.

**Package metadata (unpacked published npm size, not true downloaded bytes or runtime heap):**
- Existing vendored pdf-lib JS asset: **525,099 bytes**.
- `@neslinesli93/qpdf-wasm@0.3.0`: **1,381,642 bytes** (wrapper ISC; upstream qpdf Apache-2.0).
- `qpdf-wasm-esm-embedded@1.1.1`: **1,763,814 bytes** (Apache-2.0, older community build).
- `mupdf@1.28.1`: **14,324,000 bytes** (AGPL-3.0-or-later / commercial).

**Security/licensing dependency:** No additional package was placed in repository production dependencies. Community qpdf-WASM packages need maintenance, supply-chain, version and browser compatibility assessment; MuPDF/Ghostscript cannot be selected without determining a legally compatible AGPL or commercial licensing approach.

**Full browser qpdf-WASM candidate trial:** [CI run 38267216185](https://github.com/alltoolforest/hub/actions/runs/38267216185) installed `qpdf-wasm-esm-embedded@1.1.1` in the **temporary CI environment only**, then imported it from the local test server. In Chromium desktop, Chromium mobile viewport, Firefox desktop and WebKit mobile viewport, all **36/36** exports (nine valid synthetic PDF types × four browser configurations) reopened and preserved the measured page count, title/author, form field names, bookmark root, associated files, tag root, MarkInfo and synthetic signature marker. All four produced **19.10% smaller** scanned-like PDFs, **19.34% smaller** image-heavy and **18.81% smaller** mixed PDFs; some other fixtures grew by **5–9%**. This is genuine browser-WASM *synthetic structural feasibility*, not proof of real-world signature validity, PDF/A conformance, text/OCR equivalence, image downsampling, physical-device limits or safe deployment of this older package.

**Feasibility decision:** **Task 2 PASS (conditional architecture approval only).** A browser-local qpdf-family optimizer demonstrably produced a smaller synthetic scanned document while preserving the measured structure fingerprints across four browser environments. The exact third-party WASM artifact remains unapproved for production, and PDF image downsampling, output-validation infrastructure, resilient UI processing and real-world compatibility have not been implemented.

## Risks, stop conditions and downstream dependencies

1. If in-place pdf-lib loses structural content on representative PDFs or a qpdf WASM candidate cannot be licensed/supported, reject that path before it is shipped; do not force a workaround by dropping PDF features.
2. Browser raster encoding alone does **not** prove safe in-PDF image recompression; validate transparency, masks, color profiles and shared resources before approving Task 5 export.
3. Real cryptographic signature and encryption tests remain missing; the synthetic `/Perms` test proves *only* a marker persists, not signature validity.
4. Static CI desktop browser emulation does not prove Android/iOS physical performance, worker stability or memory consumption; those are explicit downstream gates.
5. Published package size/version/license metadata and synthetic startup timing are measured, but the community qpdf-WASM package is an older release and **not approved for production**. Before Task 4 integration, vet maintainers, source provenance, license notices, security updates, audited upstream qpdf version and CSP/worker compatibility. If it fails review, consider a maintained pinned WASM rebuild from upstream or stop for architecture reconsideration.
6. Structural profiles are basic indicators, not byte-perfect text/OCR or visible-fidelity proof; independent validation remains Task 7.
7. If measured results show neither preservation nor practical mobile feasibility, **STOP** for architecture review. Do not pre-build Task 3/4/5.

## Task 2 completion gate

- At least the shipped legacy negative control and an in-place preservation candidate are measured on all synthetic fixture types.
- Native qpdf 9/9 and browser qpdf-WASM 36/36 synthetic preservation benchmarks recorded, both with limitations and no production binary approval.
- Browser native codec, WASM and worker probes pass across four CI configurations, with device caveats.
- Structural losses and compression limitations compared transparently.
- A provisional architecture is selected with clearly assigned downstream feasibility gates.
- Task 1 baseline tests remain green and ONLY five Task 2 research files differ from Task 1.
- All synthetic feasibility, codec, worker, size, licensing and measured-profile checks recorded.
- **Task 2 completed in isolation; no production integration or Task 3 work started.**

**Do not start Task 3 without explicit user approval.**
