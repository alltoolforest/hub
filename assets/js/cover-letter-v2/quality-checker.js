import { QUALITY_STATUS } from "./writing-contracts.js";
import { validateGeneratedClaims } from "./claim-guard.js";

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function paragraphCount(text) {
  return String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
}

function contains(text, value) {
  return value && String(text || "").toLowerCase().includes(String(value).toLowerCase());
}

function repeatedPhrases(text) {
  const sentences = String(text || "").toLowerCase().split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const seen = new Set();
  const repeats = [];
  for (const sentence of sentences) {
    const key = sentence.replace(/\s+/g, " ");
    if (seen.has(key)) repeats.push(sentence);
    seen.add(key);
  }
  return repeats;
}

export function checkCoverLetterQuality(letter, task1State) {
  const text = String(letter || "").trim();
  const candidate = task1State?.candidate || {};
  const words = wordCount(text);
  const paragraphs = paragraphCount(text);
  const grounding = validateGeneratedClaims(text, task1State);
  const findings = [];

  const add = (severity, code, message) => findings.push({ severity, code, message });

  if (!contains(text, candidate.targetPosition)) add("high", "missing_role", "Include the target position.");
  if (!contains(text, candidate.company)) add("high", "missing_company", "Include the company name.");
  if (!/^dear\s+/im.test(text)) add("medium", "missing_greeting", "Add an appropriate greeting.");
  if (!/thank you|thank you for|appreciate/i.test(text)) add("medium", "missing_closing", "Add a professional closing or thank-you.");
  if (words < 140) add("medium", "too_short", "The letter may be too brief to show relevant evidence.");
  if (words > 450) add("medium", "too_long", "Consider shortening the letter to keep it focused.");
  if (paragraphs < 4) add("medium", "few_paragraphs", "Use a clear opening, evidence body, motivation, and closing.");
  if (paragraphs > 9) add("low", "many_paragraphs", "Consider combining short paragraphs.");
  if (!task1State?.candidate?.motivation) add("low", "missing_motivation_input", "Add a truthful reason for your interest in the role or company.");
  if (!(task1State?.resume?.metrics || []).length) add("low", "no_resume_metrics", "No measurable resume evidence was detected. Add metrics only if they are genuinely supported.");
  if (repeatedPhrases(text).length) add("low", "repetition", "Remove repeated sentences or phrases.");
  if (grounding.unsupportedNumbers.length) add("high", "unsupported_number", "Remove numerical claims that are not supported by the candidate's supplied information.");

  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const status = high ? QUALITY_STATUS.NEEDS_WORK : medium > 1 ? QUALITY_STATUS.REVIEW : QUALITY_STATUS.STRONG;

  return {
    status,
    wordCount: words,
    paragraphCount: paragraphs,
    findings,
    grounding,
    summary: status === QUALITY_STATUS.STRONG
      ? "Strong structure"
      : `${findings.length} improvement${findings.length === 1 ? "" : "s"} recommended`,
  };
}
