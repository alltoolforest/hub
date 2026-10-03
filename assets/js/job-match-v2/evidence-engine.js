import {
  CONFIDENCE_LEVEL,
  FINDING_STATUS,
  PROVENANCE_KIND,
  REQUIREMENT_CATEGORY
} from './contracts.js';
import {
  estimateExperienceDuration,
  findExactPhraseEvidence,
  findNormalizedConceptEvidence,
  findWordFamilyEvidence
} from './resume-evidence-index.js';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function evidenceItem(item) {
  return Object.freeze({
    sourceType: 'resume',
    section: item.section || 'unknown',
    excerpt: item.excerpt || '',
    location: item.lineIndex === undefined ? 'resume text' : 'line ' + String(item.lineIndex + 1),
    provenance: PROVENANCE_KIND.PARSED,
    method: item.method || 'exact_phrase',
    matchedText: item.matchedText || ''
  });
}

function uniqueEvidence(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = [item.section, item.lineIndex, item.excerpt, item.matchedText].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(evidenceItem(item));
  }
  return Object.freeze(output);
}

function allTermEvidence(requirement, index, sections = null) {
  const exactTerms = [
    requirement.originalMatchedText,
    requirement.matchedText,
    requirement.label
  ].map(clean).filter(Boolean);

  const evidence = [];
  for (const term of [...new Set(exactTerms)]) {
    evidence.push(...findExactPhraseEvidence(index, term, sections));
  }

  if (requirement.conceptId) {
    evidence.push(...findNormalizedConceptEvidence(index, requirement.conceptId, sections));
  }

  if (!requirement.conceptId && requirement.label && !/\s/.test(requirement.label)) {
    evidence.push(...findWordFamilyEvidence(index, requirement.label, sections));
  }

  return uniqueEvidence(evidence);
}

function result(requirement, status, evidence, confidence, explanation, extra = {}) {
  return Object.freeze({
    requirementId: requirement.id,
    requirement: requirement.label,
    requirementSourceText: requirement.sourceText || requirement.label,
    importance: requirement.importance,
    category: requirement.category,
    status,
    evidence,
    confidence,
    explanation,
    ...extra
  });
}

