import {
  ATS_READINESS_CATEGORY,
  FINDING_STATUS,
  REQUIREMENT_CATEGORY,
  REQUIREMENT_IMPORTANCE
} from './contracts.js';

function titleCase(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status) {
  const labels = {
    [FINDING_STATUS.MATCHED]: 'Matched',
    [FINDING_STATUS.PARTIAL]: 'Partial',
    [FINDING_STATUS.NOT_FOUND]: 'Not found',
    [FINDING_STATUS.UNCERTAIN]: 'Unclear',
    [FINDING_STATUS.NOT_APPLICABLE]: 'Not applicable'
  };
  return labels[status] || titleCase(status);
}

function findingCard(item) {
  return Object.freeze({
    id: item.requirementId || item.id || '',
    requirement: item.requirement || item.title || '',
    jobDescriptionText: item.requirementSourceText || item.sourceText || '',
    importance: item.importance || '',
    importanceLabel: titleCase(item.importance),
    category: item.category || '',
    categoryLabel: titleCase(item.category),
    status: item.status || '',
    statusLabel: statusLabel(item.status),
    confidence: item.confidence || '',
    explanation: item.explanation || '',
    evidence: Object.freeze((item.evidenceDetails || item.evidence || []).map((evidence) => Object.freeze({
      section: evidence.section || '',
      sectionLabel: titleCase(evidence.section),
      excerpt: evidence.excerpt || '',
      location: evidence.location || '',
      matchedText: evidence.matchedText || '',
      method: evidence.method || ''
    })))
  });
}

function findingCards(items) {
  return Object.freeze((Array.isArray(items) ? items : []).map(findingCard));
}

function atsCard(item) {
  return Object.freeze({
    id: item.id || '',
    title: item.title || '',
    category: item.category || '',
    categoryLabel: titleCase(item.category),
    status: item.status || '',
    statusLabel: statusLabel(item.status),
    sourceText: item.sourceText || '',
    explanation: item.explanation || '',
    confidence: item.confidence || '',
    evidence: Object.freeze((item.evidence || []).map((evidence) => Object.freeze({
      section: evidence.section || '',
      sectionLabel: titleCase(evidence.section),
      excerpt: evidence.excerpt || '',
      location: evidence.location || ''
    })))
  });
}

function coverageGroup(group, key) {
  return Object.freeze({
    key,
    label: group?.label || titleCase(key),
    percent: typeof group?.percent === 'number' ? group.percent : null,
    count: Number(group?.count || 0),
    assessableCount: Number(group?.assessableCount || 0),
    matchedCount: Number(group?.matchedCount || 0),
    partialCount: Number(group?.partialCount || 0),
    notFoundCount: Number(group?.notFoundCount || 0),
    uncertainCount: Number(group?.uncertainCount || 0),
    excludedCount: Number(group?.excludedCount || 0)
  });
}

function plainLanguageCoverage(level) {
  if (level === 'strong') return 'Most assessable job requirements are supported, with no scored required gap.';
  if (level === 'moderate') return 'Several requirements are supported, but important gaps or partial evidence still need attention.';
  if (level === 'limited') return 'Many assessable job requirements are not yet supported by the resume evidence.';
  return 'There is not enough assessable requirement evidence to calculate meaningful coverage.';
}

function plainLanguageReadiness(level) {
  if (level === 'strong') return 'The resume shows strong basic parsing and structure signals in the checks currently supported.';
  if (level === 'needs_review') return 'The resume has one or more structure, content, or formatting signals worth reviewing.';
  if (level === 'high_risk') return 'The resume has a serious parsing risk, such as very little selectable text.';
  return 'There is not enough information to assess resume readiness.';
}

function priorityLabel(priority) {
  if (priority === 'high') return 'High priority';
  if (priority === 'medium') return 'Medium priority';
  if (priority === 'optional') return 'Optional';
  return titleCase(priority);
}

function priorityCards(items) {
  return Object.freeze((Array.isArray(items) ? items : []).map((item) => Object.freeze({
    id: item.id || '',
    requirement: item.requirement || '',
    priority: item.priority || '',
    priorityLabel: priorityLabel(item.priority),
    status: item.status || '',
    statusLabel: statusLabel(item.status),
    action: item.action || '',
    recommendation: item.recommendation || '',
    explanation: item.explanation || '',
    truthfulGuardrail: item.truthfulGuardrail || '',
    evidenceCount: Number(item.evidenceCount || 0)
  })));
}

function filterCategory(findings, categories) {
  const allowed = new Set(categories);
  return findings.filter((item) => allowed.has(item.category));
}

