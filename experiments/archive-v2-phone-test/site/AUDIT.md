# Enhancer final regression and bug audit — 2026-10-15

Scope: isolated archive V2 shadow-color candidate. The user accepted its photographic result; no further quality tuning in this audit. Main, PR171, other tools and deblur were not modified.

## Fixed defects

1. Preview/download object URLs were revoked on pagehide but remained in application state, breaking reuse after back-forward restoration. Pagehide now clears the result, URLs and preview state; the selected source can be processed again.
2. The timeout covered worker processing only. A stalled input decode or final PNG validation could keep the UI busy. Each async stage now has a two-minute watchdog and late results are discarded/closed after cancellation or timeout.
3. Worker workspace release now also runs in finally so failure paths explicitly release retained numeric planes. Per-job worker termination already limits retention.

The candidate numeric enhancement core is byte-identical to the manually accepted test3 build. Original archive and previous safety core remain unchanged and selectable.

## Completed checks

- Attached AllToolForest-V2-revised.png passed PNG verification: 1102 x 1470 RGBA, matching earlier original dimensions. No upscaling in this test page.
- 10 Node-mocked adapter cases passed: cancellation/timeout/navigation during decode, cancellation/timeout during output validation, successful download followed by pagehide and rerun, worker failure, wrong output dimensions, empty blob, output decode failure. These test handler logic, not a real browser.
- 20 numeric boundary cases passed: 1x1, 1x131, 131x1, 3x3, 65x129, each with black, white, colored and transparent data. Whole/17-row agreement; black/white and transparent identity; finite plan values.
- 12MP numeric stress case passed: 4000x3000, 48,000,000 output bytes, opaque alpha retained, nonblank output; 9.434 seconds in this desktop Node run. Not a mobile speed measurement or a browser-memory guarantee.
- Existing regression suites passed: edge overshoot bounds; all-scale sharpness-off; alpha/hidden RGB handling; opaque and transparent strip consistency; source immutability; modules-off/graphics identity; portrait dependency; two supplied real photographs; shadow-guard-off compatibility; synthetic shadow/texture checks.
- JS syntax checks passed. Static source review: filenames/status use textContent, static worker/module paths, no image-upload network calls or added external dependencies.

## Release decision: NOT FROZEN

User visual acceptance is recorded, and the current automated regression set passes after fixes. Full release acceptance remains incomplete:

- Actual Android/iOS browser testing of the updated lifecycle fixes, PNG export, cancellation/retry, navigation/back, alpha PNG and large supported images. Browser-control skill is unavailable; Sites managed-environment instructions prohibit an improvised browser path. Numeric/mock checks cannot replace this.
- The deployed test page is limited to 12MP. The blueprint's 32MP supported-device target is not implemented/validated in this page. No silent increase of that limit during final audit.
- Exact face-region detection, broad held-out quality preference and comprehensive pixel-corruption detection remain unqualified. Native-size decode checks catch malformed exports/dimension changes, not all plausible but incorrect pixels. The uploaded portrait is visual acceptance of one result, not evidence of every photo category.
- Deployment is still the isolated private test site; main production integration and its production audit have not occurred.

Manual next check: choose V2 shadow color trial, upload the same original, download, cancel/rerun, leave and return to the page, rerun, then test a transparent PNG and a larger photo on the phone. Record device/browser and diagnostics. Do not start deblur or label this a full blueprint freeze until remaining acceptance scope is resolved.
