import {
  FINDING_STATUS,
  JOB_COVERAGE_LEVEL,
  REQUIREMENT_CATEGORY,
  REQUIREMENT_IMPORTANCE
} from './contracts.js';

export const COVERAGE_STATUS_CREDIT = Object.freeze({
  [FINDING_STATUS.MATCHED]: 1,
  [FINDING_STATUS.PARTIAL]: 0.5,
  [FINDING_STATUS.NOT_FOUND]: 0,
  [FINDING_STATUS.UNCERTAIN]: null,
  [FINDING_STATUS.NOT_APPLICABLE]: null
});

export const COVERAGE_IMPORTANCE_WEIGHT = Object.freeze({
  [REQUIREMENT_IMPORTANCE.REQUIRED]: 3,
  [REQUIREMENT_IMPORTANCE.GENERAL]: 2,
  [REQUIREMENT_IMPORTANCE.PREFERRED]: 1
});

export const COVERAGE_CATEGORY_MULTIPLIER = Object.freeze({
  [REQUIREMENT_CATEGORY.HARD_SKILL]: 1.25,
  [REQUIREMENT_CATEGORY.TOOL_PLATFORM]: 1.1,
  [REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE]: 1.25,
  [REQUIREMENT_CATEGORY.SOFT_SKILL]: 0.75,
  [REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE]: 1.25,
  [REQUIREMENT_CATEGORY.EDUCATION]: 1.25,
  [REQUIREMENT_CATEGORY.EXPERIENCE]: 1.25,
  [REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION]: 1,
  [REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS]: 1.1,
  [REQUIREMENT_CATEGORY.OTHER_CONSTRAINT]: 1,
  [REQUIREMENT_CATEGORY.UNKNOWN]: 0
});

const PRIMARY_GROUPS = Object.freeze({
  requiredRequirements: Object.freeze({
    label: 'Required requirements',
    test: (item) => item.importance === REQUIREMENT_IMPORTANCE.REQUIRED
  }),
  preferredRequirements: Object.freeze({
    label: 'Preferred requirements',
    test: (item) => item.importance === REQUIREMENT_IMPORTANCE.PREFERRED
  }),
  hardSkills: Object.freeze({
    label: 'Hard skills',
    test: (item) => [
      REQUIREMENT_CATEGORY.HARD_SKILL,
      REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
      REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS
    ].includes(item.category)
  }),
  tools: Object.freeze({
    label: 'Tools',
    test: (item) => item.category === REQUIREMENT_CATEGORY.TOOL_PLATFORM
  }),
  qualifications: Object.freeze({
    label: 'Qualifications',
    test: (item) => item.category === REQUIREMENT_CATEGORY.EDUCATION
  }),
  certifications: Object.freeze({
    label: 'Certifications',
    test: (item) => item.category === REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE
  }),
  experience: Object.freeze({
    label: 'Experience',
    test: (item) => [
      REQUIREMENT_CATEGORY.EXPERIENCE,
      REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION
    ].includes(item.category)
  }),
  softSkills: Object.freeze({
    label: 'Soft skills',
    test: (item) => item.category === REQUIREMENT_CATEGORY.SOFT_SKILL
  })
});

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function coverageWeightForFinding(finding) {
  if (!finding || finding.category === REQUIREMENT_CATEGORY.UNKNOWN) return 0;
  const importance = COVERAGE_IMPORTANCE_WEIGHT[finding.importance] ?? COVERAGE_IMPORTANCE_WEIGHT[REQUIREMENT_IMPORTANCE.GENERAL];
  const category = COVERAGE_CATEGORY_MULTIPLIER[finding.category] ?? 1;
  return round(importance * category);
}

export function coverageCreditForStatus(status) {
  return Object.prototype.hasOwnProperty.call(COVERAGE_STATUS_CREDIT, status)
    ? COVERAGE_STATUS_CREDIT[status]
    : null;
}

export function isCoverageAssessable(finding) {
  if (!finding || finding.category === REQUIREMENT_CATEGORY.UNKNOWN) return false;
  return coverageCreditForStatus(finding.status) !== null && coverageWeightForFinding(finding) > 0;
}

