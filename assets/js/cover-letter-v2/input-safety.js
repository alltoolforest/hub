import {
  MAX_JOB_DESCRIPTION_CHARS,
  MAX_MOTIVATION_CHARS,
  MAX_RESUME_CHARS,
  MAX_UPLOAD_BYTES,
} from "./contracts.js";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function normalizePlainText(value, maxLength) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .normalize("NFC")
    .slice(0, maxLength);
}

export function sanitizeCandidateDetails(input = {}) {
  const clean = (value, limit = 300) => normalizePlainText(value, limit).trim();
  return Object.freeze({
    candidateType: clean(input.candidateType, 40),
    fullName: clean(input.fullName),
    email: clean(input.email),
    phone: clean(input.phone),
    location: clean(input.location),
    linkedinOrPortfolio: clean(input.linkedinOrPortfolio, 500),
    targetPosition: clean(input.targetPosition),
    company: clean(input.company),
    recipient: clean(input.recipient),
  });
}

export function sanitizeResumeText(value) {
  return normalizePlainText(value, MAX_RESUME_CHARS).trim();
}

export function sanitizeJobDescription(value) {
  return normalizePlainText(value, MAX_JOB_DESCRIPTION_CHARS).trim();
}

export function sanitizeMotivation(value) {
  return normalizePlainText(value, MAX_MOTIVATION_CHARS).trim();
}

export function validateResumeFile(fileLike = {}) {
  const name = normalizePlainText(fileLike.name, 260).trim();
  const size = Number(fileLike.size || 0);
  const type = String(fileLike.type || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const supported = extension === "pdf" || extension === "docx";
  const mimeSupported =
    !type ||
    type === "application/pdf" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (!name) return { ok: false, code: "missing_file", message: "Choose a PDF or DOCX resume." };
  if (!supported || !mimeSupported) return { ok: false, code: "unsupported_format", message: "Use a PDF or DOCX resume." };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, code: "empty_file", message: "The selected resume file is empty." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, code: "file_too_large", message: "Resume files must be 8 MB or smaller." };
  return { ok: true, extension, name, size };
}
