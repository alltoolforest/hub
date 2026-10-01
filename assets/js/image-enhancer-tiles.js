export function tileCorePlan(caps) {
  const first = caps?.webgpu ? 160 : caps?.isMobile ? 72 : 96;
  const candidates = caps?.webgpu
    ? [first, 112, 80, 56]
    : caps?.isMobile
      ? [first, 56, 48]
      : [first, 72, 48];
  return Object.freeze([...new Set(candidates.filter(value => Number.isFinite(value) && value >= 48))]);
}

export function isMemoryPressureError(error) {
  if (!error) return false;
  if (error instanceof RangeError) return true;
  const name = String(error.name || '').toLowerCase();
  const message = String(error.message || error).toLowerCase();
  if (name.includes('quota') || name.includes('memory')) return true;
  return /out of memory|\boom\b|memory pressure|allocat(?:e|ion)|array buffer|gpu buffer|texture allocation|resource exhausted|insufficient memory/.test(message);
}
