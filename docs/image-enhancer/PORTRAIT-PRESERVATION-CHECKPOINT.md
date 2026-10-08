# Portrait preservation follow-up — 2026-10-08

Base: deployed PR131 merge 47fdeb3a998da529244eae5b891a6a46b58f80de.
Status: implementation candidate; NOT deployed or frozen.

## Decision
Use the supplied prompts as engineering constraints, not text inputs to NAFNet.
Keep independent photographic Enhance, NAFNet Deblur, and existing Real-ESRGAN
Upscale. No generative editor, geometry manipulation, blemish removal, relighting,
or invented facial detail. Upscale function remains byte-identical.

## Confirmed gaps and changes
- Enhance had a faces input that its main route never supplied. Explicit Portrait /
  face now runs the existing UltraFace locator (not a restoration model). Auto
  retains the verified model-free path. If no face can be localized, the whole
  portrait receives conservative texture protection; this is reported to the user.
- A feathered rectangular mask covers all of a detected face, including corners,
  with smooth falloff outside. Overlapping regions take the strongest protection.
- Face cleanup preserves more luminance texture while reducing chroma noise;
  local contrast and sharpening are restrained within protected regions. Portrait
  local contrast outside protection is increased within the existing +/-3 bound.
  Tone/white balance retain the audited photographic algorithms.
- Dedicated Deblur caps the restoration contribution to 25% inside detected face
  boxes, with feathering outside; pre-existing lower ceilings still apply. It
  refuses export if face detection or protected blending fails. No strong global
  fallback is substituted. Final artifact validation remains mandatory.
- No changes to frozen tools, navigation, model weights, or Upscale.

## Local evidence
- 28 numerical/lifecycle/reference tests PASS, including preservation of fine
  luminance texture with chroma cleanup, feathering, overlapping-mask behavior
  inherited by max composition, strip continuity, transparency, and Upscale hash.
- Actual worker fusion browser test PASS: zero face-ceiling violations across
  256px worker boundaries; final artifact guard safe.
- Photographic-only Chromium benchmark PASS. General/Auto metrics unchanged:
  noise RGB MAE 12.0254 -> 6.6342; underexposure 42.3571 -> 22.4231;
  compression 3.0380 -> 2.9985; low resolution 1.8149 -> 1.7732.
  These are existing reference gains, NOT new portrait quality evidence.
- Mode/cancellation browser test PASS, including forced detector network outage:
  portrait exports conservatively, Deblur refuses export, no stale download.

## Performance and limits
The added protection array is strip-sized and allocated only with face regions;
Auto enhancement does not acquire a model or that array. Portrait adds one cached
UltraFace inference and first-use model/runtime downloads. Per-pixel mask cost
scales with detected face count. No tile count or memory budget increase.

A detector can miss faces. Protection is not an exact identity guarantee or
semantic hair/fabric segmentation. We intentionally retain more blur and noise
in faces. The 25% cap is a conservative policy, not a validated identity metric.
Stronger outside-face local contrast still needs real portrait visual review.
Defocus/general restoration quality, large-mobile Deblur support, physical-device
latency, and phone Auto Enhance parity remain unresolved. No new real-photo
before/after quality claim is made from synthetic tests. Do not freeze this tool.

Deployment requires completion of candidate CI review and explicit user approval.
