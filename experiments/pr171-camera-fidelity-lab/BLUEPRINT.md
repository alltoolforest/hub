# AllToolForest — Camera-Fidelity Image Enhancement Engine
## Engineering Remediation Master Blueprint | Version 1.0 | 10 October 2026

**Status:** APPROVED BASELINE COPY ONLY — DESIGN BLUEPRINT; NO ENGINE IMPROVEMENTS IMPLEMENTED.

**Objective:** Build a substantially better version of the photographic **Enhance Quality** engine using an **unchanged copy of PR #171** as the baseline. The output should look like a naturally well-exposed, clean, finely detailed photograph from a capable camera—not artificially sharpened, painted, beautified, regenerated, or face-morphed.

**Important technical boundary:** A non-generative enhancer can reveal and preserve detail that is actually recorded in the pixels; it **cannot truthfully recover entirely missing information** from heavy motion blur, severe defocus, or absent facial details. Deblurring, learned reconstruction, and super-resolution are separate products/explicit research tracks. The goal is camera-like photographic fidelity, not an impossible guarantee of reconstructing the exact unseen scene.

## A. Isolation, source of truth, and immutable baseline

| Item | Rule |
|---|---|
| GitHub repository | `alltoolforest/hub` |
| Protected PR #171 merge snapshot | `ff5db8817c138df648969340f4009ecee0a44560` |
| Protected production | `main`, existing PR #171 engine and all other AllToolForest tools: **no edits** |
| New experimental branch | `experiment/pr171-camera-fidelity-lab-20261010` |
| Immutable laboratory source copy | `experiments/pr171-camera-fidelity-lab/baseline/` |
| Future experimental code | `experiments/pr171-camera-fidelity-lab/candidate/` **only after separate implementation approval** |
| Design and test artifacts | `experiments/pr171-camera-fidelity-lab/` and private/local test stores; do not commit customer photographs |
| Previous Rocket 1, Rocket 2, Hybrid engines | **Retired. Do not reimport their code**, unsafe allocations, pipelines, tuning constants or modules. Ideas below are hypotheses for *independent* validation. |

Four source modules were copied **without changing their algorithms or import filenames**: `image-enhancer-photo.js`, `image-enhancer-photo-worker.js`, `image-enhancer-photo-engine.js`, and `image-enhancer-portrait.js`. Treat the baseline folder as read-only. Any new work must live in `candidate/`, with comparative tests against the untouched `baseline/` copy. No GitHub Pages settings, production domains, production PR, frozen tools, shared front-end assets, or other Vercel projects are in scope.

**Workflow rule:** Implement one authorized task at a time. Each task: reproduce the issue → make the smallest isolated change → measure against the baseline → test direct regressions → record pass/fail → stop for authorization of the next task. Any change failing the gate is reverted or disabled inside the experiment.

## B. Evidence from previous experiments — use lessons, not implementations

| Source | Validated finding or useful hypothesis | Explicit caution |
|---|---|---|
| PR #171 | Conservative photographic processing, tone/contrast safeguards, working native-size worker, basic JPEG blocking/noise management, portrait protection. | It remains visually too conservative on the tested portrait; mixed-light gate and fixed scale are limited. |
| Rocket 1 | Scale-adaptive clarity, multi-scale fine/medium detail, shadow-weighted chroma noise handling, restrained tone correction, bright-scene protection and adaptive vibrance are worth isolated trials. | Synthetic tests showed more edge energy but also more shadow grain, highlight clipping and worse portrait-reference SSIM; phone output gave little meaningful benefit. |
| Rocket 2 | Spatial/luminance-band noise maps, guided edge-preserving denoising, local signal-to-noise confidence and interpolated floating-point tones merit independent exploration. | Its actual engine catastrophically corrupted images; a suspected undersized scratch-buffer reuse bug and other defects make its code unsuitable for adoption. |
| Hybrid V2/V3 | Worker-local source decoding, bounded strips, reduced preview sizes, 32MP input trial, source-relative whiteout/seam checks, diagnostics and genuinely independent A/B comparison were valuable system-design lessons. | Pixel change (~29–35/255 on user tests) was **not** recovered detail; shadow/dark-midtone gates stayed at 0 and the visual advantage was insufficient. Do not force every gate to activate. |

**Non-negotiable design principle:** Stronger-looking edges, higher global brightness, higher SSIM between two processed versions, and a large numerical pixel difference are **not substitutes for faithful camera-like detail**.

## C. Proposed engine architecture (target, not yet implemented)

