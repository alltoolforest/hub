# R5 development checkpoint: PR171 core with optional controls

2026-10-12. Build `cf-20261012-controls-r5`. User authorized PR171 core + adjustable R3 tone + carefully gated detail, keeping the experiment on its development branch until a consistent advantage is demonstrated.

**Implemented in the experimental worker and interface. Not deployed. The owner-private hosted page still runs the previous build recorded in PRIVATE-PREVIEW.json. Production promotion remains NO-GO.**

## Behavior

- Defaults: PR171 Auto tone; brightness, contrast and extra detail all zero. No extra processing modifies pixels. The separate baseline engine ignores candidate controls, including malformed/unreviewed candidate detail selections.
- Candidate tone starting point: PR171 Auto or restrained R2 (deeper shadows). Brightness and contrast are independent 0–100 controls, mapped to the tested R3 curve bounds. The R3 brighter shortcut chooses restrained tone and both tone controls at 100, with detail off. Reset PR171 removes all candidate adjustments.
- Extra detail is opt-in, adjustable 0–100, and uses the R4 source-guided two-scale stage. The original decoded pixels remain the structural guide.
- Detail requires an explicit no-faces declaration or valid protected face rectangles. The UI supports one enclosing rectangle, which can cover all faces; the API supports up to 64. Coordinates use decoded, orientation-corrected native pixels. Detail makes no changes inside these supplied regions relative to the tone-processed core output. Tone changes still apply there. The outer feather remains 12 pixels.
- Detail is withheld for JPEG files because R4 regressed those cases; for text/graphics; for portrait mode without protected regions; or when PR171 estimates noise >2.5, chroma noise >3, or block strength >0.1. These numeric thresholds are conservative engineering choices, not a validated degradation classifier. PNG/WebP files can contain previously introduced JPEG artifacts, so file type is not a sufficient quality guarantee.
- JPEG images still support tone adjustment. The status/diagnostics explain when requested detail was skipped. An unreviewed detail request or invalid region fails before output generation.
- Face review and detail reset for each new image. Candidate controls are disabled during processing and in baseline-only mode. Settings changes require pressing Process photograph again; existing downloads retain their earlier result until reprocessing.

## Implementation

`photo-controls.js` validates and composes the retained research stages. The worker preserves the original fixed 96-row statistics pass. With detail enabled, it reads a 14-pixel halo, renders the core over the expanded detail region, applies tone and source-guided detail, and crops only afterward. This avoids an extra full-resolution canvas and preserves strip-boundary equivalence. Memory estimates include a larger strip working allowance when detail is requested. Estimates are still not device-memory guarantees.

`photo-budget.js`, the worker, build ID, UI HTML/JS/CSS and R4 amount control changed. The PR171 photo core, portrait helper, frozen baseline, manifest and repository-root tools remain untouched. The packaging dependency graph now includes R2/R3/R4 modules intentionally through validated controls; older rejected `photo-trials.js` remains excluded.

A small confirmed UI mapping bug was fixed: Text / graphics previously sent `text`, which the core did not recognize as a graphic mode. It now sends the supported `text-logo` value for both engines. This affects only the experimental interface.

## Verification

36 distinct targeted tests passed across affected runs:

| Group | Passed |
|---|---:|
| Controls validation/composition/memory | 4 |
| UI event/state wiring test double | 2 |
| Worker PNG/orchestration test double | 11 |
| Worker lifecycle/cancellation | 9 |
| Memory budget/preflight | 5 |
| R4 detail contracts, including zero strength | 5 |

The composed default matched all 13 retained PR171 calibration hashes. The composed R3 brighter preset matched all 14 retained R3 hashes, including the user portrait. See `benchmark/CONTROLS-R5-EQUIVALENCE.json`. These comparisons verify integration, not a newly established photographic advantage.

Combined core/tone/detail processing matched a full-frame reference at 16-, 37- and 96-row partitions. Tests verify that annotated face interiors are unchanged by detail, invalid settings fail, and the baseline ignores candidate adjustments. UI-state tests cover presets, reset, baseline-only disabling, new-image review reset and text/graphics mapping.

JavaScript syntax, HTML ID/label references and the closed local import graph passed static checks. Baseline hash/scope verification and diff whitespace checks passed. No tests were added to or edits made in frozen tools.

## Remaining gates and risk

This update integrates previously tested choices; it does not resolve their known quality limitations. R3 may over-brighten normal exposure; R4 remains a research sharpening stage with noise/JPEG risks. Face review is manual and can be inaccurate. No automatic detector or exact source-identity guarantee is claimed.

The UI and worker tests use doubles, not real browser layout/Canvas/color-management behavior. Physical Android/iOS/desktop end-to-end tests, touch use of face coordinates, native 32MP export, repeated-job memory, browser cancellation and held-out/phone-editor quality comparisons remain pending. No new runtime benchmark is claimed.

Only the development branch is updated. Publishing this private preview is a separate next step; no production release approval is implied. Rollback is the previous development checkpoint (`6957c29f9aa8d127073f76bdf0d01f07478e3a0e` remotely), or simply zero all adjustments to retain PR171-equivalent processing. Preserve existing evidence when reverting.
