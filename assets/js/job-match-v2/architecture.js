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

  implementedInTask5: Object.freeze([
    'ats-parseability-findings',
    'contact-signal-detection',
    'resume-section-recognition',
    'date-and-chronology-diagnostics',
    'content-density-diagnostics',
    'duplicate-line-detection',
    'unusual-symbol-diagnostics',
    'docx-table-and-image-risk-signals',
    'pdf-reading-order-risk-signals',
    'quantified-achievement-detection',
    'explainable-ats-readiness-level',
    'canonical-state-ats-readiness-adapter'
  ]),

  implementedInTask6: Object.freeze([
    'section-aware-resume-evidence-index',
    'exact-phrase-evidence',
    'normalized-equivalent-evidence',
    'contextual-soft-skill-evidence',
    'job-title-experience-evidence',
    'certification-section-evidence',
    'education-level-and-field-evidence',
    'non-overlapping-experience-duration',
    'topic-specific-experience-evidence',
    'constraint-uncertainty-guardrails',
    'requirement-by-requirement-job-match-findings',
    'canonical-state-job-match-adapter'
  ]),

  implementedInTask7: Object.freeze([
    'documented-requirement-weight-model',
    'transparent-job-requirement-coverage',
    'matched-partial-not-found-evidence-credit',
    'uncertain-and-not-applicable-exclusions',
    'required-preferred-breakdowns',
    'hard-skill-tool-qualification-certification-experience-soft-skill-breakdowns',
    'high-medium-optional-prioritization',
    'truthful-add-only-if-supported-guardrails',
    'canonical-state-coverage-and-priority-adapter'
  ]),

  implementedInTask8: Object.freeze([
    'results-dashboard-view-model',
    'job-requirement-coverage-dashboard',
    'ats-readiness-dashboard',
    'requirement-evidence-cards',
    'resume-and-jd-evidence-highlighting',
    'priority-actions-dashboard',
    'same-session-coverage-comparison',
    'revised-resume-reanalysis-workflow',
    'copy-txt-print-report-controls',
    'new-analysis-and-sensitive-data-clear-controls',
    'mobile-stacked-results-layout',
    'accessible-native-accordions-and-live-regions',
    'fresher-and-experienced-plain-language-guidance'
  ]),

  implementedInTask9: Object.freeze([
    'privacy-and-local-processing-documentation',
    'hostile-input-boundary-sanitization',
    'malicious-filename-normalization',
    'pdf-page-and-text-resource-ceilings',
    'docx-expansion-and-text-resource-ceilings',
    'large-input-performance-audit',
    'normalized-evidence-performance-remediation',
    'object-url-and-parser-cleanup-audit',
    'accessibility-and-mobile-predeployment-audit',
    'static-indexable-seo-content-candidate',
    'cross-browser-source-compatibility-audit',
    'p0-p1-predeployment-gate'
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