`Input/decode + EXIF orientation → scene/degradation diagnosis → spatial noise and structure confidence maps → localized luma/chroma cleanup → masked, multi-scale photographic detail enhancement → conservative local exposure/color → pixel-integrity checks → native-size encode + diagnostics`

- **Separate color and luminance.** Use a tested floating-point working representation where justified; preserve RGB/alpha/ICC handling and avoid unintended hue/gamut changes.
- **Separate structural evidence from grain.** Flat skin, hair contours, fabric edges, foliage, skies, shadow noise and compression blocks require different gains and thresholds.
- **Be content-aware but identity-conservative.** Genuine face-region detection, when available, should protect identifying features and natural skin; hair, clothing and backgrounds may have different enhancement strengths. Skin color alone is not a reliable face locator.
- **Do not synthesize details.** No facial reconstruction, invented eyes/pores/hair strands, beauty filters, geometric shifts, generative texture, or hidden upscaling in Enhance Quality.
- **Make every stage optional and measurable.** Each stage exposes both *why it activated/skipped* and objective impact on quality/risk.

## D. Sequential engineering task blueprint

### Task 0 — Create exact protected laboratory baseline (COMPLETED; no enhancement work)
**Scope:** Branch from verified PR #171 merge commit; copy the four source modules unchanged to `baseline/`; document file hashes and no-production-edit rule.
**Gate:** All four copied Git blob SHAs equal corresponding source SHAs; `main`/PR #171 remain at their previous commit; repository diff contains only files under the lab folder. **Stop here until implementation approval.**

### Task 1 — Build the reproducible photographic quality corpus and PR #171 baseline
**Scope:** Assemble permission-cleared, diverse real-photograph originals: sharp clean references and controlled degraded pairs when possible; daylight portrait, soft old print, hair/moustache, colored skin, skin marks, textured clothing, dark interiors, backlit people, foliage, skies, snow/bright scenes, JPEG artifacts, logos/text, PNG transparency. Retain several *held-out* images never used during tuning. Include the user-provided portrait privately, not in public GitHub. Preserve EXIF/orientation metadata where relevant.
**Tests:** Run unchanged PR #171 and a competent phone Auto editor on identical originals/settings; record native-size crops, visual preferences, per-region noise/sharpness, color difference, highlight loss, artifacts, timings/memory and device/browser. Use SSIM/PSNR/LPIPS only when a trustworthy clean reference exists; use blind human A/B for subjective camera realism.
**Gate:** Repeatable input hashes, ROI coordinates, benchmark script and baseline report. Explicit list of failure cases, performance budget and no-go thresholds approved **before** changing the engine.

### Task 2 — Instrument source diagnostics and corruption guards first
**Scope:** Create candidate-only analysis diagnostics for noise by region, histogram percentiles, edge coherence, activated/skipped stages and reasons, local brightness, gamut clipping, output dimensions, alpha and stage runtime. Add finite-number assertions and output validation against whiteouts/blackouts, horizontal seams, false color, severe tonal drift and decode/encode failure.
**Tests:** First/interior/last strips of different heights; adversarial transparency, flat white/dark pictures, one-pixel edges, gradients and mixed lighting. An intentionally corrupted stage must report **failure**, not “completed.”
**Gate:** Baseline-equivalent image when all new stages disabled; reproducible diagnostics; no false success or silent corruption.

### Task 3 — Scene/degradation diagnosis and regional noise-confidence maps
**Scope:** Independently prototype Rocket 2's *idea* of noise analysis by luminance bands (dark/mid/bright) and coarse spatial tiles. Distinguish compression artifacts, actual texture, motion softness, defocus, clipping and colored noise; treat uncertain estimates conservatively. Avoid confusing genuine hair/fabric microtexture with noise.
**Tests:** Texture-heavy scene versus flat noisy wall; low ISO versus high ISO; old scanned prints; shadow-colored speckle; ground-truth synthetic noise pairs and real photographs.
**Gate:** Maps materially discriminate noisy flats from coherent edges; diagnostic estimates stable across strip sizes and image resolution. Reject the map if it suppresses true hair/fabric detail.

### Task 4 — Localized edge-preserving noise and chroma cleanup
**Scope:** A bounded, **new implementation** of guided/bilateral/luma–chroma denoising on locally confirmed noisy regions. Prioritize shadow chroma speckles and minor JPEG artifacts; do not apply strong global smoothness. Never import Rocket 2's scratch allocator or worker implementation.
**Tests:** Preserve pores, moles, hair boundaries, eyelash/eyebrow and moustache silhouettes, skin tone, colored garments, text, fine fabric and alpha. Quantify flat-region noise decrease without edge/detail loss or halos.
**Gate:** Clearly lower objectionable noise where present, with no meaningful native-zoom detail loss or plastic skin; pass mobile runtime limits.

