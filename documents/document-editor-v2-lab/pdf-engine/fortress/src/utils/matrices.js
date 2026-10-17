export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

export function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function translate(tx, ty) {
  return [1, 0, 0, 1, tx, ty];
}

export function scale(sx, sy = sx) {
  return [sx, 0, 0, sy, 0, 0];
}

export function applyToPoint(m, x, y) {
  return {
    x: x * m[0] + y * m[2] + m[4],
    y: x * m[1] + y * m[3] + m[5],
  };
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Non-invertible matrix');
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export function approxEqual(a, b, epsilon = 1e-6) {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= epsilon);
}
