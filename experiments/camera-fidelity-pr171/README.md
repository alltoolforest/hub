# Camera-Fidelity Enhancement — Task 0

Exact PR #171 head: `a672855f9c4047dafe31cd0823cfeb7de2bb04f7`.
PR #171 merge: `ff5db8817c138df648969340f4009ecee0a44560`.
Experimental branch: `experiment/camera-fidelity-pr171-task0`.

`baseline/` is the preserved source. `candidate/` starts byte-identical and is reserved for future authorized development. Both retain relative file paths so the engine → worker → photo → portrait dependency chain resolves within each copy. Four engine modules, two existing test suites and one integration reference are preserved in each. No Rocket/Hybrid code, model download, UI, route or deployment integration is introduced.

The caller remains responsible for decoded input, options and detected face rectangles. Face detection, application UI and export orchestration are not part of the photographic engine snapshot. The full upstream source remains accessible at the pinned Git commit. The integration reference is not a standalone application.

Verification (repository root):

```sh
python experiments/camera-fidelity-pr171/verify-baseline.py --task0
(cd experiments/camera-fidelity-pr171/baseline && node --test tests/image-enhancer-photo.test.mjs tests/image-enhancer-photo-lifecycle.test.mjs)
(cd experiments/camera-fidelity-pr171/candidate && node --test tests/image-enhancer-photo.test.mjs tests/image-enhancer-photo-lifecycle.test.mjs)
chmod -R a-w experiments/camera-fidelity-pr171/baseline
```

Remove `--task0` only after later candidate modifications are authorized. Never regenerate the manifest to accept a changed baseline. Local read-only permissions do not persist in Git; reapply after checkout. Checksums and comparison against the immutable source commit detect modifications but are not GitHub branch protection.

Existing synthetic and mocked lifecycle tests establish copy integrity and inherited behavior only. They do not establish photographic superiority, physical-device compatibility or 32MP reliability. Those belong to later tasks. No production release is authorized.
