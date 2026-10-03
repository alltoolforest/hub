import {
  CONFIDENCE_LEVEL,
  PROVENANCE_KIND,
  RESUME_SOURCE_KIND,
  RUN_STATUS
} from './contracts.js';

export const ANALYSIS_SCHEMA_VERSION = 4;

function emptySourceRef() {
  return {
    kind: RESUME_SOURCE_KIND.NONE,
    name: '',
    mediaType: '',
    sizeBytes: 0
  };
}

function emptyRunState() {
  return {
    status: RUN_STATUS.NOT_STARTED,
    startedAt: '',
    completedAt: '',
    errorCode: '',
    errorMessage: ''
  };
}

export function createEmptyAnalysisState() {
  return {
    version: ANALYSIS_SCHEMA_VERSION,

    resume: {
      source: emptySourceRef(),
      extractedText: '',
      parsedSections: [],
      parsing: {
        ...emptyRunState(),
        pageCount: null,
        textDensity: null,
        suspiciouslyEmpty: false,
        probableImageOnly: false,
        readingOrderRisk: 'not_assessed',
        warnings: [],
        limitation: '',
        confidence: CONFIDENCE_LEVEL.NONE,
        provenance: PROVENANCE_KIND.SYSTEM
      }
    },

    jobDescription: {
      rawText: '',
      segments: [],
      requirements: [],
      ignoredSegments: [],
      uncertainSegments: [],
      diagnostics: {
        segmentCount: 0,
        requirementCount: 0,
        ignoredSegmentCount: 0,
        uncertainSegmentCount: 0
      },
      normalization: {
        inputRequirementCount: 0,
        outputRequirementCount: 0,
        normalizedCount: 0,
        unresolvedCount: 0
      }
    },

    extracted: {
      skills: [],
      qualifications: [],
      certifications: [],
      experienceRequirements: [],
      jobTitles: []
    },

    analysis: {
      atsReadiness: {
        ...emptyRunState(),
        findings: []
      },
      jobMatch: {
        ...emptyRunState(),
        findings: [],
        coverage: null
      },
      evidenceFindings: [],
      priorityRecommendations: []
    },

    provenance: {
      resume: PROVENANCE_KIND.USER_INPUT,
      jobDescription: PROVENANCE_KIND.USER_INPUT
    },

    confidence: {
      resumeParsing: CONFIDENCE_LEVEL.NONE,
      jobRequirements: CONFIDENCE_LEVEL.NONE,
      jobMatch: CONFIDENCE_LEVEL.NONE
    },

    metadata: {
      createdAt: '',
      updatedAt: '',
      analysisId: '',
      engineVersion: 'job-match-v2/task-4',
      claims: {
        reproducesEmployerAts: false,
        predictsHiringOutcome: false,
        employerAssignedScore: false
      }
    }
  };
}

export function isCanonicalAnalysisState(value) {
  if (!value || typeof value !== 'object') return false;

  const requiredPaths = [
    value.resume?.source,
    value.resume?.parsedSections,
    value.jobDescription,
    value.jobDescription?.requirements,
    value.extracted,
    value.analysis?.atsReadiness,
    value.analysis?.jobMatch,
    value.analysis?.evidenceFindings,
    value.analysis?.priorityRecommendations,
    value.provenance,
    value.confidence,
    value.metadata
  ];

  return requiredPaths.every((item) => item !== undefined && item !== null) &&
    Array.isArray(value.resume.parsedSections) &&
    Array.isArray(value.resume.parsing?.warnings) &&
    Array.isArray(value.jobDescription.segments) &&
    Array.isArray(value.jobDescription.requirements) &&
    Array.isArray(value.jobDescription.ignoredSegments) &&
    Array.isArray(value.jobDescription.uncertainSegments) &&
    value.jobDescription.diagnostics && typeof value.jobDescription.diagnostics === 'object' &&
    value.jobDescription.normalization && typeof value.jobDescription.normalization === 'object' &&
    Array.isArray(value.extracted.skills) &&
    Array.isArray(value.extracted.qualifications) &&
    Array.isArray(value.extracted.certifications) &&
    Array.isArray(value.extracted.experienceRequirements) &&
    Array.isArray(value.extracted.jobTitles) &&
    Array.isArray(value.analysis.atsReadiness.findings) &&
    Array.isArray(value.analysis.jobMatch.findings) &&
    Array.isArray(value.analysis.evidenceFindings) &&
    Array.isArray(value.analysis.priorityRecommendations);
}
