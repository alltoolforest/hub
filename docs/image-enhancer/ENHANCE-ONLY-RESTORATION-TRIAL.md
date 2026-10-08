# Enhance-only quality investigation — 2026-10-08

Base: deployed PR151, commit 95831ca4af4bd48d43981485742738dbea26b9ee.
Scope: Enhance Quality only. No changes to Deblur, Upscale, other tools, model
manifests, production workers or site UI. No deployment. Quality acceptance FAIL / OPEN.

## Manual acceptance reference
The user supplied a 452 x 678 JPEG and its enhanced PNG, confirming Portrait / face
was selected. Tone changes were visible, but fine-detail improvement was inadequate.
Input: 37,759 bytes; output: 690,657 bytes, with unchanged dimensions. The larger PNG
is encoding overhead, not additional detail. These private files are not in git.

Native analysis of the supplied source: estimated noise 0.83, JPEG boundary
strengths 0.281 and 0.292. The source uses 4:2:0 chroma subsampling and quantization.
The noise cleaner barely activates; narrow-boundary deblocking does not remove
broader compression artifacts. Lost information cannot be proven recovered from a
single low-resolution source. The before/after comparison has no clean ground truth.

## Rejected native cleanup experiment
Tested a 5x5 edge-guided chroma-only pass activated by existing JPEG evidence,
with luminance preservation, color-edge rejection, bounded correction and face
protection. Used the same manually observed face rectangle for both offline
variants; this experiment does NOT establish whether deployed face detection ran.

On the supplied image, baseline vs candidate mean absolute channel difference was
0.115/255, maximum 3/255, and 11.5% of channels changed. Visual difference was
negligible. Host processing/encoding observation: 177ms baseline vs 289ms candidate
(single observations, not a formal speed benchmark). Existing 12 photo tests and
the photographic benchmark passed in the earlier trial, yet the visible quality
requirement did not. Reverted the trial; no additional filter was integrated.

## Dedicated JPEG-restoration model trials
Official sources, local CPU inference only, torch 2.5.1+cpu, two threads. No user
images uploaded to inference services or GitHub. Native output dimensions retained.
These are direct model outputs, not accepted product outputs or protected face
blends. Their learned corrections are not evidence that every changed detail is true.

| Candidate | Supplied 452x678 sample | Peak host RSS | Visual finding | Decision |
|---|---:|---:|---|---|
| SwinIR color JPEG40 | 185.2s, 12 sections | 1,213,696 KiB | Strong cleanup but face/fabric look over-smoothed/painted | Reject this configuration |
| FBCNN color, automatic quality | 13.1s, whole frame | 1,294,960 KiB | Less aggressive, some artifact cleanup; residual facial/texture smoothing | Do not integrate; runtime, download and identity acceptance unresolved |

SwinIR weights: 99 MiB, 11,492,067 parameters. FBCNN weights: 275 MiB,
71,921,796 parameters. RSS includes Python, libraries, checkpoint/model and inference;
it is NOT a browser-memory measurement. No WebGPU, WASM, ONNX or physical-device
performance was measured. SwinIR's JPEG40 model is not guaranteed to match the
source's nonstandard quantization or prior compression history. These findings
reject the tested configurations, not all neural approaches or browser processing.

FBCNN paired reference test: existing public 256x256 natural fixture, encoded with
Pillow JPEG quality40, 4:2:0. Source/reference MAE 1.4742 -> output/reference 1.1844
(~19.7% lower); PSNR 41.711 -> 43.514dB. Runtime 2.92s, peak host RSS 966,432 KiB.
This supports actual cleanup on ONE controlled pair; it does not establish broad
portrait, identity, phone-editor or mobile acceptance. No threshold was weakened.

## Reproducible harness
`tests/image-enhancer-photo-restoration-trial.py` pins source commits and weight
SHA256, loads weights with `weights_only=True`, rejects oversized/alpha input,
refuses source overwrite, preserves dimensions and writes local JSON measurements.
SwinIR uses an evaluation-only equivalent for timm stochastic depth and torch's
truncated normal initializer; FBCNN's unused torchvision import is omitted. Model
weights load strictly. Neither adapter is for training or production deployment.

Example (local paths; provide the official checkout and downloaded weights):

