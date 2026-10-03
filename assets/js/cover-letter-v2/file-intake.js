import { RESUME_SOURCE } from "./contracts.js";
import { validateResumeFile } from "./input-safety.js";
import { analyzeResumeText } from "./resume-intelligence.js";

export function classifyResumeFile(fileLike) {
  const validation = validateResumeFile(fileLike);
  if (!validation.ok) return validation;
  return {
    ...validation,
    source: validation.extension === "pdf" ? RESUME_SOURCE.PDF : RESUME_SOURCE.DOCX,
  };
}

export function createExtractionResult({ fileLike, extractedText = "", extractionError = "" } = {}) {
  const classification = classifyResumeFile(fileLike);
  if (!classification.ok) return { status: "error", ...classification };

  if (extractionError) {
    return {
      status: "needs_paste_fallback",
      source: classification.source,
      message: "We could not extract readable resume text. Paste the resume text to continue.",
      technicalReason: String(extractionError).slice(0, 300),
    };
  }

  if (!String(extractedText || "").trim()) {
    return {
      status: "needs_paste_fallback",
      source: classification.source,
      message: classification.source === RESUME_SOURCE.PDF
        ? "No readable text was found. If this is a scanned or image-only PDF, paste the resume text to continue."
        : "No readable text was found in this DOCX. Paste the resume text to continue.",
    };
  }

  return {
    status: "ready",
    source: classification.source,
    resume: analyzeResumeText(extractedText, classification.source),
  };
}