function summarize(items) {
  const assessable = items.filter(isCoverageAssessable);
  const excluded = items.filter((item) => !isCoverageAssessable(item));

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const item of assessable) {
    const weight = coverageWeightForFinding(item);
    const credit = coverageCreditForStatus(item.status);
    totalWeight += weight;
    earnedWeight += weight * credit;
  }

  const percent = totalWeight > 0
    ? round((earnedWeight / totalWeight) * 100, 1)
    : null;

  return Object.freeze({
    count: items.length,
    assessableCount: assessable.length,
    excludedCount: excluded.length,
    matchedCount: items.filter((item) => item.status === FINDING_STATUS.MATCHED).length,
    partialCount: items.filter((item) => item.status === FINDING_STATUS.PARTIAL).length,
    notFoundCount: items.filter((item) => item.status === FINDING_STATUS.NOT_FOUND).length,
    uncertainCount: items.filter((item) => item.status === FINDING_STATUS.UNCERTAIN).length,
    notApplicableCount: items.filter((item) => item.status === FINDING_STATUS.NOT_APPLICABLE).length,
    totalWeight: round(totalWeight),
    earnedWeight: round(earnedWeight),
    percent
  });
}

function levelFor(percent, findings) {
  if (percent === null) return JOB_COVERAGE_LEVEL.INSUFFICIENT_DATA;

  const requiredNotFound = findings.some((item) =>
    item.importance === REQUIREMENT_IMPORTANCE.REQUIRED &&
    item.status === FINDING_STATUS.NOT_FOUND &&
    item.category !== REQUIREMENT_CATEGORY.UNKNOWN
  );

  if (percent >= 80 && !requiredNotFound) return JOB_COVERAGE_LEVEL.STRONG;
  if (percent >= 50) return JOB_COVERAGE_LEVEL.MODERATE;
  return JOB_COVERAGE_LEVEL.LIMITED;
}

function exclusionReason(item) {
  if (item.category === REQUIREMENT_CATEGORY.UNKNOWN) return 'unknown_requirement';
  if (item.status === FINDING_STATUS.UNCERTAIN) return 'uncertain_evidence';
  if (item.status === FINDING_STATUS.NOT_APPLICABLE) return 'not_applicable';
  if (coverageWeightForFinding(item) <= 0) return 'zero_weight';
  return 'not_assessable';
}

export function calculateJobRequirementCoverage(findings) {
  const items = Array.isArray(findings) ? findings : [];
  const overall = summarize(items);
  const groups = {};

  for (const [key, group] of Object.entries(PRIMARY_GROUPS)) {
    groups[key] = Object.freeze({
      label: group.label,
      ...summarize(items.filter(group.test))
    });
  }

  const assessable = items.filter(isCoverageAssessable);
  const excluded = items
    .filter((item) => !isCoverageAssessable(item))
    .map((item) => Object.freeze({
      requirementId: item.requirementId,
      requirement: item.requirement,
      importance: item.importance,
      category: item.category,
      status: item.status,
      reason: exclusionReason(item)
    }));

  const contributions = assessable.map((item) => {
    const weight = coverageWeightForFinding(item);
    const credit = coverageCreditForStatus(item.status);
    return Object.freeze({
      requirementId: item.requirementId,
      requirement: item.requirement,
      importance: item.importance,
      category: item.category,
      status: item.status,
      weight,
      credit,
      earnedWeight: round(weight * credit)
    });
  });

  return Object.freeze({
    name: 'Job Requirement Coverage',
    percent: overall.percent,
    level: levelFor(overall.percent, items),
    formula: 'Coverage = sum(requirement weight × evidence credit) / sum(assessable requirement weights) × 100.',
    evidenceCredit: Object.freeze({
      matched: 1,
      partial: 0.5,
      notFound: 0,
      uncertain: 'excluded',
      notApplicable: 'excluded'
    }),
    weighting: Object.freeze({
      importance: COVERAGE_IMPORTANCE_WEIGHT,
      categoryMultiplier: COVERAGE_CATEGORY_MULTIPLIER,
      note: 'Weights represent product-defined relative requirement importance. They do not reproduce an employer ATS score and are not calibrated to hiring outcomes.'
    }),
    overall,
    groups: Object.freeze(groups),
    contributions: Object.freeze(contributions),
    excluded: Object.freeze(excluded),
    requiredGapCount: items.filter((item) =>
      item.importance === REQUIREMENT_IMPORTANCE.REQUIRED &&
      item.status === FINDING_STATUS.NOT_FOUND &&
      item.category !== REQUIREMENT_CATEGORY.UNKNOWN
    ).length
  });
}
