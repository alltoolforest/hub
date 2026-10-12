# Task 1 — Benchmark infrastructure verified; corpus gate incomplete

User authorized sequential Tasks 1–12 on 2026-10-12. Task 0 is saved remotely at f803e10eb018dcfff995dec0feca69c06b59a6c6. Production remains protected.

## Implemented

- Permission-documented seed corpus: astronaut, coffee and chelsea from scikit-image v0.19.3. Public domain/CC0 documentation, exact input SHA-256 and native ROI coordinates recorded in benchmark/sources.json.
- Four variants per photo: original, seeded noise, synthetic underexposure and JPEG45; plus a separate synthetic alpha diagnostic. 13 cases, not 13 independent photos.
- Offline preparation, unchanged-PR171 runner, native-size ROI render helper and failure-path tests. Original images and generated pixels stay outside Git; only public provenance and numerical results are saved in the experiment.
- Predeclared quality-review methodology and provisional performance limits in benchmark/PROTOCOL.md. Defined held-out exclusion, tie handling, independent raters and critical failures. Budgets require real-device qualification.
- Existing candidate and baseline remain byte-identical; no Task 2–12 code or engine modifications.

## Verification

PASS: 13/13 cases deterministic across three measured repetitions and a second independent benchmark invocation. Input hashes unchanged; RGBA output length and alpha preserved. PASS: five harness rejection checks for wrong input hash, held-out access, shape mismatch, invalid ROI and output inside repository. PASS: Task 0 checksum/protected-path gate.

The 29 baseline and 29 candidate inherited tests passed at Task 0; engine bytes have not changed. They were not needlessly rerun. Harness is offline Node v24.19.0 + Python Pillow/numpy. No browser, physical mobile, peak-memory or 32MP qualification is claimed.

## Baseline observations

On three synthetic noise cases, PR171 reduced clean-reference RGB MSE (58.25→33.23, 60.92→30.84, 63.97→54.63). Three synthetic underexposure cases also improved this metric. All three JPEG45 cases worsened it (43.19→50.22, 61.51→63.82, 28.56→65.45). Tone/color changes confound these scores; these are diagnostic leads, not proof of visual benefit or identity safety. Native astronaut JPEG face crop inspected; small sample resolution cannot establish realistic skin/hair restoration.

Original astronaut processing newly clipped 2,865 high-valued channel samples; coffee 341; chelsea zero. These are individual RGB channels, not pixels or confirmed lost photographic detail. Highlight behavior belongs in later quality review.

## Blocking evidence

- No verified original/phone Auto-editor pairs or phone/editor settings.
- Only three small public samples (0.14–0.26MP): insufficient for diverse real-photo requirements and native mobile-resolution behavior.
- No representative untouched held-out corpus yet. No blinded human votes.
- ROI grain and perceptual color/halo review need properly labeled real source regions; current metrics are insufficient to certify them.

Required next input: at least five original, full-resolution images paired with the phone's Auto-enhanced export: portrait, low-light, backlit person, hair/fabric and daylight everyday scene. Include phone model and editor/version/settings, without screenshots or messaging recompression. Additional permission-cleared categories and held-out photos still required for final qualification; five pairs are a starting batch, not release acceptance.

Task 1 is PARTIAL / BLOCKED ON INPUTS. Tasks 2–12 remain queued in order. Advancing into algorithm tuning now would bypass the user's baseline-measurement gate. Production regression risk remains minimal: all changes confined to the experiment and no engine bytes changed.
