// Scheduling limits, not promises of end-to-end latency. A running WASM call
// cannot be interrupted here; initialization and export are outside this budget.
export class RestorationBudgetError extends Error {
  constructor() {
    super('AI restoration exceeds the interactive processing budget.');
    this.name = 'RestorationBudgetError';
  }
}

export function createRestorationBudget(caps, now = () => performance.now()) {
  const maxTiles = caps?.isMobile ? 64 : 256;
  const maxMs = caps?.isMobile ? 20000 : 45000;
  const started = now();
  return Object.freeze({
    check(total, completed = 0) {
      if (!Number.isSafeInteger(total) || total < 1 || total > maxTiles) {
        throw new RestorationBudgetError();
      }
      if (completed === total) return; // Keep a fully completed result.
      const elapsed = now() - started;
      // Require two samples so first-call compilation does not alone determine
      // the projection. Always enforce the elapsed scheduling limit.
      if (elapsed > maxMs || (completed >= 2 && completed < total && elapsed / completed * total > maxMs)) {
        throw new RestorationBudgetError();
      }
    }
  });
}
