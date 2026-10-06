# Guarded cleanup diagnostic — 5 October 2026

Isolated Task 4 dependency experiment, not production integration or launch approval.
It connects the pinned WDN candidate to the Task 3 contract, existing face identity
protection and existing final artifact guard. No production source is modified.
The experiment loads only the required model, checks its exact export hash, keeps
original pixels independent, and releases the WASM session after success/failure
or cooperative cancellation. It executes cleanup once per call; repeated-job
idempotence and automatic degradation detection are not established.

## Reproduce

Use the fixtures/export from `../image-enhancer-feasibility/cleanup_trial.py`,
Node 22+, `@napi-rs/canvas` 0.1.100 and `onnxruntime-web` 1.30.0. Install these in
an isolated diagnostic environment, not the application dependency tree.

```sh
node tests/image-enhancer-cleanup/run.mjs /private/trial /private/trial/wdn.onnx /absolute/path/to/onnxruntime-web /private/guarded-cleanup
node --test tests/image-enhancer-orchestration/orchestrator.test.mjs
```

Output must be outside the repository. Only numerical results are committed;
no photographs or model weights are redistributed. Native canvas is a diagnostic
shim and does not establish browser fidelity, device memory or responsiveness.
The synchronous model execution is awaited; cancellation rejects its result after
completion, rather than promising an interruptible kernel.

## Observed result

Six photographic cases passed execution/source-ownership assertions. Both clean
controls bypassed inference and stayed byte-identical. All four noisy/JPEG cases
had lower final RGB MAE against their paired reference (0–255 units):

| Case | Input | Final | Guard fallback stages |
|---|---:|---:|---:|
| Coffee / noise | 9.202 | 7.008 | 0 |
| Coffee / JPEG | 9.646 | 8.203 | 0 |
| Astronaut / noise | 8.808 | 6.747 | 1 |
| Astronaut / JPEG | 10.499 | 9.598 | 1 |

Raw astronaut JPEG error worsened to 10.677 before the guards. Keep that failure
visible: output metrics alone conceal the reconstruction tradeoff. These outputs
use native canvas downsampling, unlike the earlier Python Lanczos diagnostic;
values from the two resamplers are not interchangeable model-quality evidence.

Ten negative/lifecycle cases passed: declared text, alpha, grayscale and absent
detector; wrong model hash; cancellation before load, after real session load and
after real inference; undeclared transparent pixels; and exhausted pixel budget.
Session loads/releases matched. Twelve existing orchestration tests also passed.

## Limitations and decision

HOLD production integration. Two sources are not the locked acceptance corpus.
Portrait coordinates and degradation evidence are manually supplied. Diagnostic
text=false is deliberately supplied despite potential clothing lettering; this
does not prove text protection. Unsupported contexts return the source. No human
identity/texture/usefulness acceptance, repeated cleanup, full finishing pipeline,
heavy/repeated JPEG, full-size performance or physical-device gate is satisfied.
The loader's `approved` flag authorizes this injected experiment only, not model
rights, production admission, or Task 4 completion.

## Portrait-route dependency check

GFPGAN pinned at `7552a7791caad982045a7bbe5634bbf1cd5c8679` remains HOLD.
Its `gfpgan/archs/gfpganv1_clean_arch.py` imports `StyleGAN2GeneratorClean` from
`stylegan2_clean_arch.py`. Its LICENSE lists third-party exceptions, including
StyleGAN2. The clean architecture label cannot establish clearance for the exact
implementation and weights. No export or production adoption was performed.
Resolve applicability before selecting this route; do not infer a blanket legal
conclusion from the dependency name. Official source:
https://github.com/TencentARC/GFPGAN/tree/7552a7791caad982045a7bbe5634bbf1cd5c8679
