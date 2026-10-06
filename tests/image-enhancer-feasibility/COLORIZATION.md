# Isolated optional colorization feasibility — 6 October 2026

Status HOLD. No application integration, interface change, default colorization,
new upload service or model redistribution. This addresses the existing blueprint
shortlist, not a new capability promise.

## Pinned sources

Repository `richzhang/colorization`, commit
`4f6009ed1495b1300231ebeb41cc4015557ddef7`:

- `colorizers/eccv16.py`, blob `896ed477c20934dc86a6088117eed63af773ace8`.
- `colorizers/base_color.py`, blob `00beb39e9f6f73b06ebea0314fc23a0bc75f23b7`.
- Pre/postprocessing checked against `colorizers/util.py`, blob
  `79968ba6b960a8c10047f1ce52400b6bfe766b9c`.
- `LICENSE`, blob `6187c76461a7725da199947701a0931af7a20b3f`, BSD-2-Clause
  code terms. Preserve notices if source/binaries are distributed. Checkpoint
  redistribution and full third-party applicability remain unclosed.

The upstream loader names
`https://colorizers.s3.us-east-2.amazonaws.com/colorization_release_v2-9b330a0b.pth`.
Observed size 128,976,165 bytes; full SHA-256
`9b330a0bae53f4ded77b1e23defbf78beaa09c10ebc4c4999e8e4f4a160b93f9`.
The probe verifies exact source Git blobs and checkpoint hash, omits only an unused
IPython import and package-relative import, and loads with `weights_only=True`,
strict state matching. No model arithmetic is changed. Sources/weights are external
inputs; neither is copied into this repository.

## Checks and measured limitations

The model receives only Lab L, never original a/b. Original L and resized RGB→L
preprocessing follow upstream. Predicted a/b are resized to original dimensions.
Two public development sources (astronaut, coffee) are not an acceptance corpus.

- PASS: ONNX checker; two original/ONNX chroma comparisons at rtol1e-4/atol1e-4,
  maximum difference 8.011e-5. Export opset17, FP32, 128,964,651 bytes.
- PASS: two ORT Web1.30 single-thread Node WASM runs match native chroma within
  3.624e-5 and repeat identically. About 2.65 seconds per 256×256 inference;
  537,176 KiB peak whole-process RSS (~525 MiB), Linux Xeon host. No phone claim.
- PASS: absent CLI opt-in exits before model/file access, including nonexistent
  model paths. This does not test a live checkbox.
- Observed: ordinary Lab→RGB clipping changes luminance by up to 8.43 L units.
  Experimental chroma reduction keeps L fixed, decreases a/b together until they
  fit the display gamut, and leaves already-in-gamut colors unchanged.
- PASS: four mapper tests: neutral black/gray/white, extreme chroma, in-gamut
  fidelity, invalid inputs and input ownership. Neutral white includes the
  reference library's ~0.000288 L matrix-rounding discrepancy.
- On the two photos, mapped maximum L difference is ~0.000288 before export and
  <0.237 after 8-bit quantization. This measures brightness, not color correctness.
- Assistant visual inspection of the astronaut output finds predicted tints across
  the suit/background/flag; no historical accuracy or manual acceptance is claimed.

The mapping prototype depends on scikit-image 0.25.2's conversion matrix. Browser
port parity, real old photographs, varied skin color, color bleeding, true default
grayscale preservation, cancellation, memory, rights and UI approval remain open.
Do not count this prototype as Task 10 completion or full architecture selection.

## Reproduce

Python dependencies: torch2.8.0+cpu, numpy, Pillow, scikit-image0.25.2,
onnx1.18.0, onnxruntime1.22.1. Models/output stay outside the public repository.

```sh
python tests/image-enhancer-feasibility/colorization_gamut_test.py
python tests/image-enhancer-feasibility/colorization_probe.py /private/reference /private/eccv16.pth /absolute/skimage/data /private/colorization-output --opt-in
node tests/image-enhancer-feasibility/colorization_wasm.cjs /private/colorization-output /absolute/onnxruntime-web /private/wasm-results.json
```

Reports: `colorization-results.json`, `colorization-wasm-results.json`.
No app or frozen-tool regression risk is introduced: these modules have no
production imports. Application CI passed at preceding checkpoint `0ca6867`.
