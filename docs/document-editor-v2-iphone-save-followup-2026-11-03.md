# iPhone save follow-up — 2026-11-03

User reported that the prior download fix still failed on iPhone. Physical-device failure has not been directly reproduced here; this release fixes a remaining interaction flaw: the main export button previously regenerated the file on every tap rather than delivering the already-prepared file from a fresh gesture.

On iPhone/iPad, export now prepares the validated file without attempting an asynchronous automatic navigation. The main button becomes Save to Files when native file sharing is available, and calls navigator.share synchronously on the next tap. The prepared-file controls scroll into view and receive focus. Unsupported sharing retains explicit download/open links. Desktop automatic downloads remain. Changing content invalidates the prepared file. Both the workspace and its delivery-module URL are versioned for this release.

Scope: delivery UI and tests only; no editing engine or other tool changed.

Validation: 146 unit tests pass. Chromium 390px browser checks pass for TXT, DOCX, XLSX, CSV normal downloads and simulated iPhone delivery (native share stub captures exact exported bytes, verifies active user gesture; fallback download bytes equal shared bytes). PDF automatic and fresh-tap downloads produce identical valid PDF bytes. These are not physical Safari tests. User must confirm saving on their iPhone before freeze.
