export const FINDING_STATUS = Object.freeze({
  MATCHED: 'matched',
  PARTIAL: 'partial',
  NOT_FOUND: 'not_found',
  UNCERTAIN: 'uncertain',
  NOT_APPLICABLE: 'not_applicable'
});

export const CONFIDENCE_LEVEL = Object.freeze({
  NONE: 'none',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
});

export const PROVENANCE_KIND = Object.freeze({
  USER_INPUT: 'user_input',
  PARSED: 'parsed',
  DERIVED: 'derived',
  SYSTEM: 'system'
});

export const ANALYSIS_AREA = Object.freeze({
  ATS_READINESS: 'ats_readiness',
  JOB_MATCH: 'job_match'
});


export const REQUIREMENT_IMPORTANCE = Object.freeze({
  REQUIRED: 'required',
  PREFERRED: 'preferred',
  GENERAL: 'general'
});

export const REQUIREMENT_CATEGORY = Object.freeze({
  HARD_SKILL: 'hard_skill',
  TOOL_PLATFORM: 'tool_platform',
  DOMAIN_KNOWLEDGE: 'domain_knowledge',
  SOFT_SKILL: 'soft_skill',
  CERTIFICATION_LICENSE: 'certification_license',
  EDUCATION: 'education',
  EXPERIENCE: 'experience',
  JOB_TITLE_FUNCTION: 'job_title_function',
  METHODOLOGY_PROCESS: 'methodology_process',
  OTHER_CONSTRAINT: 'other_constraint',
  UNKNOWN: 'unknown'
});

export const RUN_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  READY: 'ready',
  RUNNING: 'running',
  COMPLETE: 'complete',
  FAILED: 'failed'
});

export const RESUME_SOURCE_KIND = Object.freeze({
  NONE: 'none',
  PDF: 'pdf',
  DOCX: 'docx',
  TEXT: 'text'
});

function clean(value) {
  return String(value ?? '').trim();
}

function asEvidenceItem(item) {
  if (!item || typeof item !== 'object') {
    throw new TypeError('Evidence items must be objects.');
  }
  return Object.freeze({
    sourceType: clean(item.sourceType),
    section: clean(item.section),
    excerpt: clean(item.excerpt),
    location: clean(item.location),
    provenance: Object.values(PROVENANCE_KIND).includes(item.provenance)
      ? item.provenance
      : PROVENANCE_KIND.DERIVED
  });
}

export function createFinding({
  id,
  area,
  status,
  title,
  sourceText,
  evidence = [],
  confidence = CONFIDENCE_LEVEL.NONE,
  provenance = PROVENANCE_KIND.DERIVED,
  explanation = ''
}) {
  if (!clean(id)) throw new TypeError('Finding id is required.');
  if (!Object.values(ANALYSIS_AREA).includes(area)) throw new TypeError('Finding area is invalid.');
  if (!Object.values(FINDING_STATUS).includes(status)) throw new TypeError('Finding status is invalid.');
  if (!Object.values(CONFIDENCE_LEVEL).includes(confidence)) throw new TypeError('Finding confidence is invalid.');
  if (!Object.values(PROVENANCE_KIND).includes(provenance)) throw new TypeError('Finding provenance is invalid.');

  const normalizedSourceText = clean(sourceText);
  if (!normalizedSourceText) {
    throw new TypeError('Finding sourceText is required so the decision remains explainable.');
  }

  return Object.freeze({
    id: clean(id),
    area,
    status,
    title: clean(title),
    sourceText: normalizedSourceText,
    evidence: Object.freeze((Array.isArray(evidence) ? evidence : []).map(asEvidenceItem)),
    confidence,
    provenance,
    explanation: clean(explanation)
  });
}
