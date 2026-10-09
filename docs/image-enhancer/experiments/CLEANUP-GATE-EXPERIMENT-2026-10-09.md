# Isolated Enhance cleanup experiment — 2026-10-09

**Decision: do not integrate or deploy this candidate.** Numerical JPEG cleanup is promising, but visible benefit on the supplied portraits is small, a structured-pattern control regresses, and CPU browser inference is too costly. WebGPU speed is unverified. This experiment does not establish a universal browser quality ceiling.

## Scope and continuity
Baseline: deployed PR165, commit `a17605e52f9efc6fd71385368cac0247c9070254`.
Only experiment scripts and evidence are added. No production module, UI, model asset, worker, shared file, frozen tool, Deblur or Upscale code is changed. The previous unconditional DnCNN and larger-model trials were not repeated; this follow-up evaluates new input gating and guarded residual fusion, including the complete deployed Enhance pipeline.

Candidate: pinned KAIR DnCNN-3, revision `fc1732f4a4514e42ce15e5b3a1e18c828af47a1e`; weights SHA256 `cef4b4672a121b196a0525453b7091dc457a24b673105b38d623299f06fcc728`. Model download: https://github.com/cszn/KAIR/releases/download/v1.0/dncnn3.pth . No weights or third-party source vendored. Model purpose in this experiment is Y-channel compression cleanup, not face synthesis or an invocation of our Deblur/Upscale engines. Source chroma is retained before RGB gamut clipping.

## Two gating hypotheses
1. **Metadata:** enable only for JPEG luminance quantization-table mean >=45. Skip other input formats and higher-quality encodings. Quantization is evidence of encoding strength, not proof of visible degradation.
2. **Evidence:** additionally allow table mean >=20 when weak JPEG-phase boundaries have ratio >=2.4, mean jump >=0.8 and >=40 samples. Strong jumps are excluded from the boundary evidence. Coarse quantization still enables cleanup unconditionally in this hypothesis.

No ground-truth reference is used to choose corrections or enable a case. References are used only for evaluation.

Both variants cap predicted luminance correction at +/-6, blend at at most 65%, and reduce changes near strong immediate edges. Actual rounded RGB corrections are at most 4 levels. Model contribution is exactly zero within supplied face rectangles, feathered outside. Portrait requests without a face mask are rejected by the gate. Private portrait masks were manually supplied for offline comparison; detection accuracy was not tested.

The model uses 384px cores and 20px receptive-field halos, bounding intermediate memory. The 1.62MP portrait uses 12 sections, the 0.31MP portrait uses four. A real-model parity test verifies the sectioned result against full-frame processing across a seam. No resizing or synthetic face reconstruction occurs.

## Coverage and results
90 cases total:
- 17 public images, each as untouched reference plus JPEG quality30/50/70/95, 4:2:0: 85 cases. Set5 provides five color regression cases. Set12 provides 12 held-out, predominantly grayscale natural-image cases. Each uses a fixed native 256x256 center crop, not a resized full-image benchmark.
- Three additional controls: uniform field, smooth ramp, sharp repeating grid, encoded at JPEG30.
- Two supplied portraits at original dimensions, with no clean reference available.

| Check | Metadata gate | Evidence gate |
|---|---:|---:|
| Natural-image cases selected | 34 | 36 |
| Selected cases with improved RGB MAE | 34/34 | 36/36 |
| Selected cases with improved gradient-reference MAE | 34/34 | 36/36 |
| Mean relative MAE reduction at cleanup stage | 4.78% | 4.80% |
| Selected cases improving after deployed Enhance | 34/34 | 36/36 |
| Mean relative MAE reduction after Enhance | 3.80% | 3.83% |
| Untouched PNG controls unchanged | 17/17 | 17/17 |
| JPEG95 controls unchanged | 17/17 | 17/17 |
| Supplied portraits selected | 0/2 | 2/2 |

These percentages describe error against a paired reference; they are not perceptual quality percentages, and are not evidence of twice the quality. After-Enhance comparisons use the same deployed Enhance engine on the clean reference as the target. Gate thresholds were fixed before evaluating these cases; no per-image tuning was used.

