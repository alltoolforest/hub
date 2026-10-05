# Photographic source intake — checkpoint 2026-10-05

Dependency work under authorization to continue the enhancer launch blueprint.
No production change or acceptance-gate relaxation.

## Actual progress

The NASA public API metadata and 122 preview image files were downloaded. Download
was interrupted before its final index; screen_downloads.py recovered the records
from the saved API snapshots and image bytes without repeating completed downloads.
Three selected entries (114, 124, 125) were unavailable at recovery.

Assistant visual screening excluded 29 unsuitable/out-of-scope scientific images,
charts, publication panels, composites and one near-identical event capture.
93 candidates remain in the private review archive, with source records, observed
SHA-256 hashes and an offline review page. Exact hashes are unique. The simple dHash
screen flagged zero additional pairs; that does not prove all captures independent.
Related portraits/crew captures still require grouping review before any split.

No demographics, damage, permission clearance, final grouping or train/evaluation
split is automatically inferred. This is a source pool, not 93 admitted acceptance
sources. The canonical benchmark manifest remains unchanged at zero admitted
sources. The 100-source, 70/30, portrait/mixed/real-damage requirements still apply.

The archive is retained privately for the user. No images or their metadata are
published in the repository. NASA media use policy and per-item metadata are
included for review; public availability is not a fabricated human clearance.
Reference: https://www.nasa.gov/nasa-brand-center/images-and-media/

## Files and use

- collect_nasa.py: bounded HTTPS downloads restricted to official NASA image hosts,
  same-host-policy redirects, image validation, provenance and duplicate hints.
- screen_downloads.py: deterministic recovery/screening from captured records;
  refuses to overwrite existing screening evidence.
- build_review.py: offline thumbnail review, optional local browser draft saving,
  source links and JSON review export; no upload/telemetry functionality.
- intake_test.py: URL/credential/host rejection and fingerprint repeatability tests.

Run collection with output outside the repository. Do not rerun it over the saved
intake. Resume from the retained archive instead. Further collection must address
coverage gaps rather than repeating the same 122 downloads.

```
python tests/image-enhancer-benchmark/intake/intake_test.py
python tests/image-enhancer-benchmark/intake/collect_nasa.py --out /private/intake
python tests/image-enhancer-benchmark/intake/screen_downloads.py --intake /private/intake --exclusions /private/screening.json
python tests/image-enhancer-benchmark/intake/build_review.py --intake /private/intake --out /private/deliverables
```

## Verification

PASS: 3/3 security/determinism tests; all 93 image hashes; unique IDs and exact
hashes; ZIP CRC; all full-image archive links; 93 review cards; generated JS syntax;
no fetch/XHR in offline review code; preserved production files. Review page was
not browser-interaction tested, so interactive controls remain unverified.
Prior model and browser audits were not repeated.

## Outstanding

- Genuine scratched/creased/faded photographs and broader everyday subject coverage.
- Item-level human permission/consent review, source grouping, severity/recoverability
  labels, controlled degradation recipes, human diversity review and locked 70/30 split.
- Full baseline processing, repeatability and portrait/phone-editor review.
- Model selection/device dependencies and Tasks 4–12 completion gates.

No image-restoration quality, human review, launch readiness, deployment or freeze
is claimed. Regression risk remains low: additions are isolated intake tools.
