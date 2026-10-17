# AllToolForest PDF Compressor — Seven-Task Continuation, Task 6
## Comprehensive Regression Test Suite — Isolated Engineering Gate

**Scope:** Task 6 of the user-approved **seven-task continuation** (Task 1 universal image-processing foundation; Task 2 aggressive controls; Task 3 recovery; Task 4 memory/performance; Task 5 valid-PDF compatibility; **Task 6 comprehensive regression testing**; Task 7 mobile/production acceptance). This is **not** Task 6 of the older 13-task Launch-Ready Blueprint.

**Base:** approved Task 5 engineering branch / PR #216. Task 5's final workflow run `38757601895` completed **12/12 success**. Per user instruction on 15 October 2026, all *manual* device/visual acceptance is deferred to the end of the complete blueprint. A task is not declared manually tested while deferred.

### Approved Task 6 checks

Test all supported compression modes on scanned, digital, image-heavy, text-heavy, mixed, high-resolution and structurally complex PDFs. Verify text preservation; page count and dimensions; image colors/readability; integrity/independent re-open; exact size and saving reports; valid download bytes; safe recovery from failure. Keep approved security, resource, privacy and cancellation controls. Do not weaken any constraint to force a pass.

### Focused test matrix

1. **Source-built independent pipeline:** eight structurally distinct synthetic PDFs—digital/text-native, scans, image-heavy, mixed, forms, bookmarks, attachments and tagged—each with **Lossless, Balanced, Strong and Maximum** (32 combinations). Exercise the real qpdf provider and a separate JPEG encoder/pixel verifier. Assert source immutability, honest size/savings, exact SHA-256-bound final receipts, independent page profiles/geometry, exact extracted text, structure, content re-open and original fallback.
2. **Actual browser worker:** 15 independent/synthetic fixture types in **Chromium, Firefox and WebKit**, all **four modes** (180 browser × PDF × mode combinations), with strict CSP/no unexpected remote traffic, page/text geometry, rendered pixel RMS, protected image/mask/OCR cases, and real output/re-open checks. The new Maximum RMS threshold is deliberately more permissive than Balanced/Strong and is a **regression tripwire, not a verified human readability rating**.
3. **Safety/recovery:** typed optimizer errors recover only with exact original bytes and a valid final integrity receipt; signed (synthetic and independently signed), encrypted and corrupt PDFs must reject before optimizing; prior source remains unmodified; pre-aborted processing must never run the optimizer.
4. **Existing adjacent 12-job baseline:** keep all prior integrity, image, independent-output, file-lifecycle, large-file, browser, performance and accessibility checks. New Task 6 job runs separately, giving 13 baseline+new jobs; do not claim a pass before full CI.

### Dependencies and limits

- Browser screenshots, Android OnePlus Nord4 fidelity/download test, 15.91 MB 68-page reference, physical memory measurement, and end-user acceptance are **deferred until end-of-blueprint**. Chromium/Firefox/WebKit simulation does not claim real-phone or iPhone coverage.
- JPEG quality/RMS checks on synthetic images cannot establish quality across every scanner/device/photo/profile. Valid unsupported image metadata must be preserved under Task 5's approved logic.
- Preserve Task 5 accepted code and frozen AllToolForest tools. No changes to `main`, deployment, Task 7 features, other tools or Image Enhancer.
- If a new test finds a regression, fix only the affected PDF Compressor behavior with an isolated, separately justified change and rerun the appropriate gates.

**Current status:** Task 6 tests and CI integration committed to isolated PR #217; automated results remain required for the Task 6 engineering-verification decision.
