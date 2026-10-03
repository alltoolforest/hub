import { CANDIDATE_TYPES, TEMPLATE_IDS, createEmptyResume, isCandidateType } from './schema.js';

export const STORAGE_ENABLED = true;
export const STORAGE_KEY = 'alltoolforest.resume-studio.v2.draft';
export const STORAGE_VERSION = 1;
const MAX_DRAFT_BYTES = 250000;

function text(value, max = 5000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function bool(value) {
  return value === true;
}

function list(value, maxItems = 100, itemMax = 2500) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => text(item, itemMax)).filter(Boolean)
    : [];
}

function objectList(value, normalizer, maxItems = 30) {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => normalizer(item && typeof item === 'object' ? item : {}))
    : [];
}

function normalizeExperience(item) {
  return {
    company: text(item.company, 120),
    position: text(item.position, 120),
    location: text(item.location, 120),
    startDate: text(item.startDate, 20),
    endDate: text(item.endDate, 20),
    current: bool(item.current),
    responsibilities: list(item.responsibilities, 60, 2500),
    achievements: list(item.achievements, 40, 1800),
    responsibilityProvenance: list(item.responsibilityProvenance, 60, 20),
    achievementProvenance: list(item.achievementProvenance, 40, 20)
  };
}

function normalizeEducation(item) {
  return {
    qualification: text(item.qualification, 120),
    specialization: text(item.specialization, 120),
    institution: text(item.institution, 160),
    university: text(item.university, 160),
    location: text(item.location, 120),
    startYear: text(item.startYear, 4),
    completionYear: text(item.completionYear, 4),
    grade: text(item.grade, 40)
  };
}

function normalizeProject(item) {
  return {
    title: text(item.title, 140),
    role: text(item.role, 120),
    description: text(item.description, 1400),
    technologies: list(item.technologies, 60, 800),
    outcome: text(item.outcome, 800),
    descriptionProvenance: text(item.descriptionProvenance, 20) || 'user',
    outcomeProvenance: text(item.outcomeProvenance, 20) || 'user'
  };
}

function normalizeInternship(item) {
  return {
    organization: text(item.organization, 140),
    title: text(item.title, 140),
    startDate: text(item.startDate, 20),
    endDate: text(item.endDate, 20),
    responsibilities: list(item.responsibilities, 60, 1600),
    outcome: text(item.outcome, 800),
    responsibilityProvenance: list(item.responsibilityProvenance, 60, 20),
    outcomeProvenance: text(item.outcomeProvenance, 20) || 'user'
  };
}

function normalizeCertification(item) {
  return {
    name: text(item.name, 160),
    issuer: text(item.issuer, 160),
    year: text(item.year, 4),
    credential: text(item.credential, 240)
  };
}

function validTemplate(value) {
  return Object.values(TEMPLATE_IDS).includes(value) ? value : null;
}