### Task 5 — Genuine multi-scale clarity and controlled fine-detail enhancement
**Scope:** Replace globally tiny or overly aggressive gains with **confidence-gated, multiple spatial frequency bands** scaled to input resolution. Use edge coherence, local signal-to-noise estimates and content masks; exclude JPEG 8×8 boundaries, clipped areas, noise and broad high-contrast boundaries from false sharpening. Separate “fine recorded detail” (hair, fabric) from broader local-contrast clarity.
**Tests:** Reference hair/fabric texture, facial identity marks, lower eyelids, eyebrows, moustache edges, sky-tree halos, JPEG ringing, dark hair noise. Native-size crops compared side-by-side against PR #171 and clean references.
**Gate:** Measurable increase in **faithful** detail or blind photo-quality preference, not merely gradient energy. No fabricated face features, crunchy outlines, visible halos, banding or grain amplification.

### Task 6 — Face-aware identity and material protection
**Scope:** Evaluate lightweight on-device face detection where supported, with optional accurate face regions and graceful fallback; minimize face geometry alterations. Protect eyes, pupils, nose, lips, skin asymmetry, freckles/moles and expression; handle hairline/moustache and shirt separately if segmentation confidence permits. Fall back to conservative processing when detection fails; **never fake full-image face bounds**.
**Tests:** Multiple faces, side profiles, dark skin, different lighting, no-face images, partial occlusion, low-light, older prints, safety under false detections and no network upload.
**Gate:** No identifiable-feature reconstruction or significant facial texture distortion; hair/clothes remain eligible for proven safe improvements. If robust detection cannot meet performance/privacy limits, keep a conservative fallback.

### Task 7 — Local tone, exposure, and highlight preservation
**Scope:** Introduce content-conditional, bounded local tone adjustment with floating-point/interpolated lookup **only if demonstrated beneficial**. Address PR #171's narrow mixed-light behavior without assuming a gate must always fire. Differentiate under-lit recoverable midtones from genuinely black shadows, low-key art, night scenes and clipped highlights. Leave automatic white balance unchanged initially.
**Tests:** Real backlit subjects, snow/beach, night portraits, shadowed hair, deliberately low-key shots, highlight detail and skin color. Explain activation with per-gate indicators.
**Gate:** Improve local visibility when signal exists; no washed-out blacks, glow, gray shadows, midtone flattening, highlight clipping or dramatic global color shift.

### Task 8 — Optional natural color and JPEG artifact correction, behind separate gates
**Scope:** Individually research low-saturation vibrance with gamut safety, restrained color cast correction (e.g. gray-edge evaluation), and verified JPEG chroma deblocking/deringing. These are **lower priority** than genuine detail. Automatic white balance must not neutralize sunset warmth or scene-dominant color. Do not reuse Rocket 2's invalid vibrance/highlight/dither code.
**Tests:** Skin-tone fidelity, sunsets, neon, product colors, gradients, colorful clothes, intentionally warm scenes and compressed JPGs.
**Gate:** Visible, independently supported benefit with no measured or manual color/hue regressions; otherwise omit the feature.

### Task 9 — Reliable native-resolution Android/iOS pipeline and 32MP qualification
**Scope:** Keep CPU/memory-bounded strip/tile processing using Web Workers/OffscreenCanvas where available; dynamically plan halo/buffer sizes; verify scratch allocations on every resize and process finite values safely. Allow **up to 32MP** native input/output when the device supports it; avoid main-thread full-frame duplicates. Preview at reduced resolution when necessary, but downloads must preserve native dimensions. Consider WebGL/WebGPU only behind measured device-supported fallbacks; do not migrate just because GPUs sound faster.
**Tests:** 1MP, 6MP, 12MP, 24MP, exact 6400×5000 (32MP), uncommon aspect ratios, PNG alpha, JPEG/WebP, orientation, cancellation during decode/process/encode, low-memory Android, recent Android Chrome, iOS Safari, Windows/macOS browsers. Compare full-frame vs varying strip sizes for seams/edge behavior.
**Gate:** 32MP result keeps correct dimensions and alpha where present; robust cancellation, clear memory error when hardware cannot finish; no silent downscaling, crashes, unbounded RAM or large UI freezes. Performance budgets fixed from Task 1. Desktop synthetic success **does not** count as phone validation.

