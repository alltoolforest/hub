# Task 5 mobile engine diagnostic

The user accepted the real-scan compressed result quality on 13 October 2026.
That records document-quality acceptance, not physical engine memory/performance.

Added a reproducible, self-contained HTML diagnostic to run the existing verified
engines on a physical device without publishing or modifying the production tool.
It embeds the pinned WASM, PDF.js software decoder, parser and standard fonts.
PDF.js parsing stays in the compression worker through its loopback worker path.
The WASM is loaded through an in-memory Blob URL rather than a remote request;
the pinned source-built binary and vendor files are unchanged.

The diagnostic exposes file selection, three independent engine tests,
cancellation, downloads, engine elapsed time and UI heartbeat gaps. File bytes
remain local; dynamic messages use textContent. Cancel terminates the worker,
invalidates loading work and suppresses download. Mode and source controls are
locked while testing. These are diagnostic controls, not Task 8/11 production
lifecycle or UX implementations. The three-mode product orchestrator is still
Task 6; this harness invokes the existing verified engines independently.

Local Chromium file-mode tests passed Lossless/Balanced/Strong on a synthetic
mixed PDF, repeated runs, correct original byte counts after transfer, cancellation,
no remote requests, and a 390px layout. The HTML output is stored separately;
only generic source/build/test/documentation files enter GitHub. No user PDFs,
outputs, names, device information or detailed private results are committed.

Reproduce:

```sh
PDF_COMPRESSOR_MOBILE_QA_OUTPUT=/absolute/scratch/mobile-test.html python tests/build-pdf-compressor-mobile-qa.py
PDF_COMPRESSOR_MOBILE_QA_OUTPUT=/absolute/scratch/mobile-test.html node tests/pdf-compressor-mobile-qa-browser.mjs
```

Browser deviceMemory is a capability hint, not measured peak process RAM.
The harness can establish physical-device completion, responsiveness, timing,
cancellation and crash observations; rigorous peak-memory profiling still needs
appropriate device instrumentation. Physical Android/iOS execution is unverified.
Task 5 remains open; Tasks 6–13 are not started under the canonical sequential gate.
No production/frozen-tool/Image Enhancer changes, deployment or freeze.
