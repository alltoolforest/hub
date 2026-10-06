# Original NAFNet reference for isolated parity diagnostics

Source: https://github.com/megvii-research/NAFNet/tree/2b4af71ebe098a92a75910c233a3965a3e93ede4

Copyright notices are retained; the upstream LICENSE is included here.
Local modifications on 6 October 2026:

- `architecture.py` comes from `basicsr/models/archs/NAFNet_arch.py`
  (Git blob `5735e0963b4b1db46f34807e6607c04e70702e91`). Imports point to
  sibling modules; the executable profiling example was removed; trailing whitespace was stripped.
- `layer_norm.py` extracts unchanged `LayerNormFunction` and `LayerNorm2d`
  from `basicsr/models/archs/arch_util.py`
  (Git blob `09beabfb4fb14e5323dc2a6a4234bddbd43138c2`). Unrelated helpers
  and their dependencies were omitted.
- `local_arch.py` is the upstream local pooling implementation with trailing whitespace stripped.
- `__init__.py` is a local empty package marker.

Original checkpoint: `NAFNet-GoPro-width32.pth`, linked by upstream `docs/GoPro.md`
at the same source commit, Google Drive ID `1Fr2QadtDCEXg6iwWX8OzeZLbHOx2t5Bj`.
Size 68,671,121 bytes; SHA-256:
`19394e6155d12ef6371d1d57496f87f0ec88f92bdffa27c0792690722d5d1a5c`.
Loaded using `torch.load(weights_only=True)` and strict state-dictionary matching.
Weights are not included or approved here for production redistribution.

This reference is not imported by the application or used to create a replacement
model. It provides a reproducible original-weight comparison for model feasibility.
