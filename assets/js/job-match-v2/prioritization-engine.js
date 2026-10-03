import {
  FINDING_STATUS,
  RECOMMENDATION_PRIORITY,
  REQUIREMENT_CATEGORY,
  REQUIREMENT_IMPORTANCE
} from './contracts.js';
import { coverageWeightForFinding } from './coverage-model.js';

const PRIORITY_RANK = Object.freeze({
  [RECOMMENDATION_PRIORITY.HIGH]: 3,
  [RECOMMENDATION_PRIORITY.MEDIUM]: 2,
  [RECOMMENDATION_PRIORITY.OPTIONAL]: 1
});

function priorityForFinding(finding) {
  if (!finding || [FINDING_STATUS.MATCHED, FINDING_STATUS.NOT_APPLICABLE].includes(finding.status)) {
    return null;
  }

  if (finding.importance === REQUIREMENT_IMPORTANCE.PREFERRED) {
    return RECOMMENDATION_PRIORITY.OPTIONAL;
  }

  if (
    finding.importance === REQUIREMENT_IMPORTANCE.REQUIRED &&
    finding.status === FINDING_STATUS.NOT_FOUND
  ) {
    return RECOMMENDATION_PRIORITY.HIGH;
  }

  return RECOMMENDATION_PRIORITY.MEDIUM;
}

function recommendationText(finding) {
  const requirement = finding.requirement;
  const status = finding.status;
  const category = finding.category;

  if (status === FINDING_STATUS.UNCERTAIN) {
    return {
      action: 'manual_verification',
      message: 'Review "' + requirement + '" manually. The resume evidence is not strong enough for a reliable automated conclusion. Do not add or claim anything solely to improve coverage.'
    };
  }

  if (category === REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE) {
    return status === FINDING_STATUS.NOT_FOUND
      ? {
        action: 'add_if_true',
        message: 'If you genuinely hold "' + requirement + '", list it accurately in Certifications/Licenses. Otherwise, do not claim it.'
      }
      : {
        action: 'strengthen_evidence',
        message: 'The resume contains some evidence for "' + requirement + '". If you genuinely hold it, make the certification/licence entry explicit and accurate; otherwise do not strengthen the claim.'
      };
  }

  if (category === REQUIREMENT_CATEGORY.EDUCATION) {
    return status === FINDING_STATUS.NOT_FOUND
      ? {
        action: 'add_if_true',
        message: 'If your actual education genuinely satisfies "' + requirement + '", state the degree and field accurately in Education. Do not invent or upgrade a qualification.'
      }
      : {
        action: 'strengthen_evidence',
        message: 'The education evidence for "' + requirement + '" is incomplete. Clarify the real degree/field only if the resume facts support it.'
      };
  }

  if (category === REQUIREMENT_CATEGORY.EXPERIENCE || category === REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION) {
    return status === FINDING_STATUS.NOT_FOUND
      ? {
        action: 'add_if_true',
        message: 'If your real work history supports "' + requirement + '", make the relevant role, dates, or responsibility evidence explicit. Do not invent experience, duration, employers, or duties.'
      }
      : {
        action: 'strengthen_evidence',
        message: 'The resume shows limited evidence for "' + requirement + '". Strengthen it only with truthful role, date, or responsibility evidence you can support.'
      };
  }

  if (category === REQUIREMENT_CATEGORY.SOFT_SKILL) {
    return status === FINDING_STATUS.NOT_FOUND
      ? {
        action: 'add_if_true',
        message: 'If you genuinely demonstrate "' + requirement + '", show it through a real work/project example rather than adding an unsupported keyword.'
      }
      : {
        action: 'strengthen_evidence',
        message: 'The resume mentions "' + requirement + '" weakly. If true, support it with a concrete work/project example instead of keyword stuffing.'
      };
  }

  if (category === REQUIREMENT_CATEGORY.OTHER_CONSTRAINT) {
    return {
      action: 'manual_verification',
      message: 'Verify "' + requirement + '" manually. Resume text often cannot prove availability, travel, location, shift, or work-authorization conditions. Do not add unsupported claims.'
    };
  }

  if (category === REQUIREMENT_CATEGORY.UNKNOWN) {
    return {
      action: 'manual_verification',
      message: 'Review "' + requirement + '" manually because the requirement was not safely classified. Do not add wording you cannot explain or support.'
    };
  }

  return status === FINDING_STATUS.NOT_FOUND
    ? {
      action: 'add_if_true',
      message: 'If you genuinely have "' + requirement + '" and can support it with real evidence, add that evidence to the relevant resume section. Do not add it solely to improve coverage.'
    }
    : {
      action: 'strengthen_evidence',
      message: 'The resume contains weak or partial evidence for "' + requirement + '". Strengthen it only with truthful evidence you can support.'
    };
}

export function createPriorityRecommendations(findings) {
  const recommendations = [];

  for (const finding of Array.isArray(findings) ? findings : []) {
    const priority = priorityForFinding(finding);
    if (!priority) continue;

    const advice = recommendationText(finding);
    recommendations.push(Object.freeze({
      id: 'recommendation-' + finding.requirementId,
      requirementId: finding.requirementId,
      requirement: finding.requirement,
      importance: finding.importance,
      category: finding.category,
      status: finding.status,
      priority,
      action: advice.action,
      recommendation: advice.message,
      explanation: finding.explanation,
      evidenceCount: Array.isArray(finding.evidenceDetails)
        ? finding.evidenceDetails.length
        : Array.isArray(finding.evidence)
          ? finding.evidence.length
          : 0,
      coverageWeight: coverageWeightForFinding(finding),
      truthfulGuardrail: 'Add, clarify, or strengthen content only when it is genuinely true and supported by your real experience, skills, qualifications, or credentials.'
    }));
  }

  return Object.freeze(recommendations.sort((a, b) =>
    (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) ||
    (b.coverageWeight - a.coverageWeight) ||
    a.requirement.localeCompare(b.requirement)
  ));
}