export function normalizeResumeDraft(input) {
  const source = input && typeof input === 'object' ? input : {};
  const candidateType = isCandidateType(source.candidate?.type)
    ? source.candidate.type
    : CANDIDATE_TYPES.FRESHER;
  const resume = createEmptyResume(candidateType);

  resume.candidate.targetRole = text(source.candidate?.targetRole, 120);

  for (const key of Object.keys(resume.contact)) {
    resume.contact[key] = text(source.contact?.[key], key === 'linkedin' || key === 'portfolio' ? 240 : 160);
  }

  const legacyFresherObjective = candidateType === CANDIDATE_TYPES.FRESHER && !source.careerObjective
    ? source.summary
    : null;

  resume.careerObjective.text = text(source.careerObjective?.text ?? legacyFresherObjective?.text, 1200);
  resume.careerObjective.provenance = ['user', 'refined', 'suggested'].includes(source.careerObjective?.provenance ?? legacyFresherObjective?.provenance)
    ? (source.careerObjective?.provenance ?? legacyFresherObjective?.provenance)
    : 'user';

  resume.summary.text = candidateType === CANDIDATE_TYPES.EXPERIENCED
    ? text(source.summary?.text, 1800)
    : '';
  resume.summary.provenance = ['user', 'refined', 'suggested'].includes(source.summary?.provenance)
    ? source.summary.provenance
    : 'user';

  resume.skills = list(source.skills, 100, 1600);
  resume.skillProvenance = list(source.skillProvenance, 100, 20);
  resume.experience = objectList(source.experience, normalizeExperience);
  resume.education = objectList(source.education, normalizeEducation);
  resume.projects = objectList(source.projects, normalizeProject);
  resume.internships = objectList(source.internships, normalizeInternship);
  resume.certifications = objectList(source.certifications, normalizeCertification);
  resume.achievements = list(source.achievements, 100, 1500);
  resume.achievementProvenance = list(source.achievementProvenance, 100, 20);
  resume.interests = list(source.interests, 60, 800);

  resume.personalDetails.enabled = bool(source.personalDetails?.enabled);
  resume.personalDetails.dateOfBirth = text(source.personalDetails?.dateOfBirth, 20);
  resume.personalDetails.languages = list(source.personalDetails?.languages, 30, 100);
  resume.personalDetails.nationality = text(source.personalDetails?.nationality, 80);
  resume.personalDetails.gender = text(source.personalDetails?.gender, 80);
  resume.personalDetails.maritalStatus = text(source.personalDetails?.maritalStatus, 80);

  const sourceDeclaration = source.declaration && typeof source.declaration === 'object'
    ? source.declaration
    : null;
  if (sourceDeclaration) {
    resume.declaration.enabled = bool(sourceDeclaration.enabled);
    resume.declaration.text = text(sourceDeclaration.text, 700);
    resume.declaration.place = text(sourceDeclaration.place, 100);
    resume.declaration.date = text(sourceDeclaration.date, 20);
    resume.declaration.candidateName = text(sourceDeclaration.candidateName, 120);
  }

  const template = validTemplate(source.settings?.template);
  if (template) resume.settings.template = template;

  const enabled = source.settings?.enabledSections;
  if (enabled && typeof enabled === 'object') {
    for (const key of Object.keys(resume.settings.enabledSections)) {
      if (typeof enabled[key] === 'boolean') resume.settings.enabledSections[key] = enabled[key];
    }
  }

  return resume;
}

export function hasMeaningfulResumeData(resume) {
  if (!resume || typeof resume !== 'object') return false;
  return Boolean(
    text(resume.candidate?.targetRole) ||
    text(resume.contact?.fullName) ||
    text(resume.contact?.email) ||
    text(resume.careerObjective?.text) ||
    text(resume.summary?.text) ||
    list(resume.skills).length ||
    (Array.isArray(resume.experience) && resume.experience.length) ||
    (Array.isArray(resume.education) && resume.education.length) ||
    (Array.isArray(resume.projects) && resume.projects.length) ||
    (Array.isArray(resume.internships) && resume.internships.length) ||
    (Array.isArray(resume.certifications) && resume.certifications.length)
  );
}

function getStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__alltoolforest_resume_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function loadResumeDraft() {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable', resume: null };

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { status: 'empty', resume: null };
    if (raw.length > MAX_DRAFT_BYTES) {
      storage.removeItem(STORAGE_KEY);
      return { status: 'discarded', resume: null, reason: 'oversized' };
    }

    const envelope = JSON.parse(raw);
    if (!envelope || envelope.version !== STORAGE_VERSION || typeof envelope.resume !== 'object') {
      storage.removeItem(STORAGE_KEY);
      return { status: 'discarded', resume: null, reason: 'unsupported' };
    }

    return {
      status: 'restored',
      resume: normalizeResumeDraft(envelope.resume),
      savedAt: text(envelope.savedAt, 40)
    };
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch {}
    return { status: 'discarded', resume: null, reason: 'corrupt' };
  }
}

export function saveResumeDraft(resume) {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };

  if (!hasMeaningfulResumeData(resume)) {
    try { storage.removeItem(STORAGE_KEY); } catch {}
    return { status: 'empty' };
  }

  const envelope = {
    version: STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    resume: normalizeResumeDraft(resume)
  };

  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_DRAFT_BYTES) return { status: 'too-large' };

  try {
    storage.setItem(STORAGE_KEY, serialized);
    return { status: 'saved', savedAt: envelope.savedAt };
  } catch {
    return { status: 'failed' };
  }
}

export function clearResumeDraft() {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };
  try {
    storage.removeItem(STORAGE_KEY);
    return { status: 'cleared' };
  } catch {
    return { status: 'failed' };
  }
}

export function createDraftAutosaver(store, onStatus = () => {}, delay = 450) {
  let timer = 0;
  const unsubscribe = store.subscribe((state) => {
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => onStatus(saveResumeDraft(state)), delay);
  });

  return () => {
    globalThis.clearTimeout(timer);
    unsubscribe();
  };
}
