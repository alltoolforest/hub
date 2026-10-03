import { CANDIDATE_TYPES } from "./contracts.js";
import { LETTER_LENGTHS, LETTER_TONES, MAX_GENERATED_CHARS } from "./writing-contracts.js";
import { rankEvidence } from "./evidence-selector.js";
import { assertGroundedLetter } from "./claim-guard.js";

function cleanSentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
  return text ? text + "." : "";
}

function greeting(candidate) {
  return `Dear ${candidate.recipient || "Hiring Team"},`;
}

function opening(candidate, evidence, tone) {
  const role = candidate.targetPosition || "the advertised role";
  const company = candidate.company || "your organization";
  const first = evidence?.[0]?.evidence?.text;

  if (candidate.candidateType === CANDIDATE_TYPES.FRESHER) {
    return first
      ? `I am applying for the ${role} position at ${company}. My background includes ${first.replace(/[.!?]+$/,"")}, which I hope to apply in this opportunity.`
      : `I am applying for the ${role} position at ${company} and would welcome the opportunity to apply my education, projects, and developing skills in a professional setting.`;
  }

  if (candidate.candidateType === CANDIDATE_TYPES.CAREER_CHANGER) {
    return first
      ? `I am interested in the ${role} position at ${company} as I move into this field. My transferable background includes ${first.replace(/[.!?]+$/,"")}.`
      : `I am interested in the ${role} position at ${company} as I transition into this field and bring transferable experience from my existing background.`;
  }

  const confident = tone === LETTER_TONES.CONFIDENT ? "I am keen to bring" : "I am applying to bring";
  return first
    ? `${confident} my relevant experience to the ${role} position at ${company}. One example from my background is: ${first.replace(/[.!?]+$/,"")}.`
    : `I am applying for the ${role} position at ${company} and would welcome the opportunity to discuss the relevant experience described in my resume.`;
}

function evidenceParagraph(selected, length) {
  const usable = selected.slice(0, length === LETTER_LENGTHS.CONCISE ? 1 : 3);
  if (!usable.length) return "";
  const sentences = usable.map(({ evidence, supports }, index) => {
    const support = supports?.[0]?.requirement;
    const lead = index === 0 ? "Relevant evidence from my background includes" : "I can also point to";
    return support
      ? `${lead} ${evidence.text.replace(/[.!?]+$/,"")}, which is relevant to the role's emphasis on ${support.replace(/[.!?]+$/,"")}.`
      : `${lead} ${evidence.text.replace(/[.!?]+$/,"")}.`;
  });
  return sentences.join(" ");
}

function motivationParagraph(candidate, tone) {
  const motivation = cleanSentence(candidate.motivation);
  if (!motivation) return "";
  if (tone === LETTER_TONES.WARM) return `I am particularly interested in this opportunity because ${motivation.charAt(0).toLowerCase() + motivation.slice(1)}`;
  if (tone === LETTER_TONES.CONCISE) return `My interest in the role is straightforward: ${motivation.charAt(0).toLowerCase() + motivation.slice(1)}`;
  return `I am interested in this opportunity because ${motivation.charAt(0).toLowerCase() + motivation.slice(1)}`;
}

function closing(candidate, tone) {
  if (tone === LETTER_TONES.WARM) return "I would be glad to discuss how my background could contribute to the team. Thank you for your time and consideration.";
  if (tone === LETTER_TONES.CONFIDENT) return "I would welcome a conversation about how my demonstrated experience can support the role. Thank you for considering my application.";
  if (tone === LETTER_TONES.CONCISE) return "I would welcome the opportunity to discuss my fit for the role. Thank you for your consideration.";
  return "I would welcome the opportunity to discuss how my experience aligns with the role. Thank you for considering my application.";
}

function header(candidate) {
  return [
    candidate.fullName,
    [candidate.email, candidate.phone].filter(Boolean).join(" · "),
    candidate.location,
    candidate.linkedinOrPortfolio,
  ].filter(Boolean).join("\n");
}

export function generateCoverLetter(task1State, options = {}) {
  const candidate = task1State?.candidate || {};
  if (!candidate.fullName) throw new Error("Add the candidate's name.");
  if (!candidate.targetPosition) throw new Error("Add the target position.");
  if (!candidate.company) throw new Error("Add the company.");
  if (task1State?.resume?.status !== "ready") throw new Error("Add readable resume text before generating the letter.");
  if (task1State?.job?.status !== "ready") throw new Error("Add a usable job description before generating the letter.");

  const tone = Object.values(LETTER_TONES).includes(options.tone) ? options.tone : LETTER_TONES.PROFESSIONAL;
  const length = Object.values(LETTER_LENGTHS).includes(options.length) ? options.length : LETTER_LENGTHS.STANDARD;
  const selectedEvidence = rankEvidence(task1State, length === LETTER_LENGTHS.CONCISE ? 1 : 3);

  const blocks = [
    header(candidate),
    greeting(candidate),
    opening(candidate, selectedEvidence, tone),
    evidenceParagraph(selectedEvidence, length),
    motivationParagraph(candidate, tone),
    closing(candidate, tone),
    `Kind regards,\n${candidate.fullName}`,
  ].filter(Boolean);

  const letter = blocks.join("\n\n").slice(0, MAX_GENERATED_CHARS);
  const grounding = assertGroundedLetter(letter, task1State);

  return {
    status: "ready",
    tone,
    length,
    letter,
    selectedEvidence,
    grounding,
  };
}

export function rewriteLetterSection(sectionText, instruction, task1State) {
  const text = String(sectionText || "").trim();
  if (!text) return "";
  let result = text;

  switch (instruction) {
    case "shorten":
      result = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
      break;
    case "strengthen":
      result = text.replace(/\bI think I can\b/gi, "I can").replace(/\bI believe I can\b/gi, "I can").replace(/\bhelped to\b/gi, "helped");
      break;
    case "opening":
      result = text.replace(/^I am applying for/i, "I am interested in");
      break;
    case "closing":
      result = "I would welcome the opportunity to discuss how my experience aligns with the role. Thank you for considering my application.";
      break;
    default:
      return text;
  }

  assertGroundedLetter(result, task1State);
  return result;
}
