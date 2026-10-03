import { EVIDENCE_STRENGTH, REQUIREMENT_PRIORITY } from "./contracts.js";

const STRENGTH_WEIGHT = Object.freeze({
  [EVIDENCE_STRENGTH.STRONG]: 4,
  [EVIDENCE_STRENGTH.RELEVANT]: 3,
  [EVIDENCE_STRENGTH.SUPPORTING]: 1,
  [EVIDENCE_STRENGTH.MISSING]: 0,
  [EVIDENCE_STRENGTH.UNCERTAIN]: 0,
});

const PRIORITY_WEIGHT = Object.freeze({
  [REQUIREMENT_PRIORITY.REQUIRED]: 3,
  [REQUIREMENT_PRIORITY.PREFERRED]: 1,
  [REQUIREMENT_PRIORITY.UNKNOWN]: 0,
});

const SECTION_WEIGHT = Object.freeze({
  achievements: 4,
  experience: 3,
  projects: 2.5,
  certifications: 2.5,
  education: 2,
  internships: 2,
  volunteering: 1.5,
  skills: 1,
  unclassified: 0.5,
});

function hasMetric(text) {
  return /\b(?:\d+(?:\.\d+)?%|[$€£₹]\s?\d[\d,.]*|\d[\d,.]*\+?\s+(?:customers?|cases?|tickets?|projects?|users?|hours?|days?|weeks?|months?|years?))\b/i.test(text || "");
}

export function rankEvidence(task1State, limit = 3) {
  const byId = new Map((task1State?.resume?.evidence || []).map((item) => [item.id, item]));
  const scored = new Map();

  for (const match of task1State?.evidenceMatches || []) {
    if (!match.evidence?.length || !STRENGTH_WEIGHT[match.strength]) continue;
    for (const evidence of match.evidence) {
      const source = byId.get(evidence.id) || evidence;
      const score =
        STRENGTH_WEIGHT[match.strength] * 10 +
        PRIORITY_WEIGHT[match.priority] * 4 +
        (SECTION_WEIGHT[source.section] || 0) +
        (hasMetric(source.text) ? 5 : 0);
      const current = scored.get(source.id);
      if (!current || score > current.score) {
        scored.set(source.id, {
          evidence: source,
          score,
          supports: [{ requirement: match.requirement, priority: match.priority, strength: match.strength }],
        });
      } else {
        current.supports.push({ requirement: match.requirement, priority: match.priority, strength: match.strength });
      }
    }
  }

  const ranked = [...scored.values()].sort((a,b) => b.score - a.score);

  if (ranked.length < limit) {
    for (const evidence of task1State?.resume?.evidence || []) {
      if (ranked.some((item) => item.evidence.id === evidence.id)) continue;
      if (!["achievements","experience","projects","certifications","education","internships","volunteering"].includes(evidence.section)) continue;
      ranked.push({
        evidence,
        score: (SECTION_WEIGHT[evidence.section] || 0) + (hasMetric(evidence.text) ? 5 : 0),
        supports: [],
      });
      if (ranked.length >= limit) break;
    }
  }

  return ranked.slice(0, Math.max(1, Math.min(3, limit)));
}
