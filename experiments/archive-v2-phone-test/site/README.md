# Archive V2 isolated phone test

User authorized deployment of the supplied `files (1).zip` into a testing branch on 2026-10-14. This build is isolated from AllToolForest main and Natural R9. It is not frozen or qualified for general release.

The archive's numeric core, wavelet module and worker are copied byte-exact. The missing `image-enhancer-portrait.js` dependency is taken from PR171 source commit `a672855f9c4047dafe31cd0823cfeb7de2bb04f7`, blob `58a368490eb60d06bfc23753ec475935aa10f45c`. The HTML/CSS/adapter are new test scaffolding, with browser-local upload, original/output comparison, cancellation and native PNG download. No photographs are uploaded to a server.

General photograph uses archive defaults (balanced/auto/standard). Portrait uses strict protection across the whole frame because no face detector is packaged; this still permits changes and is not an exact facial lock. The test accepts decoded images up to 12MP and files up to 50MiB, with a two-minute worker timeout. These are harness limits, not a claim of reliable 12MP behavior on every device.

Known archive issues remain visible: overshoot on synthetic edges; transparent-image strip differences; fine-sharpness off still boosts broader bands; possible texture loss; unverified reported benchmark metrics. The test wrapper checks encoded output dimensions and decode success; this does not detect subtle halos, identity changes, all-black corruption or every damaged image. Failure/cancellation does not export an output. No production acceptance or phone verification claim.

Checks: module syntax passes. Numeric smoke checks pass on the archive's 512x512 original astronaut panel: opaque strip/whole equality, source immutability, native buffer length, real portrait dependency, modules-off and graphic pass-through, exact alpha/hidden RGB, exact supplied engine/worker files. Browser OffscreenCanvas/UI flow is not executed in this environment; manual Android/iOS testing is pending.

Reproduce numeric checks with `node check-core.mjs SOURCE_RGBA_512X512 ARCHIVE_EXTRACT_DIRECTORY`. Keep private photographs outside source control. Buildless static site: publish `dist/`.

Manual checks: upload the same photographs used for R9; compare Balanced and Fidelity; inspect faces, clothing, hair, highlights and halos at native size; download PNG; cancel a running job and rerun; note phone/browser and settings for failures. Inspect transparency separately with an alpha PNG. No freeze after deployment.
