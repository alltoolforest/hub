export const PROCESSING_SPECS = Object.freeze({
  enhancement: Object.freeze({
    id: 'enhancement',
    title: 'Image Enhancement Engine',
    sourceOfTruth: String.raw`IDENTITY-PRESERVING PROFESSIONAL PORTRAIT RETOUCH — EDIT THE ORIGINAL IMAGE, DO NOT RECREATE THE PERSON.
Use the uploaded photograph as the strict identity and geometry reference. Preserve the person exactly as photographed. The final image must remain unmistakably the same person, with the original facial geometry and natural asymmetries intact.
Highest priority — facial identity lock:
Do not regenerate, reinterpret, beautify, reshape, reconstruct, or replace the face. Preserve the exact face shape, forehead, hairline, eyebrows, eye shape and spacing, eyelids, pupils, nose shape and width, nostrils, cheeks, jawline, chin, ears, mouth, smile, lip shape, teeth if visible, and all natural facial proportions. Preserve the exact expression and direction of gaze.
Preserve all identifying details including moles, beauty marks, skin folds, natural asymmetry, pores, fine lines, hair strands, bindi, nose jewelry, earrings, and other unique characteristics. Do not remove, relocate, enlarge, reduce, or invent identifying marks.
This is retouching, not face generation. If a facial detail is unclear in the source image, preserve it as-is rather than inventing a sharper replacement. Do not perform AI face restoration that synthesizes new eyes, eyelashes, eyebrows, lips, teeth, skin, or facial contours.
Perform only subtle professional portrait enhancement. Gently reduce distracting noise and minor temporary skin imperfections while retaining authentic skin texture and visible pores. Avoid plastic skin, excessive smoothing, beauty-filter effects, makeup changes, complexion changes, skin-lightening, or artificial facial sharpening.
Improve exposure, white balance, dynamic range, local contrast, and tonal depth while retaining the original photographic appearance. Apply subtle Rembrandt-inspired lighting through tonal enhancement only—do not change the physical direction of existing light, generate new shadows across the face, or reshape facial features with lighting.
Apply sophisticated natural color grading with accurate, true-to-life skin tones, controlled highlights, clean shadows, realistic saturation, and rich but believable colors. Preserve the original sari colors, fabric patterns, jewelry, hairstyle, body proportions, hands, pose, background, framing, and perspective.
Increase clarity and micro-contrast primarily in the hair, jewelry, sari embroidery, fabric, and background details. Apply only restrained sharpening to facial skin. Avoid halos, oversharpening, fake pores, generated texture, painterly details, or artificial edge enhancement.
Improve apparent resolution and photographic cleanliness while preserving the information contained in the original photograph. Do not invent detail merely to simulate 8K resolution.
Composition lock: Do not crop, reposition, rotate, change the pose, alter body shape, modify clothing, replace jewelry, change hairstyle, modify the background, or add/remove objects unless necessary to correct a genuine photographic artifact.
Final quality target: a high-end professional RAW photo retouch of the original photograph—not a newly generated portrait. The result should look like the exact same camera photograph processed expertly by a professional portrait retoucher.
Priority order:

1. Identity preservation → 2. facial geometry preservation → 3. natural skin texture → 4. photographic realism → 5. lighting/color improvement → 6. clarity/sharpness.
If any enhancement risks changing the person's identity or facial details, skip that enhancement and preserve the original feature instead.
For your particular photos, I would also avoid wording such as “crisp 8K facial details,” “face recovery,” “perfect skin,” or “dramatically improve the face.” Those instructions tend to encourage reconstruction. “Preserve unclear details rather than inventing them” is especially important when your goal is zero facial-feature loss.`,
    outputCriteria: Object.freeze([
      'Same identity and facial geometry',
      'Same composition and resolution',
      'No generative face reconstruction',
      'Subtle tonal, color, noise and micro-contrast improvement',
      'Facial sharpening remains restrained'
    ])
  }),
  deblur: Object.freeze({
    id: 'deblur',
    title: 'Deblur Engine',
    sourceOfTruth: String.raw`UNBLUR-ONLY PHOTO RESTORATION — STRICT FACE PRESERVATION
Deblur and clarify the uploaded image while preserving the original photograph exactly.
Primary objective: reduce blur, motion softness, and focus softness as much as safely possible. The result should look like the same original photograph captured with better focus—not like a regenerated or recreated image.
STRICT FACIAL LOCK — HIGHEST PRIORITY
Do not modify, regenerate, reconstruct, reinterpret, beautify, enhance, reshape, or replace any face.
Preserve every face exactly as it exists in the source image, including:
exact face shape and proportions
forehead and hairline
eyebrows
eye shape, eye size, eye spacing, eyelids, pupils, and gaze
nose shape, width, bridge, nostrils, and position
cheeks, jawline, chin, and ears
mouth shape, lips, smile, teeth if visible, and expression
skin tone, natural asymmetry, moles, marks, wrinkles, pores, and other identifying characteristics
Do not invent facial information that is not clearly visible in the original image.
If the eyes, eyelashes, eyebrows, lips, skin texture, hairline, or other facial details are blurred or uncertain, keep those details conservative and faithful to the source rather than guessing or synthesizing new information.
Do not use AI face restoration, face enhancement, face recovery, beauty filtering, portrait reconstruction, or generative facial sharpening.
Apply deblurring only to recover detail that is genuinely supported by the original pixels. If stronger deblurring would risk changing a person's identity or facial geometry, leave that area slightly soft instead.
Improve clarity naturally in non-facial areas such as:
hair
clothing and fabric texture
jewelry
hands
objects
background
edges and patterns
Facial regions may receive only minimal, conservative deblurring that does not change any feature.
Preserve the original:
people and identities
pose and body proportions
expressions
hairstyle
clothing
background
objects
framing and composition
perspective
lighting direction
shadows
color balance and overall mood
Do not crop, zoom, rotate, reposition, add, remove, replace, or redesign anything.
Do not add artificial depth of field, simulated lens blur, studio lighting, HDR effects, artificial glow, skin smoothing, makeup changes, or cinematic relighting.
Do not upscale merely for the sake of resolution. Output resolution is secondary and may remain close to the original. The priority is safe deblurring and faithful preservation, not 4K or 8K output.
Final target: produce the same photograph with reduced blur and improved natural clarity while keeping every person's face, identity, expression, and facial geometry unchanged.
Priority order:
Facial identity preservation
Facial geometry preservation
No invented facial details
Safe blur reduction
Natural clarity improvement
Everything else
Critical rule: If there is any conflict between stronger deblurring and facial accuracy, preserve the original facial appearance and accept some remaining blur.
The most important sentence is: “If stronger deblurring would risk changing a person's identity or facial geometry, leave that area slightly soft instead.” That tells the model that preserving the face is more important than achieving maximum sharpness.`,
    outputCriteria: Object.freeze([
      'Same identity, geometry, composition and resolution',
      'No face restoration or synthesized facial detail',
      'Blur reduction only',
      'Faces are deliberately allowed to remain softer than non-face regions',
      'When fidelity conflicts with sharpness, fidelity wins'
    ])
  })
});

export function getProcessingSpec(mode) {
  const spec = PROCESSING_SPECS[mode];
  if (!spec) throw new Error(`Unknown processing mode: ${mode}`);
  return spec;
}
