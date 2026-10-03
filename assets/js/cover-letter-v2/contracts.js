export const CANDIDATE_TYPES = Object.freeze({
  FRESHER: "fresher",
  EXPERIENCED: "experienced",
  CAREER_CHANGER: "career_changer",
});

export const EVIDENCE_STRENGTH = Object.freeze({
  STRONG: "strong",
  RELEVANT: "relevant",
  SUPPORTING: "supporting",
  MISSING: "missing",
  UNCERTAIN: "uncertain",
});

export const REQUIREMENT_PRIORITY = Object.freeze({
  REQUIRED: "required",
  PREFERRED: "preferred",
  UNKNOWN: "unknown",
});

export const RESUME_SOURCE = Object.freeze({
  PASTED_TEXT: "pasted_text",
  PDF: "pdf",
  DOCX: "docx",
});

export const MAX_RESUME_CHARS = 120000;
export const MAX_JOB_DESCRIPTION_CHARS = 80000;
export const MAX_MOTIVATION_CHARS = 6000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
