# Independent engines — pre-deployment assessment, 2026-10-07

**Follow-up:** The quality regressions documented below were corrected in candidate df1f9a9. Its automated audits pass; see [QUALITY-CORRECTION-CHECKPOINT.md](QUALITY-CORRECTION-CHECKPOINT.md) for current results and remaining launch gates. The earlier results below are retained as audit history. No deployment has occurred.

Status: DRAFT, NOT APPROVED FOR DEPLOYMENT. Supersedes the earlier three-mode draft's automatic gentle deblur in Enhance. The deployed enhancer was based on e06c849; its main-branch JavaScript still matches blob 2c1dbaaaefc915bc329784f749d2c85c21b3d355 at the final checkpoint. The repository main branch has since advanced for other work. Base of this change: ad91869 (PR130); no changes to production, frozen tools, site navigation or other categories.

## Findings and cause

The earlier Enhance path repurposed x4 Real-ESRGAN at 1x output, sometimes automatically called NAFNet, reduced inference resolution, and repeatedly blended original pixels back. Detail-floor protection could restore source noise. The local alternative stacked blanket contrast/saturation and thresholded four-neighbor sharpening. There was no substantive photographic white balance or scene-adaptive tone correction. Compression-dominant images could return original pixels with an Enhanced message. Face detection/retention is protection, not facial restoration. Region processing consisted of edge/texture heuristics plus detected faces, not semantic hair/text/fabric recognition. Native noise/JPEG diagnosis was weakened by preview resizing.

Runtime: ONNX Runtime Web 1.30.0, WASM proxy, sequential NAFNet patches (mobile 128px core, desktop192, overlap24 and memory retries). Existing mobile64/desktop256 tile and projected-duration limits remain. These prevent long jobs but do not solve restoration quality. One WASM call cannot be interrupted by those budgets. WebGPU is intentionally not selected. Large full-size canvas allocations remain a browser/device constraint.

## Changes

- `image-enhancer.js`: separate runEnhancePipeline/runDeblurPipeline/runUpscalePipeline; truthful mode help. Enhance no longer calls SR, NAFNet, repeated fidelity blends, detail-floor reinsertion, or legacy local fallback. Deblur retains numerical/fidelity/identity guards and cannot silently fall back to enhancement. Processed does not imply proven restoration success.
- `image-enhancer-photo.js`: purpose-specific, non-generative native-pixel photographic algorithm. Native flat-region residual noise estimate; histogram tone analysis; confidence-limited near-neutral white balance; RGB bilateral cleanup; bounded gamma/percentile tone correction; separable local contrast; thresholded bounded sharpening; skin-color/edge heuristics and gamut-safe chroma balancing. No resizing, spatial warping or invented details. Text/artwork selection suppresses tone/color/spatial edits. Skin-color masks are not reliable semantic face segmentation.
- `image-enhancer-photo-worker.js`: native-resolution halo strips, bounded intermediate arrays, original dimensions/alpha, PNG export in background.
- `image-enhancer-photo-engine.js`: one worker per job, terminated on cancel/success/error; unsupported browser is a clear failure, never substituted AI/local restoration.
- Enhancer-only tests and CI updated for the changed contract; real neural checks remain on Deblur/Upscale. New numerical/paired/lifecycle/isolation tests and offline evidence runner.

The entire Upscale function is byte-identical to ad91869, retaining existing Real-ESRGAN x4v3, preparation, fidelity guards, standard enlargement fallback, dimensions and export. Existing shared worker/guard/model files are unchanged by this patch. The base PR130 contains earlier verified face-fusion weight support, but Enhance no longer invokes it.

## Evidence so far

36 local tests pass: 8 new photographic/integration-structure checks, 9 worker lifecycle cases, and 19 retained budget/fusion/deblur numerical/lifecycle cases. Syntax and diff checks pass. Frozen-file hashes unchanged. Strip output exactly matches whole-frame output with the same plan. Tests verify stronger tone recovery toward a known reference, noise reduction against a known flat reference, neutral ramp restraint, glyph/alpha preservation, malformed inputs and original Upscale code equality.

Offline natural evidence: astronaut portrait, coffee, cat fur and grass at 0.14–0.26MP, with clean / synthetic underexposure / added noise / JPEG65 variants. In the initial full-resolution run, all4 underexposure variants improve reference RGB MAE, 3/4 noise variants improve, and 0/4 JPEG variants improve. Clean changes range about1.3–7.6 RGB levels. These are diagnostic results, not phone Auto Enhance acceptance; tone changes confound simple MAE. The pre-overexposure-adjustment revision recorded these results (clean RGB MAE 2.22 / 1.28 / 7.57 / 4.19 respectively).

