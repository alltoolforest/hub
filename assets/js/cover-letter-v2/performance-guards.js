export const PERFORMANCE_BUDGETS = Object.freeze({
  resumeChars: 120000,
  jobDescriptionChars: 80000,
  letterChars: 8000,
  uploadBytes: 8 * 1024 * 1024,
});

export function inspectWorkload({ resumeText = "", jobDescription = "", letter = "" } = {}) {
  const measurements = {
    resumeChars: String(resumeText || "").length,
    jobDescriptionChars: String(jobDescription || "").length,
    letterChars: String(letter || "").length,
  };
  const exceeded = Object.entries(measurements)
    .filter(([key, value]) => value > PERFORMANCE_BUDGETS[key])
    .map(([key]) => key);
  return { ok: exceeded.length === 0, measurements, exceeded };
}

export function scheduleNonCriticalWork(callback, win = globalThis.window) {
  if (typeof callback !== "function") return () => {};
  if (win && typeof win.requestIdleCallback === "function") {
    const id = win.requestIdleCallback(callback, { timeout: 750 });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}
