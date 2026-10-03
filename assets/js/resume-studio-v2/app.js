import { CANDIDATE_TYPES, createEmptyResume } from './schema.js';
import { createResumeStore } from './state.js';
import { createDraftAutosaver, loadResumeDraft } from './storage.js';
import { mountResumeStudioUI } from './ui.js';

const detectedDraft = loadResumeDraft();
export const resumeStore = createResumeStore(createEmptyResume(CANDIDATE_TYPES.FRESHER));

export function startResumeStudioV2(root = document.querySelector('#resume-studio-v2-root')) {
  if (!root) {
    throw new Error('Resume Studio V2 root element was not found.');
  }

  let stopAutosave = () => {};
  let autosaveStarted = false;
  const startAutosave = () => {
    if (autosaveStarted) return;
    autosaveStarted = true;
    stopAutosave = createDraftAutosaver(resumeStore, (result) => {
      ui.setStorageStatus(result);
    });
  };

  const ui = mountResumeStudioUI(root, resumeStore, {
    restoredDraft: detectedDraft,
    onDraftResolved: startAutosave
  });

  if (detectedDraft.status !== 'restored') startAutosave();

  if (detectedDraft.status === 'restored') {
    ui.setStorageStatus({ status: 'available', savedAt: detectedDraft.savedAt });
  } else if (detectedDraft.status === 'discarded') {
    ui.setStorageStatus({ status: 'discarded', reason: detectedDraft.reason });
  } else if (detectedDraft.status === 'unavailable') {
    ui.setStorageStatus({ status: 'unavailable' });
  }

  return {
    ...ui,
    destroy() {
      stopAutosave();
      ui.destroy();
    }
  };
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
