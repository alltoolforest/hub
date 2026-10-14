# Image Enhancement Engine v2 — Diagnosis, Design and Measured Results

Scope kept from the handoff: non-generative, native resolution, no resizing / geometry change / deblur-SR,
strip processing with halo, cancellable worker, original untouched on failure. Public API of the numeric core
(`PHOTO_HALO, photoStatistics, collectPhotoStatistics, makePhotoPlan, enhancePhotoStrip`) and the
`enhancePhotograph()` adapter contract are unchanged; the worker changed (see §5). Drop-in: replace the files in `src/`.

## 1. Why v1 under-delivers (measured, not assumed)

Band-energy gain of v1 on typical photos is only 1.00–1.15 and ~1.00 above 4 px. Causes in the source:

| # | Cause in v1 | Effect |
|---|---|---|
| 1 | Detail change clamped to ±3 (sharpen) and ±2.8 (local) luma levels, on a single 1-px / 17-px pair of scales | Mathematically cannot produce a visible texture change; only tone is visible |
| 2 | Sharpen/local gated on `|detail| > noise·1.8/1.5` | Kills exactly the low-contrast detail that soft photos need |
| 3 | Portrait mode: `protection = 1 − .85·face` multiplies sharpen/local by 0.15 (and 0.45 on any skin-coloured pixel). When detection falls back to "whole frame" the entire image gets ≈0.15 | Portraits look almost unprocessed |
| 4 | Denoise = one 3×3 bilateral, `cleanup ≤ .78`, only if noise > 1.2 | Cannot touch blotchy / correlated noise (phone, JPEG, low light) |
| 5 | Noise median taken from the **first 100 000 samples** → only the top rows of the frame | Estimate biased by sky/background; texture flat-gate (`<24`) also biases low at high noise |
| 6 | Chroma denoise is a ≤ 3×3 operation; saturation fixed at +3.5 % | Colour blotches stay; colour change invisible |
| 7 | Global tone only; contrast gated to `range < 180`; mixed-light lift needs a narrow histogram pattern | No local tonal depth, no midtone "punch" |
| 8 | Scale-blind: same 1-px/17-px recipe on a 1 MP and a 48 MP image | Detail is invisible on large images |

## 2. v2 design

**Pass 1 – analysis (sampled, native pixels).** Adds: whole-image residual histograms (no sample cap), a *second-scale*
(±2 px) residual so correlated noise is seen, per-luminance-band noise (noise is signal-dependent), a 24-cell coarse
luminance grid, chroma-noise histogram calibrated on synthetic chroma noise.

**Pass 2 – per strip (halo 64 px = 62 px wavelet support + 2 px block filter):**

1. *Deblock* (only if JPEG block grid evidence) – H.264-style conditional edge smoothing on luma, phase from stats.
2. *Starlet (à trous) decomposition, 5 levels* of luma (exactly invertible: with all modules off output is bit-identical to input).
   Per level and per pixel: **non-negative-garrote shrinkage** with threshold = z·σ·σ_level·noise(luminance), a
   retained-grain floor (12 %, 40 % on faces) to avoid plastic skin, then an **amplitude-compressive gain**
   `1 + g·ramp·k²/(w²+k²)` capped per level (+10…+18 levels). Small real detail is lifted most, strong edges least ⇒ no halos/overshoot.
   Mosquito-noise guard: near strong edges, levels 1–2 get a raised threshold when JPEG blockiness was detected.
3. *Resolution-aware scale mapping*: gains are defined at "virtual" scales and shifted by `round(log2(maxDim/1800))` (0–2), so a 12 MP image gets texture at 2–4 px rather than invisible 1-px sharpening.
4. *Chroma*: 4-level shrinkage of Cb/Cr, relaxed where luma shows a real edge (stops colour bleed, keeps coloured edges).
5. *Tone*: v1 curve + gentle S-curve (`punch`, faded for low-key / already high-range images), then **local exposure**: per-cell exponent field, upsampled with a range-aware (bilateral) weight so dark pixels near bright areas don't inherit the bright cell's gain. Near-black cells are left alone; lift is gated by measured shadow noise.
6. *Vibrance* (low-chroma-weighted, skin/face attenuated) replaces flat +3.5 %; gamut-safe chroma reconstruction as in v1; ≤ 0.6-level triangular dither only where tone stretch could band.
7. *Face protection* is graded per scale instead of a blanket 0.15 (`faceProtection: 'standard' | 'strict'`; `strict` ≈ v1-like caution).

Transparent pixels are replicate-filled before filtering and passed through unchanged. Graphics (`text-logo`, `illustration`) are bit-identical pass-through.

## 3. Measured results (`bench/RESULTS.txt`, reproducible with `bench/benchmark.py`)

Reference photos (skimage/matplotlib sample images) degraded synthetically so the clean original is ground truth.