Two privately supplied image copies were processed locally, never published. Night portrait: visible shadow/exposure improvement, but red illumination persists and blurred facial detail is not recovered. Hazy group photo: tone/color changes; this does not establish restoration or phone-editor parity. No supplied phone Auto Enhance comparison exists. No objective identity guarantee from visual inspection.

12MP synthetic arithmetic-only run: 2162ms, host Node RSS186MiB. Excludes source decode, browser canvases, bitmap transfer and PNG encoding. Mobile timing and peak browser memory remain unverified. Per-strip intermediate floats scale with width times116 rows; source bitmap and full output canvas still scale with image area.

## Architecture choices

Browser-native processing is appropriate for basic non-generative tone/color/texture improvement and avoids unnecessary model downloads. This draft does not demonstrate the requested quality on every category. WASM might accelerate selected operations but cannot improve a deficient algorithm merely by changing runtime. ORT WebGPU can accelerate supported model graphs; model/operator parity, actual target-device memory and cross-browser fallback must be validated before enabling it. WASM multithreading also depends on cross-origin isolation.

A lightweight learned photographic transform (such as the bilateral-grid approach demonstrated by HDRNet) is worth evaluating with correct checkpoints, licensing and modern deployment compatibility; it is not integrated or claimed production-ready. Dedicated restoration models remain necessary candidates for substantial motion/defocus restoration. Previous Restormer/NAFNet research found large model/memory/parity or stability issues; repeating those prototypes or enabling an unvalidated model would not meet acceptance. A hybrid restoration service is a possible route if on-device models cannot meet quality/time limits, but introduces server costs and photo-upload/privacy requirements. No infrastructure was added and no photos were sent to a service.

Primary references reviewed: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html ; https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html ; https://github.com/google/hdrnet ; https://github.com/megvii-research/NAFNet . Runtime acceleration is not a quality claim.

## Blocking quality gaps

Enhance: phone Auto Enhance parity not demonstrated; JPEG cleanup unreliable; real texture/skin protection only heuristic; some clean images change unnecessarily; clipped highlights cannot be recovered; bad/mixed illumination is not solved by conservative white balance. Exposure improvement alone does not pass the full enhancement requirement.

Deblur: existing motion-oriented NAFNet is retained, not newly validated as motion/defocus/mixed/face-specific restoration. Generic blur score cannot choose a verified blur-specific strategy. Nonzero pixel change plus artifact guard is only a safety gate, not a success metric. Dedicated paired-ground-truth browser tests must pass, and broader real photos/strong motion/defocus/blurred portraits/high-resolution Android acceptance remain open. Large-image rejection is truthful but is still a product limitation.

Upscale: implementation preserved; no new quality capability claimed. Browser regression results must be recorded for this head.

No physical Android/iOS device testing or comprehensive high-resolution browser memory acceptance completed. The required held-out dataset, phone-editor benchmark, all listed image cohorts and visual review gates are not complete. All12 blueprint task areas retain open acceptance criteria; this is not evidence that12 untouched tasks remain. No blueprint task is newly declared complete.

Decision: DO NOT DEPLOY. Browser processing has not been proven to have reached a universal quality ceiling; the current specific NAFNet/WASM tiled route has not met required quality/performance. This photographic candidate improves architecture and some tone/noise cases, but is not launch-ready.

## Audit interpretation

The old browser smoke test required a minimum pixel change on an already high-contrast generated source. The new engine measured luma MAE0.49, edge retention99.8%, texture99.2%, and worst regional retention98.9%. Replaced that non-quality proxy with a maximum clean-image-change gate while retaining every edge/texture floor. Actual benefit is tested on paired degraded references, not by demanding edits on clean images. CI now runs remaining audits after an individual failure, retaining overall failure status, so a quality failure does not conceal functional regressions.

The legacy gentle-deblur Enhance test is replaced by explicit photographic-mode isolation plus its existing damage/fidelity ceiling. Dedicated Deblur still must improve its sharp reference. Responsiveness permits a job completing in under300ms instead of demanding it last long enough for five timer ticks; completion-tail blocking is included in the maximum gap. Benchmark upload clears outputs, so absence of a previous output is read immediately instead of adding an artificial30s wait per case.

The browser benchmark confirmed moderately bright inputs could miss the initial exposure threshold; the final curve now reduces unclipped overexposure continuously above mean150, bounded to gamma1.16, with a paired-reference unit test. The ONNX-failure test uses known underexposure and checks movement toward its reference rather than demanding arbitrary changes on a clean generated pattern.


## Final checkpoint — audits retrieved 2026-10-07