**Confirmed failure:** the JPEG30 grid control has RGB MAE 1.000 before cleanup and 3.297 after. After the Enhance pipeline, error increases from 1.000 to 3.870 against the enhanced reference. Protecting only immediate strong edges is insufficient: the model changes nearby pattern interiors. Both gates admit this case. PNG/high-quality control passes therefore do not establish general clean-image safety.

**Private portrait findings:** the strict metadata gate skips both, illustrating that custom JPEG tables and prior recompression are not a reliable stand-alone degradation diagnosis. The evidence gate admits both. CPU model time is 15.67s for 1102x1470 and 3.31s for 452x678, excluding subsequent Enhance and export. Cleanup changes average only 0.098/255 and 0.376/255 respectively; after Enhance, differences versus baseline average 0.198 and 0.493. Side-by-side review finds modest non-facial texture changes, not a substantial visible step up. The old portrait's underlying softness is not solved. Face pixels are exactly unchanged by the cleanup stage; subsequent global Enhance statistics may still alter tones, so this is not a claim of identical final facial pixels or biometric identity verification.

## Browser and safety checks
- Five experiment safety/parity tests PASS: missing-face rejection, no-JPEG/high-quality bypass, exact protected-face pixels/bounded corrections, overlap/feather behavior, and actual-model full-frame/sectioned parity.
- PyTorch 2.5.1 CPU export, ONNX opset17, ONNX Runtime Web1.30.0, Chromium140/Playwright1.55.
- Real JPEG30 public input: 256x256 with reflect padding -> 296x296 model tensor.
- WASM one thread: initialization 628ms, inference 4577ms and 4586ms.
- WASM two threads: initialization 652ms, inference 2330ms and 2473ms.
- Browser/PyTorch maximum absolute tensor error: 6.56e-7 for both configurations (PASS <1e-4).
- Dedicated worker heartbeat maximum gaps: 40ms and 25ms respectively. Responsive UI is not equivalent to fast completion.
- Two-thread run used a local cross-origin-isolated server; equivalent hosting headers/support on the live site were not established or changed.
- No usable WebGPU adapter was available. No GPU speedup is claimed, and software GPU emulation was not substituted as hardware evidence.
- No physical Android/iOS/Windows browser testing, peak-memory profiling, or broad color/skin-tone acceptance benchmark. No phone Auto Enhance reference supplied.
- Initial browser harness asset-path issue was fixed by setting the local ORT WASM path; final runs passed.
- Initial dataset file filter excluded Set5 BMP inputs. Corrected to explicitly admit BMP/PNG and assert expected suite sizes; only the missing 25 cases were added. Existing completed cases were retained. Final evidence includes all 90.

## Integration decision and next dependency
Keep production unchanged. The ML stage improves some compression errors but does not yet justify its latency or risks. Before integration, a candidate needs better rejection of structured patterns, held-out color/texture tests, materially better visible results on user examples, and real-device acceleration evidence. A smaller compression-specific model may be a better speed/quality tradeoff; no untested model is approved by this report. Do not add GFPGAN/CodeFormer, relax facial preservation, or silently substitute sharpening to make this experiment appear successful.

## Reproduction
Use external scratch directories for the pinned KAIR checkout, weights, dependencies and outputs. Requires Python with torch2.5.1+cpu, NumPy/Pillow; browser export additionally uses onnx1.17.0. Install Playwright1.55 and @napi-rs/canvas for the Node runners, ORT Web1.30.0 under the external lab's `npm` directory. No model or user-image uploads are performed.

```
python tests/experiments/enhance-cleanup/gated_trial.py --source /external/KAIR --weights /external/dncnn3.pth --output /external/results
node tests/experiments/enhance-cleanup/compare_pipeline.mjs /external/results
CLEANUP_TRIAL_ROOT=/external python tests/experiments/enhance-cleanup/test_gates.py
python tests/experiments/enhance-cleanup/export_browser_fixture.py /external
node tests/experiments/enhance-cleanup/browser_runtime.mjs /external
```

Optional private-dir input is solely for the two earlier manually masked local portrait fixtures; it is not generic automatic face handling. Resume requires the same experiment manifest. Browser runner expects `dncnn3.onnx`, `input.f32`, and `expected.f32` (296x296) beneath `/external`; see the export helper. Detailed metrics are in `cleanup-gate-results-2026-10-09.json`. Images and intermediate outputs are intentionally excluded from Git.
