import { EVIDENCE_STRENGTH, REQUIREMENT_PRIORITY } from "./contracts.js";

const STOP = new Set(["and","or","the","a","an","to","of","for","with","in","on","at","by","from","is","are","be","as","this","that","required","preferred","experience","years","year"]);

const ALIASES = new Map([
  ["aws", ["amazon web services"]],
  ["amazon web services", ["aws"]],
  ["ms excel", ["microsoft excel", "excel"]],
  ["microsoft excel", ["ms excel", "excel"]],
  ["aml", ["anti money laundering"]],
  ["anti money laundering", ["aml"]],
  ["kyc", ["know your customer"]],
  ["know your customer", ["kyc"]],
  ["powerbi", ["power bi"]],
  ["power bi", ["powerbi"]],
]);

const NON_EQUIVALENT = [
  ["java", "javascript"],
  ["sap basis", "sap fico"],
  ["power bi", "tableau"],
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}+#.]+/gu, " ").replace(/\s+/g, " ").trim();
}

function variants(value) {
  const normalized = normalize(value);
  const set = new Set([normalized]);
  for (const [key, aliases] of ALIASES) {
    if (normalized.includes(key)) aliases.forEach((alias) => set.add(normalized.replace(key, alias)));
  }
  return [...set];
}

function tokens(value) {
  return normalize(value).split(" ").filter((token) => token.length > 1 && !STOP.has(token));
}

function explicitlyNonEquivalent(requirement, evidence) {
  const r = normalize(requirement);
  const e = normalize(evidence);
  return NON_EQUIVALENT.some(([a,b]) =>
    (r.includes(a) && e.includes(b) && !r.includes(b)) ||
    (r.includes(b) && e.includes(a) && !r.includes(a))
  );
}

function overlap(requirement, evidence) {
  if (explicitlyNonEquivalent(requirement, evidence)) return 0;
  const evidenceVariants = variants(evidence);
  let best = 0;
  for (const rv of variants(requirement)) {
    const rt = tokens(rv);
    if (!rt.length) continue;
    for (const ev of evidenceVariants) {
      const et = new Set(tokens(ev));
      const hits = rt.filter((token) => et.has(token)).length;
      best = Math.max(best, hits / rt.length);
    }
  }
  return best;
}

export function matchEvidenceToRequirements(evidenceIndex = [], requirements = []) {
  return requirements.map((requirement) => {
    const ranked = evidenceIndex
      .map((evidence) => ({ evidence, score: overlap(requirement.text, evidence.text) }))
      .sort((a,b) => b.score - a.score);

    const best = ranked[0] || null;
    let strength = EVIDENCE_STRENGTH.MISSING;
    if (best?.score >= 0.72) strength = EVIDENCE_STRENGTH.STRONG;
    else if (best?.score >= 0.45) strength = EVIDENCE_STRENGTH.RELEVANT;
    else if (best?.score >= 0.22) strength = EVIDENCE_STRENGTH.SUPPORTING;
    else if (requirement.priority === REQUIREMENT_PRIORITY.UNKNOWN) strength = EVIDENCE_STRENGTH.UNCERTAIN;

    return {
      requirementId: requirement.id,
      requirement: requirement.text,
      priority: requirement.priority,
      strength,
      evidence: best && best.score >= 0.22 ? [best.evidence] : [],
      confidence: Number((best?.score || 0).toFixed(3)),
    };
  });
}
