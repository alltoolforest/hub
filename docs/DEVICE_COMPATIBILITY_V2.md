# AllToolForest v2 — Device & Browser Compatibility

Research date: 2026-09-21

## Support target
AllToolForest v2 targets current mainstream browsers on:
- Windows/macOS/Linux desktop: Chrome, Edge, Firefox, Safari where available.
- Android: current Chrome.
- iPhone/iPad: current Safari and current Chromium-branded browsers subject to iOS platform behavior.

Do not claim "works on any device." Browser storage, memory, download behavior, file-picker behavior and third-party library support vary.

## Confidence by tool family

### Work — high
Resume Studio, ATS/Job Match, Cover Letter, LinkedIn Helper, Professional Writing, Freelance Rate and Timesheet use standard HTML/JS and should be low-risk on modern mobile/desktop browsers.
Invoice calculation is low-risk; Print/Save PDF depends on the browser/system print UI and must be device-tested.

### Calculators — high
All calculators use standard HTML/JS without external runtime libraries. Static formula review completed. Scientific invalid-expression handling, Age/Date month-end logic and extreme negative-return guards were fixed during QA.

### Images — medium/high
Canvas/File/Blob-based processing is broadly supported. A createImageBitmap fallback to HTML Image decoding was added for better browser compatibility.
Risks:
- Large images can exceed mobile memory/canvas limits.
- Browser WebP export depends on browser encoder support.
- HEIC/HEIF relies on heic2any and may not preserve metadata; unusual HEIC containers require real-device tests.
- Background removal downloads a browser model/runtime and can be memory/CPU intensive. Treat mobile support as conditional until tested with representative phones.
- Download behavior can differ by browser; generated files may open/share instead of saving exactly as desktop does.

### Documents — medium/high
pdf-lib is designed for browser JavaScript. PDF.js is browser-oriented. File/Blob APIs are broadly supported.
Risks:
- Large PDFs and high-resolution page rendering can exhaust mobile memory.
- OCR is CPU/memory intensive and depends on Tesseract worker/language assets.
- PDF annotations on rotated pages need visual runtime QA.
- DOCX conversion is approximate, not Word-layout fidelity.
- XLSX/CSV parsing works in browsers but large sheets need mobile memory testing.
- Mammoth-generated DOCX HTML is now sanitized before insertion into the DOM.

## Dependency notes
- pdf-lib 1.17.1: browser-capable pure JavaScript.
- PDF.js 3.11.174: browser PDF rendering; worker loaded externally.
- Tesseract.js 5: browser OCR using worker/assets; major version URL should be exactly pinned/self-hosted for production.
- Mammoth 1.8.0: browser DOCX conversion; output must be treated as untrusted HTML (sanitizer added).
- docx 8.5.0: browser document generation; current code uses Packer.toBlob rather than Node-only toBuffer.
- SheetJS/xlsx 0.18.5: browser spreadsheet parsing/export; upstream documents broad browser testing.
- PapaParse 5.4.1: supports modern browsers and worker/chunk workflows.
- heic2any 0.0.4: browser HEIC/HEIF conversion; known metadata and multi-image limitations.
- @imgly/background-removal 1.7.0: browser-side model; performance/device support must be empirically tested.

## Required physical/runtime matrix before release
1. Windows 11: current Chrome, Edge, Firefox.
2. macOS: current Safari + Chrome.
3. Android: current Chrome on a mid-range phone, not only flagship hardware.
4. iPhone: current Safari.
5. iPad: Safari, including portrait/landscape.
6. Narrow viewport (~320–360 CSS px) and tablet viewport.
7. Keyboard-only desktop spot test.
8. Slow-network test for CDN/model-dependent tools.

For every file tool test:
- small valid file
- representative real-world file
- large file
- corrupt/unsupported file
- cancel file picker
- repeat processing without refresh
- download/open/share result
- rotate device while a file is loaded (mobile)

## Release language
Use: "Designed for modern desktop and mobile browsers."
Do not use: "Works on every device" or "Guaranteed on all browsers."
