import { CANDIDATE_TYPES } from "./contracts.js";
import { sanitizeCandidateDetails, sanitizeMotivation } from "./input-safety.js";

export function createCandidateProfile(input = {}) {
  const details = sanitizeCandidateDetails(input);
  const candidateType = Object.values(CANDIDATE_TYPES).includes(details.candidateType)
    ? details.candidateType
    : CANDIDATE_TYPES.EXPERIENCED;

  return Object.freeze({
    ...details,
    candidateType,
    motivation: sanitizeMotivation(input.motivation),
  });
}

export function createTask1State(input = {}) {
  return {
    version: "cover-letter-v2-task1",
    candidate: createCandidateProfile(input.candidate),
    resume: input.resume || null,
    job: input.job || null,
    evidenceMatches: Array.isArray(input.evidenceMatches) ? input.evidenceMatches : [],
  };
}
