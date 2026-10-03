import { buildTask1Foundation } from "./task1-foundation.js";
import { generateCoverLetter, rewriteLetterSection } from "./letter-engine.js";
import { checkCoverLetterQuality } from "./quality-checker.js";

export function createCoverLetterDraft(input = {}, options = {}) {
  const foundation = buildTask1Foundation(input);
  const generated = generateCoverLetter(foundation, options);
  const quality = checkCoverLetterQuality(generated.letter, foundation);
  return { foundation, generated, quality };
}

export { generateCoverLetter, rewriteLetterSection, checkCoverLetterQuality };
