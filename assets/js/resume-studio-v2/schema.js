export const CANDIDATE_TYPES = Object.freeze({
  FRESHER: 'fresher',
  EXPERIENCED: 'experienced'
});

export const TEMPLATE_IDS = Object.freeze({
  ATS_CLASSIC: 'ats-classic',
  PROFESSIONAL: 'professional',
  MODERN_MINIMAL: 'modern-minimal',
  FRESHER: 'fresher'
});

export const DEFAULT_SECTION_ORDER = Object.freeze({
  fresher: Object.freeze([
    'careerObjective',
    'skills',
    'education',
    'projects',
    'internships',
    'certifications',
    'achievements',
    'interests',
    'personalDetails',
    'declaration'
  ]),
  experienced: Object.freeze([
    'careerObjective',
    'summary',
    'skills',
    'experience',
    'education',
    'certifications',
    'achievements',
    'interests',
    'personalDetails',
    'declaration'
  ])
});

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createEmptyResume(candidateType = CANDIDATE_TYPES.FRESHER) {
  const type = candidateType === CANDIDATE_TYPES.EXPERIENCED
    ? CANDIDATE_TYPES.EXPERIENCED
    : CANDIDATE_TYPES.FRESHER;

  return {
    version: 1,
    candidate: {
      type,
      targetRole: ''
    },
    contact: {
      fullName: '',
      email: '',
      phone: '',
      city: '',
      region: '',
      country: '',
      linkedin: '',
      portfolio: ''
    },
    careerObjective: {
      heading: 'Career Objective',
      text: '',
      provenance: 'user'
    },
    summary: {
      heading: 'Professional Summary',
      text: '',
      provenance: 'user'
    },
    skills: [],
    skillProvenance: [],
    experience: [],
    education: [],
    projects: [],
    internships: [],
    certifications: [],
    achievements: [],
    achievementProvenance: [],
    interests: [],
    personalDetails: {
      enabled: false,
      dateOfBirth: '',
      languages: [],
      nationality: '',
      gender: '',
      maritalStatus: ''
    },
    declaration: {
      enabled: true,
      text: 'I hereby declare that the information provided above is true and correct to the best of my knowledge.',
      place: '',
      date: '',
      candidateName: ''
    },
    settings: {
      template: type === CANDIDATE_TYPES.FRESHER ? TEMPLATE_IDS.FRESHER : TEMPLATE_IDS.ATS_CLASSIC,
      sectionOrder: clone(DEFAULT_SECTION_ORDER[type]),
      enabledSections: {
        careerObjective: true,
        summary: type === CANDIDATE_TYPES.EXPERIENCED,
        skills: true,
        experience: type === CANDIDATE_TYPES.EXPERIENCED,
        education: true,
        projects: type === CANDIDATE_TYPES.FRESHER,
        internships: type === CANDIDATE_TYPES.FRESHER,
        certifications: true,
        achievements: true,
        interests: false,
        personalDetails: false,
        declaration: true
      }
    }
  };
}

export function isCandidateType(value) {
  return value === CANDIDATE_TYPES.FRESHER || value === CANDIDATE_TYPES.EXPERIENCED;
}
