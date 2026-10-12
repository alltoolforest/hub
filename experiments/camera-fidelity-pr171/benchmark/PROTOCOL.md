# Task 1 photographic benchmark protocol — predeclared V1

## Scope and gate

The current three public photographs are **calibration only**, not a representative release corpus. No candidate algorithm changes until the Task 1 corpus gate passes. Current engine remains byte-identical to PR171. The user has authorized Tasks 1–12 sequentially; this is an evidence dependency, not an additional permission request.

Before advancing: confirmed native originals and matched phone Auto exports; recorded device/editor version and settings; diverse native-resolution photos with ROI coordinates and input hashes; reserved held-out identities/scenes; baseline measurements; reviewed failure inventory; fixed performance/quality gates. Public sample rights are documented in sources.json. No private image or private local path enters Git.

## Corpus registration

Every original receives SHA-256, dimensions, EXIF orientation, color profile, format, provenance/permission, scene category and split. Group all variants of a scene/person into the same split. Near-duplicate crops and bursts cannot cross splits. Store user files outside Git and never infer original/edited pairing from filenames alone. Compare uncropped exports at identical dimensions; reject or separately label rescaled, filtered, beautified or geometrically changed phone output. Preserve source file bytes before decoding.

Missing scene coverage: naturally low-light/noisy photographs, real backlit people, older scanned prints, varied skin tones/marks, hair and textured clothing, foliage, bright highlights/night scenes, real damaged JPEGs and native phone-resolution inputs. The synthetic alpha case supplements, but does not replace, real transparent PNGs. Face coordinates used in calibration are review ROIs, not detector output; no full-frame fake face mask.

Acquire at least five confirmed original/phone Auto pairs initially: portrait, low-light, backlit person, fabric/hair detail and everyday daylight photo. Record phone model, OS/editor version, Auto setting and any face/beauty toggle. This first batch is a minimum input request, not full release qualification.

## Controlled measurements

Run identical decoded RGBA input through unchanged PR171 with worker-equivalent 96-row statistics and processing, correct global offsets and native dimensions. One warm-up plus three measured runs; verify input unchanged and identical output hashes across runs. This offline harness includes statistics and processing, but excludes browser decoding, worker transfer, encoding and downloads. It does not measure peak phone memory.

Separate metrics: native RGB change (not quality); signed luminance shift; newly clipped channels; exact alpha; clean-reference MSE/PSNR and luminance-gradient error where a known synthetic reference exists. Identity, true detail, halo visibility, texture naturalness and color fidelity require native-size visual review. High-frequency energy is not noise unless the ROI is independently established as flat. A degraded public source is a controlled reference, not an optically perfect ground truth. No SSIM/LPIPS claim is made. Real unpaired photos have no full-reference score.

For phone pairs, record the same dimensions, alpha, channel clipping and source-relative metrics, native crops and human preference. Record color-managed comparison assumptions. Phone resizing/ICC handling must be resolved before attributing differences to an algorithm.

## Blinded quality decision (locked before tuning)

Target 60 independent held-out scenes, stratified across required photo categories, and at least 3 independent raters per scene. No candidate-based selection or repeated tuning on held-out results. Randomize left/right per rater using a recorded seed; keep engine labels hidden until scores are locked. Show original context and matched native-size crops on the same display. Allow candidate, baseline or tie; record identity/texture/artifact concerns separately.

Count one result per scene: candidate wins only with a strict majority of all raters; ties/non-majorities count as non-wins. Require >=70% scene wins (>=42/60), a 95% Wilson lower confidence bound >50%, and no critical-category material regression. Phone-editor comparisons are a separate target, never substituted into the baseline preference denominator. Single-user reviews are development feedback, not independent-panel evidence. If the final sample count changes, preregister the change before held-out evaluation; do not reduce it to rescue a failed candidate.

Zero tolerance: accepted whiteout/blackout, new strip seams, corrupted output, incorrect dimensions, modified alpha, feature reconstruction or altered identifying geometry. Exact source identity may not be asserted from global metrics alone. Failures block promotion regardless of average preference.

Provisional numeric investigation thresholds, locked before candidate tuning: clean-reference PSNR drop >0.2 dB on any paired case; reference-gradient MAE increase >5% on texture ROI; flat-region residual RMS rise >5% on genuinely flat labeled ROIs; candidate-added clipped channels >0.05 percentage points versus baseline; visible new halo or color/skin shift. Any trigger requires review and disables the affected technique unless its cause is resolved. These are screening limits, not scientific guarantees or a replacement for visual review.

## Mobile performance budgets (qualification required)

Compare candidate and baseline on the same physical device/input, one warm-up and at least five runs: median processing time <=1.25x baseline, p95 <=1.5x; cancellation UI acknowledgement <=250ms and worker termination <=1s; no processing-induced main-thread task >100ms. Record full decode/process/encode/download latency separately. No arbitrary desktop-to-phone timing extrapolation.

Measure memory where APIs/tools permit; otherwise report unavailable, not zero. Working buffers must have documented bounds, with no unexplained growth over five sequential runs. Exact 32MP means 6400x5000 native output, conditional on device memory; safe refusal is acceptable and must not produce a corrupted or silently resized download. Qualify low-memory Android, recent Android Chrome, iOS Safari and desktop browsers in Task 9. Budgets remain unvalidated until that hardware is available.

## Commands

Download the three source_url entries in sources.json into an external input directory. prepare.py validates source SHA-256. Python dependencies: Pillow and numpy. Node: current run v24.19.0, no npm dependencies.

```sh
python experiments/camera-fidelity-pr171/benchmark/prepare.py EXTERNAL_INPUT_DIR EXTERNAL_DECODED_DIR
node experiments/camera-fidelity-pr171/benchmark/run.mjs EXTERNAL_DECODED_DIR/corpus.json EXTERNAL_OUTPUT_DIR
python experiments/camera-fidelity-pr171/verify-baseline.py --task0
```

Held-out inputs are deliberately rejected by this calibration runner. Screenshots, panel labels and output pixel hashes are not photographic preference votes.