Code candidate: **43aec080528f98476587aad6168d1861d927722b**, tree **f7e38201c0b49d64a0898775569dab964ca5b37a**.
Draft PR: https://github.com/alltoolforest/hub/pull/131 .
This checkpoint update changes documentation only. No implementation was repeated, no thresholds were weakened to clear the quality failure, and no deployment was performed.

- Pre-deployment workflow **37583044579: FAIL**, solely at the broad image-quality benchmark.
- Chrome functional/regression checks: PASS for static/frozen protection, 36 numerical/lifecycle tests across steps, CSP + real AI smoke, three-mode isolation/no neural models for Enhance, worker cancellation, fusion, artifact guard, dedicated Deblur ground-truth, diagnosis, face protection, region restoration, responsiveness, output planning, inspection, export formats, input/mobile-emulation compatibility, memory retries and ONNX-independent Enhance.
- Firefox/WebKit engine compatibility job **112666860469: PASS**, including dedicated Deblur.
- HEIC/HEIF workflow **37583044607: PASS**, including Chrome, Firefox and WebKit.
- These are automated browser/CI checks. They do not establish physical Android/iOS hardware acceptance or broad perceptual quality.

### Measured quality on the final code

| Case (192 × 128 generated paired benchmark) | Input RGB MAE | Output RGB MAE | Finding |
| --- | ---: | ---: | --- |
| Clean | 0.00 | 5.41 | Changes remain; no benefit can be inferred from pixel change |
| Blur, dedicated Deblur | 9.34 | 8.31 | 10.9% closer to reference |
| Noise, Enhance | 12.03 | 7.37 | 38.7% closer, but source-relative fidelity gate flags detail loss |
| Underexposure, Enhance | 42.36 | 35.68 | 15.8% closer |
| Overexposure, Enhance | 41.36 | 36.25 | 12.4% closer after threshold correction |
| Compression, Enhance | 3.04 | 6.73 | Farther from reference; blocks acceptance |
| Low-resolution source, Enhance | 1.81 | 5.75 | Farther from reference; blocks acceptance |
| Mixed damage, Enhance | 30.61 | 23.56 | 23.0% closer; remaining noise/detail concerns |

The benchmark stops its assertions at the noise fidelity failure. All eight case measurements above were collected before that failure; later assertions and the final mild-blur case were not reached. Do not label the full benchmark passed. The existing source-relative detail floor is confounded by noise: source edge energy16.42 falls to7.86 while clean target energy is1.93. That observation does not prove preservation of real local structure; a validated reference/region-based noise-versus-detail gate is still needed. The production guard was not changed.

The separate natural sharp-reference motion-blur test passed: MSE23.706 →7.119 (69.97% reduction), SSIM0.91947 →0.97611, gradient correlation0.54703 →0.88218. This is one controlled reference test, not evidence of general face/defocus recovery or phone-editor parity.

Measured maximum main-thread heartbeat gaps in the realistic desktop audit: Enhance50ms, Upscale81ms. Retain the earlier arithmetic-only12MP figure as a host measurement, not an Android promise.

### Mode decisions and remaining risk

| Mode | Functional/regression result | Product-quality acceptance |
| --- | --- | --- |
| Enhance Quality | PASS on tested browser paths | FAIL / blocked: compression, low-resolution fidelity, noise/detail validation and phone Auto Enhance parity |
| Deblur | PASS on tested routing, safeguards and controlled motion references | NOT ACCEPTED: motion/defocus/mixed strategy, real blurred portraits and high-resolution mobile limits unresolved |
| Upscale Resolution | PASS; original function preserved | Existing capability retained; no new universal quality or physical-device claim |

Changed from ad91869: four runtime files (main enhancer plus three photographic modules),12 enhancer test files, the enhancer CI workflow and this assessment (18 files). PR131 also includes the previously unmerged PR130 base. It must not be treated as a deployment of PR130's obsolete automatic-deblur Enhance behavior.

Regression risk: high for unaccepted enhancement quality; bounded but unproven on physical mobile memory/performance; lower for the unchanged Upscale implementation given successful regression checks. No frozen or unrelated tool code was changed by this work. Repository main is now b5f3f0399a85e15ba78fd947412af8bd90ac3459, while these audits ran on the candidate above; current-main integration must be checked before any later merge.

**Pre-deployment decision: WITHHOLD.** The implementation mandate remains partially fulfilled. Independent processing architecture is implemented, but requested restoration quality and the complete quality/device matrix are not met. The next work must resolve these quality/model-validation gaps, not repeat completed routing/UI/export work or simply force the audit green. No claim that browser-native processing has reached a universal ceiling is justified. No deployment approval is requested while these gates fail.
