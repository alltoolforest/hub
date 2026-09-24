import { applyToPoint, invert } from './matrices.js';

export function pdfRectToScreen(matrix, rect) {
  const p1 = applyToPoint(matrix, rect.x, rect.y);
  const p2 = applyToPoint(matrix, rect.x + rect.width, rect.y + rect.height);
  return {
    left: Math.min(p1.x, p2.x),
    top: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

export function screenPointToPdf(matrix, x, y) {
  const inv = invert(matrix);
  return applyToPoint(inv, x, y);
}