| Test | v1 | v2 |
|---|---|---|
| Detail band gain at default settings, 1/2/4/8/16 px (1.00 = none) | 1.10 / 1.06 / 1.04 / 1.03 / 1.03 | 1.09 / 1.16 / 1.20 / 1.21 / 1.19 |
| Typical photo (astronaut/coffee), 1–16 px | 1.00–1.05 | 1.09–1.16 |
| White noise σ8/chroma 6, PSNR vs truth (input 28.89) | tone edits dominate, not isolatable | **31.73 (+2.8 dB)**, SSIM 0.66→0.86 |
| Camera-like noise + JPEG q80 (input 32.83) | – | 33.43 (+0.6 dB), SSIM 0.85→0.90 |
| Correlated noise + JPEG q55 (input 30.28) | – | 31.13 (+0.85 dB), SSIM 0.79→0.85 |
| JPEG q35, no noise | – | neutral (−0.03 dB) – no damage |
| Sharpening of softened photo, 2-px band restored (input 0.75 / 0.58) | – | 0.90 / 0.70 (auto), 0.94 / 0.73 (medium); never > 1.0 (no overshoot) |
| Luma noise estimate, true σ 3 / 6 / 10 | – | 3.5–4.7 / 7.0–7.7 / 10.5–11.2 |
| Strip seams (32/48/96-row strips vs whole image) | – | **0 differing pixels** |
| 12 MP (4000×3000) runtime, Node, 1 core | 4.0 s | 6.1 s (1.6×) |

Honest reading: PSNR/SSIM cannot reward sharpening or tone because a blurred image is not invertible and "better looking" ≠ "closer to the reference". The detail numbers show energy moving toward the truth without exceeding it; the visual samples in `samples/` (original | v1 | v2) show the rest.

## 4. Known limits / failure modes (please read)

* Strongly textured clean scenes (grass, gravel) are partly read as noise (estimate saturates at 14) → fine band can lose ≈7 % (measured 0.93). A texture-vs-noise classifier is the next fix.
* Non-generative processing cannot recover detail that is absent. Typical expectation at `balanced`: +15–20 % band energy; `recovery` / `sharpness: 'medium'` goes further at the cost of fidelity.
* Inherited v1 policy, unchanged: global gamma lift for `mean < 100` brightens twilight/night scenes (visible on the rocket sample). Decision for the product owner.
* Local exposure on extreme HDR edges can still leave faint low-frequency glow; capped at 0.32 amount and disable-able (`localExposure: 'off'`).
* **Not executed in a browser.** The numeric core was tested headless in Node; the worker/adapter were syntax-checked and follow the v1 canvas flow but `OffscreenCanvas` could not be exercised here. Run a browser smoke test (large JPEG, cancel mid-run, Portrait with/without faces) before shipping.
* Test images are small (≤ 640 px) and synthetic degradation is not real camera noise; validate on your own corpus.

## 5. Option and file changes

* `makePhotoPlan` options (all optional): `strength`, `sharpness`, `content`, `sourceMime`, `faces` (unchanged) **+** `faceProtection`, `localExposure: 'off'`, `denoiseScale` (default 1), `modules: {wb, denoise, detail, deblock, local, vibrance, punch, tone}` (ablation/debug).
* `photoStatistics({width,height})` now takes image size; `enhancePhotoStrip(..., {offsetY, faces})` unchanged.
* Worker: strip height from `photoStripRows(width)` (bounded working set), richer diagnostics (`msAnalysis`, `msPixels`, `chromaNoise`, …), workspace released after run. Memory ≈ 11 float planes × (rows+128)×width (≈ 50 MB at 4000 px wide).

## 6. Roadmap to go further (ordered by value / risk)

1. **Real-world validation set + before/after review tool**: 30–50 of your own failing photos; track band gain, noise, and a human A/B score per release.
2. **Texture-vs-noise classifier** (local kurtosis / structure coherence) to protect grass, fabric, fur and fix §4 item 1.
3. **Per-scale noise profiling in pass 1** (MAD of starlet coefficients on 8–12 sampled strips) replacing the white-noise constants; handles phone-style correlated noise exactly.
4. **Edge-aware local tone** (guided/local-Laplacian base layer) to remove the residual glow risk and allow stronger shadow/highlight recovery.
5. **Speed**: port starlet kernels to WASM-SIMD or WebGPU (5–10× on 12–50 MP), parallelise strips across 2–4 workers (strips are independent — seam test proves it).
6. **JPEG-aware restoration** in the DCT domain (quantisation-interval projection) for low-quality JPEGs: the only non-generative way to remove blocking/ringing without softening.
7. **User-facing controls**: expose Denoise / Texture / Clarity / Vibrance / Local-tone sliders from the existing `modules` + per-level gains; a before/after split view.
8. **Optional, if the "non-generative" rule is ever relaxed**: a small learned denoiser/SR as a separate, clearly-labelled mode. This is the only route to genuinely recovered detail.