### Task 10 — Isolated A/B preview and test ergonomics
**Scope:** Create a dedicated **experimental-only** preview site from the candidate folder, not GitHub Pages production. Show Original / unchanged PR #171 / Candidate at exactly matched zoom; upload only locally, independent native downloads, ROI crops, basic presets, full diagnostics and a visible engine/build version. Use accessible mobile controls and honest failure states. Keep existing AllToolForest URLs untouched.
**Tests:** Android scrolling, file input, 100% zoom, native-resolution comparisons, download correctness, no browser cache confusing versions, keyboard access, errors and portrait orientation.
**Gate:** Actual HTTPS preview opens on user's phone and shows the expected build; no cross-project sharing or accidental production deployment.

### Task 11 — Deep audit, real-photo blind review, security and regression
**Scope:** Independent QA review of pixel pipeline, memory, privacy, artifacts, compatibility, UX and accessibility. A/B compare each stage to the exact PR #171 baseline and phone-editor target. Test unseen held-out photos, not only the portrait used in tuning. Preserve rollback to PR #171 within the lab.
**Launch-quality gate (proposed, to be locked in Task 1):** At least ~70% blinded human preference for the candidate across a representative corpus, with **no material regression on any critical category**; reference-pair metrics do not worsen beyond predeclared tolerances; zero accepted identity alterations, whiteouts, new seams, broken alpha, dimension mistakes or corrupted downloads; physical Android/iOS runs meet agreed stability/memory/runtime budgets. Do not pass on a single-photo improvement.

### Task 12 — Release decision and controlled handoff (separate authorization required)
**Scope:** Publish a signed-off report: what improved, by how much, failed cases, device matrix, risk and rollback plan, files changed and demonstrated repeatability. Explicitly classify remaining issues as launch blockers vs future enhancements.
**Gate:** User authorizes any separate production work **only after** candidate meets all required quality gates. Formal release sequence: **Implement → Pre-deployment audit → Deploy → Production audit → Manual verification → Regression → Freeze**. Until then, keep all work isolated; **do not touch PR #171, `main`, or any other tool.**

## E. Priorities and non-negotiable release blockers

**P0 / Required:** faithful photographic texture; identity and geometry protection; no whiteout/blackout/seams/nonfinite output; no significant added grain/halos/plastic skin; same dimensions/alpha; reliable cancellation; mobile-compatible preview and native download; controlled 32MP behavior with honest memory handling; demonstrated improvement vs PR #171 on diverse real photos.

**P1 / After P0 is demonstrated:** better low-key/backlit local tone; gradual chroma cleanup; adaptive vibrance; efficient GPU acceleration where measurably useful.

**P2 / Future separately approved:** aggressive automatic white balance, sophisticated JPEG restoration, any learned generative detail-reconstruction or face-recovery model, super-resolution and deblur integration. Do not mix these into the faithful non-generative Enhance Quality release.

## F. Scorecard required for every change

Record for each test pair: original SHA/file category; device/browser/memory class; exact engine commit + settings; source/output dimensions and alpha; per-ROI luminance/edge coherence/detail-to-grain ratio; flat-area noise; clipping/halo/color shift; facial-feature integrity; timing, peak memory when measurable, cancellation result; comparison against untouched PR #171; blinded visual preference; stage activation and *skip reason*. Flag unsupported claims as **not verified**.

No performance or quality percentage may be presented as a measured result without the corresponding test run and source images. Never interpret `observed change / 255` as a quality score. Use both **clean reference pairs** and genuine, unpaired real photos for balanced evaluation.

## G. Handoff instruction for the next implementation agent

> Work only in branch `experiment/pr171-camera-fidelity-lab-20261010` under `experiments/pr171-camera-fidelity-lab/candidate/`. Use `baseline/` strictly read-only and Blueprint v1.0 as source of truth. Begin **Task 1 only** after explicit approval. Before editing, verify `main` and PR #171 still point to protected commit `ff5db8817c138df648969340f4009ecee0a44560`. Do not import Rocket 1/Rocket 2/Hybrid code. Report files changed, tests and quantitative results, regression risk, blockers and next task; then stop. No production merge or deployment without separate user authorization.

---
**Blueprint completion status:** This document defines future work. Creating the branch and verbatim baseline files does **not** mean the enhancement architecture has been implemented, tested on devices, deployed, or judged production-ready.