```sh
python tests/image-enhancer-photo-restoration-trial.py --engine fbcnn \
  --source /path/to/FBCNN --weights /path/to/fbcnn_color.pth \
  --input tests/fixtures/nafnet-natural-sharp.png --jpeg-quality 40 \
  --output /path/outside/repository/reference-result.png
```

Official source/model release URLs:
- https://github.com/JingyunLiang/SwinIR
- https://github.com/JingyunLiang/SwinIR/releases/download/v0.0/006_colorCAR_DFWB_s126w7_SwinIR-M_jpeg40.pth
- https://github.com/jiaxi-jiang/FBCNN
- https://github.com/jiaxi-jiang/FBCNN/releases/download/v1.0/fbcnn_color.pth

Both upstream repositories state Apache 2.0; no upstream code/weights vendored.

## Decision / remaining work
No deployable quality improvement yet. Preserve the deployed engine while evaluating
smaller compression-specific restoration candidates with the same rejection gates.
Do not silently replace identity preservation with synthetic detail. The blocker is
finding and validating a materially better cleanup model with practical browser
resource costs, not adding prompt text or more global sharpening. No claim of a
universal architectural ceiling is justified by these limited trials.

Before integration: held-out paired compression/texture tests, clean-image no-harm
checks, actual face-preserving fusion review, runtime conversion parity and mobile
memory/latency measurements. Phone Auto Enhance comparison remains unavailable.
Do not move to Deblur/Upscale work or freeze Enhance based on this checkpoint.

## Compact DnCNN-3 follow-up
Official KAIR JPEG-deblocking configuration was also evaluated. Although DnCNN-3
was trained on multiple degradations, this trial runs only its native-size Y-channel
JPEG cleanup, preserving source chroma; it does not invoke Deblur or Upscale engines.
MIT-licensed upstream source: https://github.com/cszn/KAIR
Weights: https://github.com/cszn/KAIR/releases/download/v1.0/dncnn3.pth
The Python harness pins commit and SHA256 for this candidate as well.

- 665,921 parameters; approximately 2.6 MiB weights/exported ONNX.
- Supplied portrait: 3.49s CPU, peak process RSS 527,332 KiB. Less aggressive visual
  cleanup than SwinIR; this does not establish identity preservation.
- Earlier controlled JPEG40 pair: MAE 1.4742 -> 1.2022 (~18.5% lower); clean version
  changed by 0.1997 MAE. Initial promise required broader checks, not immediate use.
- PyTorch -> ONNX CPU maximum absolute error 3.87e-7 on seeded 64x96 input.
- ONNX Runtime Web 1.30.0, headless Chromium, one WASM thread with proxy worker:
  parity error 0 on the same fixture. A synthetic 452x678 tensor took 17.356s;
  maximum heartbeat gap 27ms. This is model inference only, excludes decode/export,
  and is not real-phone performance. Browser runtime is too slow for automatic use.
- Broader public Set5 check (baby, bird, butterfly, head, woman), JPEG quality
  30/50/70 with 4:2:0 and untouched-source controls: MAE improved in 14/15 compressed
  cases. At quality70 the woman fixture worsened from 1.312 to 1.781; untouched
  sources changed by 0.49–2.88 MAE. `DNCNN-PAIRED-TRIAL.json` records every case.
  Quality100 in that report means untouched control, NOT a quality100 JPEG encode.

Decision: do not integrate unconditionally. This candidate demonstrates real
compression cleanup, but weaker-compression/clean-image regressions and 17s browser
inference prevent approval. It needs reliable degradation gating, held-out texture
and identity checks, and materially faster execution before any product integration.
No new engine is ready to deploy. Current production algorithms remain unchanged.

Optional browser reproduction, after exporting `dncnn3.onnx` and parity buffers
with `--engine dncnn --export-onnx /local/trial/dncnn3.onnx` and installing ORT Web
1.30.0 beneath `/local/trial/npm`:

```sh
ENHANCE_TRIAL_ROOT=/local/trial/ node tests/image-enhancer-photo-restoration-browser-trial.mjs
```

The provided harness is evaluation infrastructure only. This checkpoint preserves
both promising findings and rejection evidence so future work does not repeat
these trials or present a passing single-image metric as product acceptance.