export function buildDashboardViewModel(state, comparison = null) {
  if (!state?.analysis?.jobMatch || !state?.analysis?.atsReadiness) {
    throw new TypeError('A completed ATS & Job Match V2 analysis state is required.');
  }

  const jobFindings = Array.isArray(state.analysis.jobMatch.findings)
    ? state.analysis.jobMatch.findings
    : [];
  const atsFindings = Array.isArray(state.analysis.atsReadiness.findings)
    ? state.analysis.atsReadiness.findings
    : [];
  const coverage = state.analysis.jobMatch.coverage || null;
  const groups = coverage?.groups || {};

  const required = jobFindings.filter((item) => item.importance === REQUIREMENT_IMPORTANCE.REQUIRED);
  const preferred = jobFindings.filter((item) => item.importance === REQUIREMENT_IMPORTANCE.PREFERRED);
  const matched = jobFindings.filter((item) => item.status === FINDING_STATUS.MATCHED);
  const missingOrUnclear = jobFindings.filter((item) => [
    FINDING_STATUS.PARTIAL,
    FINDING_STATUS.NOT_FOUND,
    FINDING_STATUS.UNCERTAIN
  ].includes(item.status));

  const skills = filterCategory(jobFindings, [
    REQUIREMENT_CATEGORY.HARD_SKILL,
    REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS,
    REQUIREMENT_CATEGORY.SOFT_SKILL
  ]);
  const experience = filterCategory(jobFindings, [
    REQUIREMENT_CATEGORY.EXPERIENCE,
    REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION
  ]);
  const educationCertifications = filterCategory(jobFindings, [
    REQUIREMENT_CATEGORY.EDUCATION,
    REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE
  ]);

  const resumeStructure = atsFindings.filter((item) => [
    ATS_READINESS_CATEGORY.PARSEABILITY,
    ATS_READINESS_CATEGORY.CONTACT,
    ATS_READINESS_CATEGORY.SECTIONS,
    ATS_READINESS_CATEGORY.STRUCTURE,
    ATS_READINESS_CATEGORY.FORMATTING_RISK
  ].includes(item.category));

  const quantifiedImpact = atsFindings.filter(
    (item) => item.category === ATS_READINESS_CATEGORY.QUANTIFIED_IMPACT
  );

  return Object.freeze({
    title: 'ATS & Job Match Analysis',
    explanation: 'This report compares visible resume evidence with the supplied job description and checks supported ATS-readiness signals. It does not reproduce an employer ATS or predict hiring.',
    coverage: Object.freeze({
      percent: typeof coverage?.percent === 'number' ? coverage.percent : null,
      level: coverage?.level || 'insufficient_data',
      levelLabel: titleCase(coverage?.level || 'insufficient_data'),
      plainLanguage: plainLanguageCoverage(coverage?.level),
      formula: coverage?.formula || '',
      requiredGapCount: Number(coverage?.requiredGapCount || 0),
      groups: Object.freeze([
        coverageGroup(groups.requiredRequirements, 'requiredRequirements'),
        coverageGroup(groups.preferredRequirements, 'preferredRequirements'),
        coverageGroup(groups.hardSkills, 'hardSkills'),
        coverageGroup(groups.tools, 'tools'),
        coverageGroup(groups.qualifications, 'qualifications'),
        coverageGroup(groups.certifications, 'certifications'),
        coverageGroup(groups.experience, 'experience'),
        coverageGroup(groups.softSkills, 'softSkills')
      ])
    }),
    atsReadiness: Object.freeze({
      level: state.analysis.atsReadiness.level || 'insufficient_data',
      levelLabel: titleCase(state.analysis.atsReadiness.level || 'insufficient_data'),
      plainLanguage: plainLanguageReadiness(state.analysis.atsReadiness.level),
      findings: Object.freeze(atsFindings.map(atsCard))
    }),
    sections: Object.freeze({
      requiredRequirements: findingCards(required),
      preferredRequirements: findingCards(preferred),
      matchedEvidence: findingCards(matched),
      missingUnclearRequirements: findingCards(missingOrUnclear),
      skillsAnalysis: findingCards(skills),
      experienceAlignment: findingCards(experience),
      educationCertifications: findingCards(educationCertifications),
      resumeStructure: Object.freeze(resumeStructure.map(atsCard)),
      quantifiedImpact: Object.freeze(quantifiedImpact.map(atsCard)),
      priorityActions: priorityCards(state.analysis.priorityRecommendations)
    }),
    comparison: comparison ? Object.freeze({
      previousCoverage: typeof comparison.previousCoverage === 'number' ? comparison.previousCoverage : null,
      currentCoverage: typeof comparison.currentCoverage === 'number' ? comparison.currentCoverage : null,
      delta: typeof comparison.delta === 'number' ? comparison.delta : null,
      direction: comparison.direction || 'unchanged'
    }) : null,
    sourceSummary: Object.freeze({
      resumeSourceKind: state.resume?.source?.kind || 'none',
      resumeSourceName: state.resume?.source?.name || '',
      requirementCount: jobFindings.length,
      analysisVersion: state.version
    })
  });
}
