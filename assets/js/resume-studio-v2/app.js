import { CANDIDATE_TYPES, createEmptyResume } from './schema.js';
import { createResumeStore } from './state.js';
import { mountResumeStudioUI } from './ui.js';

export const resumeStore = createResumeStore(createEmptyResume(CANDIDATE_TYPES.FRESHER));

export function startResumeStudioV2(root = document.querySelector('#resume-studio-v2-root')) {
  if (!root) {
    throw new Error('Resume Studio V2 root element was not found.');
  }
  return mountResumeStudioUI(root, resumeStore);
}

if (typeof document !== 'undefined') {
  const boot = () => {
    const root = document.querySelector('#resume-studio-v2-root');
    if (root) startResumeStudioV2(root);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}
