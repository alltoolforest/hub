// Organize PDF Task 5 browser integration — V2 live-route compatibility.
// The earlier Task 5 script targeted the retired .pdf-organizer-grid UI and
// explicitly expected attachment-bearing removal to succeed. V2 deliberately
// refuses that unsafe operation, so the old UI assertions no longer apply.
// Exercise the real V2 UI and verify exported PDFs through its full-browser
// regression across Chromium, Firefox and WebKit, both desktop and touch layout.
// The shared GitHub Action supplies PDF_ORGANIZER_BASE_URL and runs the HTTP
// server; the isolated V2 workflow runs the same suite with its own local host.
// The imported suite sets nonzero process.exitCode for ANY browser failure.
await import('../documents/pdf-organizer/browser.test.mjs');
