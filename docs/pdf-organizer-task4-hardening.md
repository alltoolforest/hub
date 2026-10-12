# Organize PDF Pages — Task 4 Hardening Notes (isolated development)

Scope: AllToolForest Remediation Blueprint V1.0, Task 4 only.
Development PR is chained after Tasks 1–3. Do not deploy or change protected tools from this workstream.

## Privacy / security observations and implementation
- Organizer uses local bundled pdf-lib for output and bundled PDF.js/worker/fonts/CMaps/WASM for thumbnail previews. Selected PDF bytes are passed via in-memory ArrayBuffer/Uint8Array; no file upload, user-authored server request or external image API is called from these organizer modules.
- The PDF.js preview invocation explicitly disables dynamic evaluation with \`isEvalSupported: false\`.
- Filename, page metadata and status messages use DOM text properties, not HTML parsing or template injection.
- The underlying PDF export never uses rasterized thumbnails. It retains the safety restrictions and output checks implemented in Task 1.
- Preview loading failures now destroy the PDF.js loading task; preview-document switches/reset release canvases, cancel pending rendering and request destruction of the previous PDF.js document.
- The preview system renders only pages near the viewport, limits outstanding render tasks, caps retained canvases, rejects invalid dimensions and limits every preview raster to 2048 pixels per side and approximately 260,000 pixels total.
- PDFs can still contain expensive fonts, images or vector content. Preview-specific limits mitigate but do not establish a universal upper bound on PDF parsing CPU or memory. Physical-device benchmarks and real-world adversarial PDFs remain required.

## Website-host configuration: verify on the *actual deployed host*
- Current \`site-config.json\` has an empty public domain and a review base path; \`robots.txt\` currently disallows all crawling, and \`sitemap.xml\` includes \`https://FINAL-DOMAIN\`. These are **review/staging** settings. They were intentionally not changed in Task 4.
- The organizer page now provides indexable static instructions, accurate product limits and privacy wording. It has meaningful title, meta description, one H1 and relevant section headings.
- A production canonical is intentionally NOT hard-coded until the actual public domain and path are verified. Add the exact absolute canonical only as part of the separately authorized public-release domain and indexing configuration.
- Verify production robots allowance and the final sitemap URL for this tool before indexing. Never apply blanket \`Disallow: /\` to a public-indexed domain.
- The repository has a \`_headers\` file with CSP / security rules. Cloudflare Pages processes \`_headers\` for static assets. **Do not assume GitHub Pages will apply those rules**; inspect actual network response headers after deployment on the chosen host. Check CSP, referrer policy, content type, frame embedding, and any hosting redirects without weakening shared policies.
- Avoid modifying shared \`_headers\`, \`robots.txt\`, \`sitemap.xml\`, \`site-config.json\`, global styling or unrelated categories in this isolated organizer PR.

## Task 4 verification boundaries
Automated module and source inspections can confirm: no organizer remote-upload API, finite preview raster bounds, canvas and worker cleanup, cached-thumbnail limits, preview failure isolation, and static HTML guidance.
They **cannot** confirm: real browser network behavior, exact HTTP response headers, physical-device memory availability, iOS/Android drag smoothness, real Lighthouse/SEO field measurements or cross-browser accessibility. Those must be measured on the final hosting environment and representative devices as part of release verification.

## Reproducible performance / privacy checks for later manual verification
1. On representative desktop, mid-range Android and iPhone browsers, open PDFs with 1, 20, 100 and the largest supported practical page counts. Include 10–30 MB scanned or image-rich examples.
2. Observe load time, preview onset, scrolling responsiveness and export time; capture device/browser version, peak memory (where supported), longest main-thread tasks, errors and cancellation time.
3. In network inspector, upload a sensitive-looking test PDF and confirm request bodies do not contain PDF bytes. Network requests should be limited to the origin for site assets and PDF.js dependencies; ordinary hosting access logs may still occur.
4. Scroll repeatedly, rotate pages and switch documents. Check that previous preview canvases and worker tasks are reclaimed and that the original PDF can still export after any thumbnail error.
5. Inspect actual HTTP response headers for organizer HTML, JS and worker files; verify against configured host protections.
6. After public-domain authorization, confirm rendered canonical points to the final public URL, robots allows the intended page, and sitemap lists that same URL. Do not change staging indexing rules prematurely.

Status: Task 4 source hardening and documentation only. No public launch, production validation, or Task 5 execution is authorized.