function skillLikeEvidence(requirement, index) {
  const evidence = allTermEvidence(requirement, index);
  if (!evidence.length) {
    return result(
      requirement,
      FINDING_STATUS.NOT_FOUND,
      evidence,
      CONFIDENCE_LEVEL.HIGH,
      'The requirement was not detected in the resume using exact or safely normalized terminology.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.MATCHED,
    evidence,
    requirement.conceptId ? CONFIDENCE_LEVEL.HIGH : CONFIDENCE_LEVEL.MEDIUM,
    'The requirement is explicitly present in the resume. This confirms resume wording/evidence, not real-world proficiency.'
  );
}

function softSkillEvidence(requirement, index) {
  const contextual = allTermEvidence(requirement, index, ['experience','projects']);
  if (contextual.length) {
    return result(
      requirement,
      FINDING_STATUS.MATCHED,
      contextual,
      CONFIDENCE_LEVEL.MEDIUM,
      'The soft-skill term appears in work/project context rather than only as a standalone keyword.'
    );
  }

  const keywordOnly = allTermEvidence(requirement, index);
  if (keywordOnly.length) {
    return result(
      requirement,
      FINDING_STATUS.PARTIAL,
      keywordOnly,
      CONFIDENCE_LEVEL.MEDIUM,
      'The soft-skill keyword is present, but work/project evidence was not clearly detected.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.NOT_FOUND,
    Object.freeze([]),
    CONFIDENCE_LEVEL.MEDIUM,
    'The soft-skill requirement was not clearly detected in the resume.'
  );
}

function jobTitleEvidence(requirement, index) {
  const work = allTermEvidence(requirement, index, ['experience']);
  if (work.length) {
    return result(
      requirement,
      FINDING_STATUS.MATCHED,
      work,
      CONFIDENCE_LEVEL.HIGH,
      'The requested job title/function appears in the Work Experience section.'
    );
  }

  const elsewhere = allTermEvidence(requirement, index);
  if (elsewhere.length) {
    return result(
      requirement,
      FINDING_STATUS.PARTIAL,
      elsewhere,
      CONFIDENCE_LEVEL.MEDIUM,
      'The job title/function appears in the resume, but not clearly within Work Experience.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.NOT_FOUND,
    Object.freeze([]),
    CONFIDENCE_LEVEL.MEDIUM,
    'The requested job title/function was not clearly detected in the resume.'
  );
}

function certificationEvidence(requirement, index) {
  const certification = allTermEvidence(requirement, index, ['certifications']);
  if (certification.length) {
    return result(
      requirement,
      FINDING_STATUS.MATCHED,
      certification,
      CONFIDENCE_LEVEL.HIGH,
      'The certification or licence is explicitly listed in the Certifications/Licenses section.'
    );
  }

  const elsewhere = allTermEvidence(requirement, index);
  if (elsewhere.length) {
    return result(
      requirement,
      FINDING_STATUS.PARTIAL,
      elsewhere,
      CONFIDENCE_LEVEL.MEDIUM,
      'The certification/licence wording appears elsewhere in the resume, but not in a dedicated certification section.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.NOT_FOUND,
    Object.freeze([]),
    CONFIDENCE_LEVEL.HIGH,
    'The certification or licence was not detected in the resume.'
  );
}

function degreeLevel(text) {
  const value = clean(text);
  if (/\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i.test(value)) return 'doctorate';
  if (/\bmaster(?:'s)?\b|\bmba\b/i.test(value)) return 'master';
  if (/\bbachelor(?:'s)?\b|\bbaccalaureate\b/i.test(value)) return 'bachelor';
  if (/\bassociate(?:'s)?\b/i.test(value)) return 'associate';
  if (/\bdiploma\b/i.test(value)) return 'diploma';
  return '';
}

function educationField(text) {
  const match = clean(text).match(/\b(?:degree|bachelor(?:'s)?|master(?:'s)?|diploma|associate(?:'s)?)\s+(?:degree\s+)?in\s+([^,.;]+)/i);
  return match ? clean(match[1]).replace(/\b(?:is required|required|preferred|mandatory|essential)\b.*$/i, '').trim() : '';
}

function educationEvidence(requirement, index) {
  const educationLines = index.sections?.education || [];
  const text = educationLines.map((line) => line.text).join(' ');
  const requiredLevel = degreeLevel(requirement.sourceText || requirement.label);
  const requiredField = educationField(requirement.sourceText || requirement.label);

  if (!educationLines.length) {
    return result(
      requirement,
      FINDING_STATUS.NOT_FOUND,
      Object.freeze([]),
      CONFIDENCE_LEVEL.HIGH,
      'No Education section was detected, so the qualification is not evidenced in the resume.'
    );
  }

  if (!requiredLevel) {
    const exact = allTermEvidence(requirement, index, ['education']);
    return exact.length
      ? result(requirement, FINDING_STATUS.MATCHED, exact, CONFIDENCE_LEVEL.MEDIUM, 'The education requirement wording appears in the Education section.')
      : result(requirement, FINDING_STATUS.UNCERTAIN, Object.freeze([]), CONFIDENCE_LEVEL.LOW, 'The education requirement could not be interpreted safely enough for a definitive match.');
  }

  const levelPatterns = {
    doctorate: /\b(?:ph\.?d|doctorate|doctoral)\b/i,
    master: /\b(?:master(?:'s)?|mba)\b/i,
    bachelor: /\b(?:bachelor(?:'s)?|baccalaureate)\b/i,
    associate: /\bassociate(?:'s)?\b/i,
    diploma: /\bdiploma\b/i
  };

  const levelMatch = educationLines.find((line) => levelPatterns[requiredLevel].test(line.text));
  if (!levelMatch) {
    return result(
      requirement,
      FINDING_STATUS.NOT_FOUND,
      Object.freeze([]),
      CONFIDENCE_LEVEL.MEDIUM,
      'The required education level was not detected in the Education section.'
    );
  }

  const evidence = uniqueEvidence([{
    section:'education',
    lineIndex:levelMatch.lineIndex,
    excerpt:levelMatch.text,
    matchedText:requiredLevel,
    method:'education_level'
  }]);

  if (!requiredField) {
    return result(
      requirement,
      FINDING_STATUS.MATCHED,
      evidence,
      CONFIDENCE_LEVEL.MEDIUM,
      'The required education level is evidenced in the Education section.'
    );
  }

  const fieldWords = requiredField.toLowerCase().split(/\s+/).filter((word) => word.length >= 3);
  const fieldMatched = fieldWords.length && fieldWords.every((word) => text.toLowerCase().includes(word));

  return result(
    requirement,
    fieldMatched ? FINDING_STATUS.MATCHED : FINDING_STATUS.PARTIAL,
    evidence,
    fieldMatched ? CONFIDENCE_LEVEL.MEDIUM : CONFIDENCE_LEVEL.LOW,
    fieldMatched
      ? 'The required education level and field are evidenced in the Education section.'
      : 'The education level appears present, but the requested field of study was not clearly confirmed.'
  );
}

function numericYearsRequired(text) {
  const match = clean(text).match(/\b(?:at least\s+|minimum(?:\s+of)?\s+)?(\d+)\s*\+?\s*years?\s+(?:of\s+)?(?:relevant\s+)?experience\b/i);
  return match ? Number(match[1]) : null;
}

function genericExperienceTerms(text) {
  let value = clean(text);
  value = value.replace(/^.*?\bexperience\s+(?:with|in)\s+/i, '');
  value = value.replace(/\b(?:is required|required|preferred|mandatory|essential|desirable)\b.*$/i, '');
  if (value === clean(text)) {
    const match = clean(text).match(/\b([A-Za-z][A-Za-z -]{2,40})\s+experience\b/i);
    value = match ? match[1] : '';
  }
  return value
    .split(/\s*(?:,| and | or |\/)\s*/i)
    .map((item) => clean(item))
    .filter((item) => item.length >= 3 && item.length <= 70);
}

function experienceEvidence(requirement, index, referenceDate) {
  const years = numericYearsRequired(requirement.sourceText || requirement.label);

  if (years !== null) {
    const duration = estimateExperienceDuration(index, referenceDate);
    if (duration.totalMonths === null) {
      return result(
        requirement,
        FINDING_STATUS.UNCERTAIN,
        Object.freeze([]),
        CONFIDENCE_LEVEL.LOW,
        'The required experience duration could not be confirmed because usable Work Experience date ranges were not detected.',
        { experienceDuration: duration }
      );
    }

    const requiredMonths = years * 12;
    const evidence = Object.freeze(duration.ranges.map((range) => Object.freeze({
      sourceType:'resume',
      section:'experience',
      excerpt:range.sourceText,
      location:'Work Experience',
      provenance:PROVENANCE_KIND.PARSED,
      method:'date_range',
      matchedText:''
    })));

    return result(
      requirement,
      duration.totalMonths >= requiredMonths ? FINDING_STATUS.MATCHED : FINDING_STATUS.PARTIAL,
      evidence,
      duration.confidence === 'high' ? CONFIDENCE_LEVEL.HIGH : CONFIDENCE_LEVEL.MEDIUM,
      duration.totalMonths >= requiredMonths
        ? 'The non-overlapping employment date ranges support at least the requested experience duration.'
        : 'Some employment duration is evidenced, but the derived duration is below the requested threshold or may be incomplete.',
      {
        experienceDuration: duration,
        requiredMonths
      }
    );
  }

  const terms = genericExperienceTerms(requirement.sourceText || requirement.label);
  if (terms.length) {
    const workEvidence = [];
    for (const term of terms) {
      workEvidence.push(...findExactPhraseEvidence(index, term, ['experience']));
    }
    const uniqueWork = uniqueEvidence(workEvidence);
    if (uniqueWork.length) {
      return result(
        requirement,
        FINDING_STATUS.MATCHED,
        uniqueWork,
        CONFIDENCE_LEVEL.MEDIUM,
        'The requested experience topic appears within the Work Experience section.'
      );
    }

    const elsewhere = [];
    for (const term of terms) elsewhere.push(...findExactPhraseEvidence(index, term));
    const uniqueElsewhere = uniqueEvidence(elsewhere);
    if (uniqueElsewhere.length) {
      return result(
        requirement,
        FINDING_STATUS.PARTIAL,
        uniqueElsewhere,
        CONFIDENCE_LEVEL.LOW,
        'Related wording appears in the resume, but not clearly as Work Experience evidence.'
      );
    }

    return result(
      requirement,
      FINDING_STATUS.NOT_FOUND,
      Object.freeze([]),
      CONFIDENCE_LEVEL.MEDIUM,
      'The requested experience topic was not clearly evidenced in the Work Experience section.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.UNCERTAIN,
    Object.freeze([]),
    CONFIDENCE_LEVEL.LOW,
    'This experience requirement could not be interpreted safely enough for a definitive match.'
  );
}

function constraintEvidence(requirement, index) {
  const evidence = allTermEvidence(requirement, index);
  if (evidence.length) {
    return result(
      requirement,
      FINDING_STATUS.MATCHED,
      evidence,
      CONFIDENCE_LEVEL.MEDIUM,
      'The constraint wording appears explicitly in the resume.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.UNCERTAIN,
    Object.freeze([]),
    CONFIDENCE_LEVEL.LOW,
    'This requirement is not normally proven by resume text alone. Absence from the resume is not treated as evidence that the candidate does not meet it.'
  );
}

function unknownEvidence(requirement, index) {
  const evidence = allTermEvidence(requirement, index);
  if (evidence.length) {
    return result(
      requirement,
      FINDING_STATUS.PARTIAL,
      evidence,
      CONFIDENCE_LEVEL.LOW,
      'The same wording appears in the resume, but the requirement meaning is not safely classified.'
    );
  }

  return result(
    requirement,
    FINDING_STATUS.UNCERTAIN,
    Object.freeze([]),
    CONFIDENCE_LEVEL.LOW,
    'The requirement is not safely classified, so the analyzer will not guess whether the resume satisfies it.'
  );
}

export function evaluateRequirementEvidence(requirement, index, options = {}) {
  const category = requirement?.category;

  if ([
    REQUIREMENT_CATEGORY.HARD_SKILL,
    REQUIREMENT_CATEGORY.TOOL_PLATFORM,
    REQUIREMENT_CATEGORY.DOMAIN_KNOWLEDGE,
    REQUIREMENT_CATEGORY.METHODOLOGY_PROCESS
  ].includes(category)) {
    return skillLikeEvidence(requirement, index);
  }

  if (category === REQUIREMENT_CATEGORY.SOFT_SKILL) return softSkillEvidence(requirement, index);
  if (category === REQUIREMENT_CATEGORY.JOB_TITLE_FUNCTION) return jobTitleEvidence(requirement, index);
  if (category === REQUIREMENT_CATEGORY.CERTIFICATION_LICENSE) return certificationEvidence(requirement, index);
  if (category === REQUIREMENT_CATEGORY.EDUCATION) return educationEvidence(requirement, index);
  if (category === REQUIREMENT_CATEGORY.EXPERIENCE) {
    return experienceEvidence(requirement, index, options.referenceDate || new Date());
  }
  if (category === REQUIREMENT_CATEGORY.OTHER_CONSTRAINT) return constraintEvidence(requirement, index);

  return unknownEvidence(requirement, index);
}
