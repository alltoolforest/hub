# V2 production integration — 2026-10-15

Owner approved the shadow-color V2 output, manually verified the audit build, and authorized main deployment with simplified controls.

Default /images/enhance/ now uses one automatic non-generative pipeline: open a photo, Enhance photo, compare, download PNG. Balanced strength, auto sharpness, general content and standard protection reproduce the approved testing defaults. No algorithm selector or tuning dropdown. Existing deblur/upscale remain separate under Other image tasks; their engine source is unchanged. Enhance on those legacy screens returns to the simple canonical flow. AI runtime preload occurs only on explicitly selected legacy specialist tasks.

The four assets under assets/js/enhancer-v2 are byte-exact copies of the accepted audited candidate. JPEG/PNG/WebP use native decoding; existing HEIC decoder is reused on demand, with a bounded preview. Original dimensions remain unchanged. Visible release limit: 12MP / 50MB, not the unresolved 32MP target. Unsupported background canvas processing fails with a clear error; no silent alternate enhancer.

Predeployment checks: JS syntax, 12 mocked lifecycle/failure/HEIC scenarios, byte-exact engine/worker/wavelet/portrait copies, automatic preset contract and dependency paths. Earlier candidate regression included two real photographs, 20 boundary cases, alpha handling, strip equality and a 12MP numeric run. These are not browser/device performance guarantees. Actual rendered main-page and OS download verification remains a postdeployment manual gate.

Privacy/source review: fixed static template only, user filenames/status through textContent, local object URLs, worker cancellation/timeouts/output decode checks. No new image upload or model reconstruction. HEIC may download its existing integrity-checked decoder. CSS scoped to #enhancer-v2; no shared app/catalog/core/CSS or frozen tools changed.

Rollback: restore images/enhance/index.html and assets/js/image-enhancer-bootstrap.js from main baseline e31b2729628312ba7868dd59df88496740a284e3 (leave unrelated intervening changes intact). New V2 assets become unused. Preserve experimental branch as quality/rollback reference.

Status: deployed candidate pending production verification; NOT FROZEN. No deblur development performed. Broader corpus, 32MP qualification and comprehensive corruption/face-region gates remain as documented in the experimental audit.
