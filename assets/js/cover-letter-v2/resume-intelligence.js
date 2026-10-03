import { sanitizeResumeText } from "./input-safety.js";

const SECTION_PATTERNS = [
  ["summary", /^(professional\s+)?summary|profile|objective$/i],
  ["experience", /^(work\s+)?experience|employment|professional experience|career history$/i],
  ["skills", /^skills|core competencies|technical skills|key skills$/i],
  ["education", /^education|academic background|qualifications$/i],
  ["certifications", /^certifications?|licenses?|credentials$/i],
  ["projects", /^projects?|academic projects?|personal projects?$/i],
  ["achievements", /^achievements?|accomplishments?|awards?$/i],
  ["internships", /^internships?|industrial training$/i],
  ["volunteering", /^volunteer(ing)?|community service$/i],
];

function detectSection(line) {
  const compact = line.replace(/[:\-–—]+$/g, "").trim();
  const match = SECTION_PATTERNS.find(([, pattern]) => pattern.test(compact));
  return match?.[0] || null;
}

function splitItems(lines) {
  return lines
    .map((line) => line.replace(/^[•●▪◦*\-–—]\s*/, "").trim())
    .filter(Boolean);
}

function extractMetrics(text) {
  const pattern = /\b(?:\d+(?:\.\d+)?%|[$€£₹]\s?\d[\d,.]*|\d[\d,.]*\+?\s+(?:customers?|cases?|tickets?|projects?|users?|hours?|days?|weeks?|months?|years?))\b/gi;
  return [...text.matchAll(pattern)].map((match) => ({
    value: match[0],
    index: match.index,
  }));
}

export function analyzeResumeText(rawText, source = "pasted_text") {
  const text = sanitizeResumeText(rawText);
  if (!text) {
    return {
      status: "empty",
      source,
      rawText: "",
      sections: {},
      evidence: [],
      metrics: [],
      warnings: ["Resume text is empty."],
    };
  }

  const sections = { unclassified: [] };
  let current = "unclassified";

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const section = detectSection(line);
    if (section) {
      current = section;
      sections[current] ||= [];
      continue;
    }
    sections[current] ||= [];
    sections[current].push(line);
  }

  const evidence = [];
  for (const [section, lines] of Object.entries(sections)) {
    for (const item of splitItems(lines)) {
      if (item.length < 2) continue;
      evidence.push({
        id: `resume-${evidence.length + 1}`,
        section,
        text: item,
        source,
      });
    }
  }

  return {
    status: "ready",
    source,
    rawText: text,
    sections,
    evidence,
    metrics: extractMetrics(text),
    warnings: sections.unclassified.length > 8
      ? ["Some resume content could not be assigned to a standard section; it remains available as evidence."]
      : [],
  };
}

export function buildCandidateEvidenceIndex(resumeAnalysis) {
  if (!resumeAnalysis || resumeAnalysis.status !== "ready") return [];
  return resumeAnalysis.evidence.map((item) => ({
    ...item,
    normalizedText: item.text.toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ").trim(),
  }));
}
