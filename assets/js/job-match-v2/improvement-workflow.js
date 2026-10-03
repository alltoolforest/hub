function numericCoverage(state) {
  const value = state?.analysis?.jobMatch?.coverage?.percent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createSameSessionComparison() {
  let previousCoverage = null;
  let currentCoverage = null;

  return Object.freeze({
    record(state) {
      const nextCoverage = numericCoverage(state);
      if (currentCoverage !== null) previousCoverage = currentCoverage;
      currentCoverage = nextCoverage;
      return this.getComparison();
    },

    getComparison() {
      const delta = previousCoverage !== null && currentCoverage !== null
        ? Math.round((currentCoverage - previousCoverage) * 10) / 10
        : null;
      return Object.freeze({
        previousCoverage,
        currentCoverage,
        delta,
        direction: delta === null ? 'not_available' : delta > 0 ? 'improved' : delta < 0 ? 'decreased' : 'unchanged'
      });
    },

    clear() {
      previousCoverage = null;
      currentCoverage = null;
      return this.getComparison();
    }
  });
}

export function createImprovementWorkflow({ initialState = null, analyzeRevisedResume }) {
  if (typeof analyzeRevisedResume !== 'function') {
    throw new TypeError('Task 8 improvement workflow requires an analyzeRevisedResume callback.');
  }

  let currentState = initialState ? clone(initialState) : null;
  const comparison = createSameSessionComparison();

  if (currentState) comparison.record(currentState);

  return Object.freeze({
    getState() {
      return currentState ? clone(currentState) : null;
    },

    getComparison() {
      return comparison.getComparison();
    },

    async reanalyze(revisedResumeInput) {
      if (revisedResumeInput === undefined || revisedResumeInput === null || revisedResumeInput === '') {
        throw new TypeError('A revised resume file or pasted resume text is required for re-analysis.');
      }
      const nextState = await analyzeRevisedResume(revisedResumeInput, currentState ? clone(currentState) : null);
      if (!nextState?.analysis?.jobMatch) {
        throw new TypeError('Re-analysis must return a canonical ATS & Job Match analysis state.');
      }
      currentState = clone(nextState);
      comparison.record(currentState);
      return Object.freeze({
        state: clone(currentState),
        comparison: comparison.getComparison()
      });
    },

    startNewAnalysis() {
      currentState = null;
      comparison.clear();
      return null;
    },

    clearSensitiveData() {
      currentState = null;
      comparison.clear();
      return null;
    }
  });
}
