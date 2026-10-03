export const JOB_MATCH_V2_ARCHITECTURE = Object.freeze({
  product: 'ATS & Job Match Analyzer V2',

  releaseBoundary: Object.freeze({
    productionReplacementAllowed: false,
    currentProductionToolMustRemain: true,
    task: 1
  }),

  analysisSurfaces: Object.freeze([
    Object.freeze({
      id: 'ats_readiness',
      purpose: 'Assess whether resume content and structure can be parsed and interpreted reliably.',
      independentFrom: 'job_match'
    }),
    Object.freeze({
      id: 'job_match',
      purpose: 'Assess how resume evidence aligns with requirements extracted from a specific job description.',
      independentFrom: 'ats_readiness'
    })
  ]),

  plannedModules: Object.freeze([
    'ingestion',
    'resume-parser',
    'job-description-parser',
    'requirement-extractor',
    'terminology-normalization',
    'ats-readiness-engine',
    'evidence-engine',
    'job-match-engine',
    'coverage-engine',
    'recommendations',
    'validation',
    'state',
    'ui',
    'export-reporting'
  ]),

  implementedInTask1: Object.freeze([
    'analysis-contracts',
    'canonical-state-schema',
    'state-container',
    'architecture-boundaries'
  ]),

  implementedInTask2: Object.freeze([
    'resume-ingestion-validation',
    'local-parser-loader',
    'pdf-text-extraction',
    'docx-text-and-structure-extraction',
    'pasted-resume-text-ingestion',
    'pasted-job-description-input',
    'resume-parsing-diagnostics',
    'canonical-state-parser-adapter'
  ]),

  implementedInTask3: Object.freeze([
    'job-description-segmentation',
    'requirement-category-extraction',
    'required-preferred-general-importance',
    'multi-word-phrase-preservation',
    'boilerplate-noise-filtering',
    'source-evidence-provenance',
    'uncertain-unknown-requirement-fallback',
    'canonical-state-job-requirement-adapter'
  ]),

  implementedInTask4: Object.freeze([
    'terminology-concept-catalog',
    'safe-alias-normalization',
    'context-gated-abbreviations',
    'conservative-word-family-normalization',
    'cross-domain-false-positive-guardrails',
    'normalized-requirement-deduplication',
    'original-wording-preservation',
    'canonical-state-normalization-diagnostics'
  ]),

  prohibitedClaims: Object.freeze([
    'reproduces a specific employer ATS',
    'employer assigned this result',
    'predicts interviews',
    'predicts hiring',
    'missing skill belongs to candidate',
    'candidate should add unsupported experience or skills'
  ]),

  primaryResultName: 'Job Requirement Coverage',
  secondaryResultName: 'ATS Readiness'
});
