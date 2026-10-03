import { REQUIREMENT_PRIORITY } from "./contracts.js";
import { sanitizeJobDescription } from "./input-safety.js";

const REQUIRED_CUE = /\b(required|must|need(?:ed)?|minimum|essential|mandatory)\b/i;
const PREFERRED_CUE = /\b(preferred|nice to have|desirable|bonus|advantage)\b/i;
const QUALIFICATION_CUE = /\b(degree|diploma|certif(?:ication|ied)|license|qualification|bachelor|master|phd|cpa|cfa|rn)\b/i;
const EXPERIENCE_CUE = /\b(experience|years?|background|worked|working|hands-on)\b/i;
const RESPONSIBILITY_CUE = /\b(responsib|manage|build|develop|support|deliver|lead|maintain|analy[sz]e|handle|perform|prepare|design|operate|install|investigate|review)\w*/i;

function priorityFor(text, inherited) {
  if (PREFERRED_CUE.test(text)) return REQUIREMENT_PRIORITY.PREFERRED;
  if (REQUIRED_CUE.test(text)) return REQUIREMENT_PRIORITY.REQUIRED;
  return inherited;
}

function typeFor(text) {
  if (QUALIFICATION_CUE.test(text)) return "qualification";
  if (EXPERIENCE_CUE.test(text)) return "experience";
  if (RESPONSIBILITY_CUE.test(text)) return "responsibility";
  return "skill_or_requirement";
}

function cleanRequirement(text) {
  return text
    .replace(/^[•●▪◦*\-–—\d.)\s]+/, "")
    .replace(/^(required|preferred|requirements?|qualifications?|responsibilities?)\s*[:\-]\s*/i, "")
    .trim();
}

export function analyzeJobDescription(rawText) {
  const text = sanitizeJobDescription(rawText);
  if (!text) {
    return { status: "empty", rawText: "", requirements: [], warnings: ["Job description is empty."] };
  }

  const requirements = [];
  let inheritedPriority = REQUIREMENT_PRIORITY.UNKNOWN;
  const chunks = text.split(/\n|(?<=[.;])\s+(?=[A-Z])/).map((item) => item.trim()).filter(Boolean);

  for (const chunk of chunks) {
    if (/^required(?:\s+qualifications?)?\s*:?$/i.test(chunk)) {
      inheritedPriority = REQUIREMENT_PRIORITY.REQUIRED;
      continue;
    }
    if (/^preferred(?:\s+qualifications?)?\s*:?$/i.test(chunk)) {
      inheritedPriority = REQUIREMENT_PRIORITY.PREFERRED;
      continue;
    }

    const priority = priorityFor(chunk, inheritedPriority);
    const cleaned = cleanRequirement(chunk);
    if (cleaned.length < 3) continue;

    requirements.push({
      id: `job-${requirements.length + 1}`,
      text: cleaned,
      priority,
      type: typeFor(cleaned),
    });
  }

  return {
    status: requirements.length ? "ready" : "unclear",
    rawText: text,
    requirements,
    warnings: requirements.length ? [] : ["No clear job requirements were identified. Review the pasted job description."],
  };
}
