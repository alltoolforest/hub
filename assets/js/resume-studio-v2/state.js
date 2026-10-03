import {
  CANDIDATE_TYPES,
  DEFAULT_SECTION_ORDER,
  TEMPLATE_IDS,
  createEmptyResume,
  isCandidateType
} from './schema.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function reconcileCandidateType(resume, nextType) {
  const next = clone(resume);
  next.candidate.type = nextType;
  next.careerObjective = next.careerObjective || { heading: 'Career Objective', text: '', provenance: 'user' };
  next.careerObjective.heading = 'Career Objective';
  next.summary = next.summary || { heading: 'Professional Summary', text: '', provenance: 'user' };
  next.summary.heading = 'Professional Summary';

  next.settings.sectionOrder = clone(DEFAULT_SECTION_ORDER[nextType]);
  next.settings.enabledSections.careerObjective = true;
  next.settings.enabledSections.summary = nextType === CANDIDATE_TYPES.EXPERIENCED;
  next.settings.enabledSections.experience = nextType === CANDIDATE_TYPES.EXPERIENCED;
  next.settings.enabledSections.projects = nextType === CANDIDATE_TYPES.FRESHER;
  next.settings.enabledSections.internships = nextType === CANDIDATE_TYPES.FRESHER;

  if (nextType === CANDIDATE_TYPES.FRESHER && next.settings.template === TEMPLATE_IDS.ATS_CLASSIC) {
    next.settings.template = TEMPLATE_IDS.FRESHER;
  } else if (nextType === CANDIDATE_TYPES.EXPERIENCED && next.settings.template === TEMPLATE_IDS.FRESHER) {
    next.settings.template = TEMPLATE_IDS.ATS_CLASSIC;
  }

  return next;
}

export function createResumeStore(initialResume = createEmptyResume()) {
  let state = clone(initialResume);
  const listeners = new Set();

  function notify() {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
  }

  function getState() {
    return clone(state);
  }

  function replace(nextResume) {
    state = clone(nextResume);
    notify();
  }

  function update(updater) {
    const draft = getState();
    const next = typeof updater === 'function' ? updater(draft) : updater;
    if (!next || typeof next !== 'object') {
      throw new TypeError('Resume state updates must produce a resume object.');
    }
    replace(next);
  }

  function setCandidateType(nextType) {
    if (!isCandidateType(nextType)) {
      throw new TypeError('Candidate type must be fresher or experienced.');
    }
    if (state.candidate.type === nextType) return;
    state = reconcileCandidateType(state, nextType);
    notify();
  }

  function setTargetRole(targetRole) {
    state.candidate.targetRole = String(targetRole || '').trim();
    notify();
  }

  function reset(candidateType = state.candidate.type) {
    state = createEmptyResume(candidateType);
    notify();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Resume store subscriber must be a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    replace,
    update,
    setCandidateType,
    setTargetRole,
    reset,
    subscribe
  };
}
