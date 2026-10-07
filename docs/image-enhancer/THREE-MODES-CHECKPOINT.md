# Three task modes — 7 October 2026

User explicitly approved separating Deblur, Enhance and Upscale, retaining full
blueprint quality requirements. Base: e06c849, the deployed speed-protection fix.
Their manual feedback: faster execution, no noticeable restoration improvement.
That feedback is a failed quality acceptance, not authorization to lower quality.

Candidate behavior:
- Deblur explicitly invokes NAFNet at original size, even if automatic diagnosis
  is uncertain; no SR, color/tone finishing or general enhancement fallback.
  Existing face fusion, numerical validation and final artifact guard remain.
  Unsupported input or exceeded runtime budget produces no restored download.
- Enhance retains restoration routing. Where blur reconstruction is eligible,
  it uses 60% of the existing bounded contribution in the SAME fusion pass, then
  existing region refinement and sharpening without extra global tone contrast.
  This conservative contribution is provisional; it is not an accepted quality
  level or a claim that missing structures can be faithfully reconstructed.
- Upscale implementation is byte-for-byte unchanged. Mode switching, hidden
  controls, reset, filename and error handling are tested separately.

Tests: 19 existing budget/lifecycle/fusion unit tests pass. Dedicated deblur
quality/engine tests now exercise Deblur mode, with existing thresholds intact.
The old blur cohort likewise exercises explicit Deblur; the other cohorts retain
Enhance. New browser coverage verifies three-mode switching, 612-tile refusal
before model download, no false restored export, reset, and mild fusion bounds.
Full CI and manual quality acceptance remain necessary before release.

Open blockers: this interface/routing work does not select a better or faster
model. Large-image full-detail deblur, portrait quality, broader restoration,
physical-device performance, corpus/rights and full blueprint gates remain open.
Keep personal photos private. Do not deploy or freeze this as a complete solution.
