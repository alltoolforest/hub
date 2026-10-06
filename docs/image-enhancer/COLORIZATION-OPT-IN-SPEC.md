# Conditional minimum colorization controls

Launch Completion Blueprint Task 10 requires exact opt-in controls to be reviewed
before changing the protected interface. This is a proposal, not approval or a
live UI change. Implement only after model, rights, quality and runtime gates pass.

## Proposed additions

1. One unchecked checkbox beside existing restoration controls:
   **Add plausible color to this black-and-white photo**.
   Helper text: **Colors are AI predictions and may differ from the original.
   Your grayscale version is kept.**
2. After successful optional colorization, a two-choice result selector:
   **Restored grayscale** / **Colorized**. The existing download action exports
   the selected result using the existing format/dimension controls. Colorized
   is initially selected only because the user explicitly requested it.

No navigation, other tools, existing size/format controls or workspace redesign.
These two additions require the blueprint's explicit approval for protected UI.

## Required behavior

- New photo and Reset clear the checkbox. Never infer opt-in from grayscale,
  remember it across photos, or enable it through enhancement presets.
- No colorization model download unless this photo is explicitly opted in and
  eligible. Once an artifact is selected, disclose its actual first-use download
  size beside the checkbox; do not ship the experimental size as a final promise.
- Default Enhance leaves grayscale grayscale. Keep original and restored grayscale
  independent of optional colorized output. A colorization failure retains the
  restored grayscale result and reports that color could not be added.
- Do not run on transparent inputs, uncertain grayscale classification or unsupported
  dimensions until their preservation/eligibility tests pass. Explain in plain
  language why the option is unavailable rather than silently stripping alpha.
- Cancellation discards unfinished color output, preserves grayscale and does not
  leave a misleading successful-colorization status. Repeated requests do not
  recolor already colorized pixels.
- Use native checkbox and keyboard-operable radio controls with visible focus,
  programmatic labels, and the existing polite progress/status mechanism.
- Describe output only as plausible color. Never claim historical color recovery,
  verified skin color or exact reconstruction of missing detail.

## Acceptance still required

Fixed real/synthetic grayscale cohort; skin plausibility, bleeding and luminance
review; original/grayscale ownership; default/no-download; reset/repeated jobs;
failure/cancellation; keyboard/screen reader; export and physical-device budgets.
The isolated Python/Node diagnostic is not implementation or acceptance of this UI.
