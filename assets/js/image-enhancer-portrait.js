// Spatial protection only: no face generation, warping, beauty edits or color rules.
// Cover the complete detected rectangle, then feather outside it to avoid seams.
export function portraitProtectionAt(x, y, faces = []) {
  let protection = 0;
  for (const face of faces) {
    if (![face.x, face.y, face.width, face.height].every(Number.isFinite) || face.width <= 0 || face.height <= 0) continue;
    const dx = Math.max(face.x - x, 0, x - (face.x + face.width));
    const dy = Math.max(face.y - y, 0, y - (face.y + face.height));
    const distance = Math.max(dx / Math.max(2, face.width * .2), dy / Math.max(2, face.height * .2));
    const t = Math.max(0, 1 - distance);
    protection = Math.max(protection, t * t * (3 - 2 * t));
  }
  return protection;
}
