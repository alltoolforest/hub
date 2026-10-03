import { DEFAULT_TEMPLATE_ID, isTemplateId } from "./template-contracts.js";
import { LETTER_LENGTHS, LETTER_TONES } from "./writing-contracts.js";

export const BUILDER_STEPS = Object.freeze([
  "details",
  "resume",
  "target-job",
  "personalization",
  "generate",
  "review",
  "design",
]);

export function createBuilderState(seed = {}) {
  return {
    version: "cover-letter-v2-task3",
    step: BUILDER_STEPS.includes(seed.step) ? seed.step : "details",
    templateId: isTemplateId(seed.templateId) ? seed.templateId : DEFAULT_TEMPLATE_ID,
    tone: Object.values(LETTER_TONES).includes(seed.tone) ? seed.tone : LETTER_TONES.PROFESSIONAL,
    length: Object.values(LETTER_LENGTHS).includes(seed.length) ? seed.length : LETTER_LENGTHS.STANDARD,
    input: seed.input && typeof seed.input === "object" ? seed.input : {},
    draft: String(seed.draft || ""),
    manualEdit: Boolean(seed.manualEdit),
    quality: seed.quality || null,
    updatedAt: Number(seed.updatedAt || Date.now()),
  };
}

export function updateBuilderState(state, patch = {}) {
  const next = { ...state, ...patch, updatedAt: Date.now() };
  if (!BUILDER_STEPS.includes(next.step)) next.step = state.step;
  if (!isTemplateId(next.templateId)) next.templateId = state.templateId;
  return next;
}
