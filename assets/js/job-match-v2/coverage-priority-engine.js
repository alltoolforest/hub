import { calculateJobRequirementCoverage } from './coverage-model.js';
import { createPriorityRecommendations } from './prioritization-engine.js';

export function analyzeCoverageAndPriorities(state) {
  if (!state?.analysis?.jobMatch || !Array.isArray(state.analysis.jobMatch.findings)) {
    throw new TypeError('Completed job-match findings are required before Task 7 coverage analysis.');
  }

  const findings = state.analysis.jobMatch.findings;
  const coverage = calculateJobRequirementCoverage(findings);
  const recommendations = createPriorityRecommendations(findings);

  return Object.freeze({
    coverage,
    priorityRecommendations: recommendations,
    diagnostics: Object.freeze({
      requirementCount: findings.length,
      assessableRequirementCount: coverage.overall.assessableCount,
      excludedRequirementCount: coverage.overall.excludedCount,
      highPriorityCount: recommendations.filter((item) => item.priority === 'high').length,
      mediumPriorityCount: recommendations.filter((item) => item.priority === 'medium').length,
      optionalPriorityCount: recommendations.filter((item) => item.priority === 'optional').length
    })
  });
}

export function applyCoverageAndPrioritiesToState(state, result) {
  if (!state?.analysis?.jobMatch || !result?.coverage || !Array.isArray(result.priorityRecommendations)) {
    throw new TypeError('A canonical analysis state and Task 7 coverage result are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.analysis.jobMatch.coverage = {
    ...result.coverage,
    weighting: {
      ...result.coverage.weighting,
      importance: { ...(result.coverage.weighting?.importance || {}) },
      categoryMultiplier: { ...(result.coverage.weighting?.categoryMultiplier || {}) }
    },
    evidenceCredit: { ...(result.coverage.evidenceCredit || {}) },
    overall: { ...(result.coverage.overall || {}) },
    groups: Object.fromEntries(
      Object.entries(result.coverage.groups || {}).map(([key, value]) => [key, { ...value }])
    ),
    contributions: Array.isArray(result.coverage.contributions)
      ? result.coverage.contributions.map((item) => ({ ...item }))
      : [],
    excluded: Array.isArray(result.coverage.excluded)
      ? result.coverage.excluded.map((item) => ({ ...item }))
      : []
  };

  next.analysis.priorityRecommendations = result.priorityRecommendations.map((item) => ({ ...item }));
  next.analysis.jobMatch.diagnostics = {
    ...(next.analysis.jobMatch.diagnostics || {}),
    coverageAssessableCount: Number(result.diagnostics?.assessableRequirementCount || 0),
    coverageExcludedCount: Number(result.diagnostics?.excludedRequirementCount || 0),
    highPriorityCount: Number(result.diagnostics?.highPriorityCount || 0),
    mediumPriorityCount: Number(result.diagnostics?.mediumPriorityCount || 0),
    optionalPriorityCount: Number(result.diagnostics?.optionalPriorityCount || 0)
  };

  return next;
}
