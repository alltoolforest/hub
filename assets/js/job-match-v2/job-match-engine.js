import {
  ANALYSIS_AREA,
  CONFIDENCE_LEVEL,
  FINDING_STATUS,
  PROVENANCE_KIND,
  RUN_STATUS,
  createFinding
} from './contracts.js';
import { buildResumeEvidenceIndex } from './resume-evidence-index.js';
import { evaluateRequirementEvidence } from './evidence-engine.js';

function confidenceFor(findings) {
  if (!findings.length) return CONFIDENCE_LEVEL.NONE;
  const high = findings.filter((item) => item.confidence === CONFIDENCE_LEVEL.HIGH).length;
  const low = findings.filter((item) => item.confidence === CONFIDENCE_LEVEL.LOW).length;
  if (high === findings.length) return CONFIDENCE_LEVEL.HIGH;
  if (low === findings.length) return CONFIDENCE_LEVEL.LOW;
  return CONFIDENCE_LEVEL.MEDIUM;
}

function findingFromEvaluation(requirement, evaluation) {
  const base = createFinding({
    id: 'job-match-' + requirement.id,
    area: ANALYSIS_AREA.JOB_MATCH,
    status: evaluation.status,
    title: requirement.label,
    sourceText: requirement.sourceText || requirement.label,
    evidence: evaluation.evidence || [],
    confidence: evaluation.confidence,
    provenance: PROVENANCE_KIND.DERIVED,
    explanation: evaluation.explanation
  });

  return Object.freeze({
    ...base,
    requirementId: requirement.id,
    requirement: requirement.label,
    requirementSourceText: requirement.sourceText || requirement.label,
    importance: requirement.importance,
    category: requirement.category,
    conceptId: requirement.conceptId || '',
    evidenceDetails: Object.freeze((evaluation.evidence || []).map((item) => Object.freeze({ ...item }))),
    experienceDuration: evaluation.experienceDuration || null,
    requiredMonths: evaluation.requiredMonths ?? null
  });
}

export function analyzeJobMatch(state, options = {}) {
  if (!state?.resume || !state?.jobDescription) {
    throw new TypeError('A canonical analysis state with resume and job-description data is required.');
  }

  const requirements = Array.isArray(state.jobDescription.requirements)
    ? state.jobDescription.requirements
    : [];
  const index = buildResumeEvidenceIndex(state.resume.extractedText || '');
  const findings = [];

  for (const requirement of requirements) {
    const evaluation = evaluateRequirementEvidence(requirement, index, options);
    findings.push(findingFromEvaluation(requirement, evaluation));
  }

  const counts = {
    requirementCount: findings.length,
    matchedCount: findings.filter((item) => item.status === FINDING_STATUS.MATCHED).length,
    partialCount: findings.filter((item) => item.status === FINDING_STATUS.PARTIAL).length,
    notFoundCount: findings.filter((item) => item.status === FINDING_STATUS.NOT_FOUND).length,
    uncertainCount: findings.filter((item) => item.status === FINDING_STATUS.UNCERTAIN).length,
    notApplicableCount: findings.filter((item) => item.status === FINDING_STATUS.NOT_APPLICABLE).length
  };

  return Object.freeze({
    findings: Object.freeze(findings),
    evidenceFindings: Object.freeze(findings.map((item) => Object.freeze({
      requirementId: item.requirementId,
      requirement: item.requirement,
      importance: item.importance,
      category: item.category,
      status: item.status,
      confidence: item.confidence,
      evidence: Object.freeze(item.evidenceDetails.map((evidence) => Object.freeze({ ...evidence }))),
      explanation: item.explanation
    }))),
    confidence: confidenceFor(findings),
    diagnostics: Object.freeze(counts),
    coverage: null
  });
}

export function applyJobMatchToState(state, result) {
  if (!state?.analysis?.jobMatch || !result || !Array.isArray(result.findings)) {
    throw new TypeError('A canonical analysis state and job-match result are required.');
  }

  const next = typeof structuredClone === 'function'
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));

  next.analysis.jobMatch = {
    ...next.analysis.jobMatch,
    status: RUN_STATUS.COMPLETE,
    completedAt: '',
    errorCode: '',
    errorMessage: '',
    findings: result.findings.map((item) => ({
      ...item,
      evidence: Array.isArray(item.evidence) ? item.evidence.map((entry) => ({ ...entry })) : [],
      evidenceDetails: Array.isArray(item.evidenceDetails)
        ? item.evidenceDetails.map((entry) => ({ ...entry }))
        : [],
      experienceDuration: item.experienceDuration
        ? {
          ...item.experienceDuration,
          ranges: Array.isArray(item.experienceDuration.ranges)
            ? item.experienceDuration.ranges.map((range) => ({ ...range }))
            : []
        }
        : null
    })),
    diagnostics: { ...(result.diagnostics || {}) },
    coverage: null
  };

  next.analysis.evidenceFindings = result.evidenceFindings.map((item) => ({
    ...item,
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((entry) => ({ ...entry }))
      : []
  }));
  next.confidence.jobMatch = result.confidence || CONFIDENCE_LEVEL.NONE;

  // Task 7 owns coverage and prioritization. Keep both intentionally unset.
  next.analysis.jobMatch.coverage = null;
  next.analysis.priorityRecommendations = [];

  return next;
}
