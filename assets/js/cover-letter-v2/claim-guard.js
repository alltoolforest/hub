const NUMBER_TOKEN = /(?:\d+(?:\.\d+)?%?|[$€£₹]\s?\d[\d,.]*)/g;

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}%$€£₹+#.]+/gu, " ").replace(/\s+/g, " ").trim();
}

function numbers(value) {
  return new Set(String(value || "").match(NUMBER_TOKEN) || []);
}

function containsPhrase(haystack, needle) {
  const h = normalize(haystack);
  const n = normalize(needle);
  return n.length >= 2 && h.includes(n);
}

export function buildGroundingCorpus(task1State) {
  return [
    task1State?.candidate?.fullName,
    task1State?.candidate?.targetPosition,
    task1State?.candidate?.company,
    task1State?.candidate?.recipient,
    task1State?.candidate?.motivation,
    task1State?.resume?.rawText,
  ].filter(Boolean).join("\n");
}

export function validateGeneratedClaims(letter, task1State) {
  const corpus = buildGroundingCorpus(task1State);
  const corpusNumbers = numbers(corpus);
  const generatedNumbers = [...numbers(letter)];
  const unsupportedNumbers = generatedNumbers.filter((value) => !corpusNumbers.has(value));

  const candidate = task1State?.candidate || {};
  const requiredIdentityTerms = [
    candidate.targetPosition,
    candidate.company,
    candidate.fullName,
  ].filter(Boolean);

  return {
    safe: unsupportedNumbers.length === 0,
    unsupportedNumbers,
    identityGrounded: requiredIdentityTerms.every((term) => containsPhrase(letter, term)),
    warnings: unsupportedNumbers.map((value) => `Generated wording contains an unsupported numeric claim: ${value}`),
  };
}

export function assertGroundedLetter(letter, task1State) {
  const result = validateGeneratedClaims(letter, task1State);
  if (!result.safe) {
    throw new Error("Generated wording failed the factual-grounding check. Remove unsupported numerical claims.");
  }
  return result;
}
