import { CANDIDATE_TYPES, createEmptyResume } from './schema.js';
import { createResumeStore } from './state.js';

export const resumeStore = createResumeStore(createEmptyResume(CANDIDATE_TYPES.FRESHER));

export function startResumeStudioV2() {
  return resumeStore;
}
