# ATS & Job Match Analyzer V2 — Tasks 1–7 Foundation

This directory contains the isolated foundations completed through Task 7 of the approved Replacement Master Blueprint. It is not connected to the production analyzer.

## Product separation

The replacement has two independent analysis surfaces:

1. **ATS Readiness** — whether resume content/structure appears parseable and interpretable.
2. **Job Match** — whether resume evidence aligns with requirements from a specific job description.

The top-level match result is **Job Requirement Coverage**, not a universal employer "ATS score".

## Canonical state

`schema.js` defines the state contract for:

- resume source metadata
- extracted resume text
- parsed resume sections
- job-description text
- extracted job requirements
- skills
- qualifications
- certifications
- experience requirements
- job titles
- ATS-readiness findings
- job-match findings
- evidence findings
- priority recommendations
- provenance
- confidence
- analysis metadata

The Task 1 state intentionally contains placeholders/empty collections for later engines. No parsing, extraction, normalization, readiness analysis, evidence matching, coverage calculation, recommendation generation, UI, export, SEO, or deployment behavior is implemented here.

## Finding contract

Every finding must use one of:

- `MATCHED`
- `PARTIAL`
- `NOT_FOUND`
- `UNCERTAIN`
- `NOT_APPLICABLE`

Every finding retains:

- its analysis area
- the source text that caused the decision
- zero or more evidence excerpts
- confidence
- provenance
- an explanation

A finding cannot be created without source text.

## Provenance

Task 1 recognizes:

- `user_input`
- `parsed`
- `derived`
- `system`

## Confidence

Task 1 recognizes:

- `none`
- `low`
- `medium`
- `high`

Later tasks may use these contracts but must not silently replace them with opaque scoring.

## Module boundaries

The planned architecture is recorded in `architecture.js` and keeps ingestion, parsing, extraction, normalization, ATS-readiness, evidence, job match, coverage, recommendations, validation, state, UI and export/reporting as separate responsibilities.

Task 1 implements only:

- analysis contracts
- canonical state schema
- state container
- architecture/release boundaries

## Release boundary

The existing production ATS & Job Match Analyzer remains unchanged.

Task 1 does **not**:

- replace production
- modify `work/job-match/index.html`
- modify `assets/js/work.js`
- implement PDF/DOCX/text ingestion
- implement job-description requirement extraction
- implement terminology normalization
- implement ATS-readiness logic
- implement evidence matching
- implement coverage/scoring
- implement recommendations
- implement results UI
- change SEO

Production replacement remains prohibited until the later blueprint deployment gate.


## Task 2 — local resume ingestion and parsing

Task 2 adds only the input/parsing layer required by the blueprint:

- PDF resume files
- DOCX resume files
- pasted resume text
- pasted job-description text as raw input only
- local same-origin PDF.js and Mammoth parser loading
- PDF page count, text density, sparse/image-only risk, and conservative reading-order diagnostics
- DOCX headings, paragraphs, lists and tables in logical extracted order
- explicit warnings for parser limitations and embedded image text
- clean errors for unsupported, empty, oversized, protected, corrupt, unreadable and memory-constrained inputs

The file-picker acceptance contract is exported as `RESUME_FILE_ACCEPT` for the later UI task. Task 2 does not create production UI.

The parser deliberately does **not**:

- extract job requirements
- classify hard/soft skills
- normalize synonyms
- calculate ATS Readiness findings
- match resume evidence to job requirements
- calculate Job Requirement Coverage
- generate recommendations
- implement the results dashboard
- replace the production analyzer

The job description is stored as raw user input with an empty `requirements` collection until Task 3.

PDF and DOCX parser assets are existing same-origin vendor files already shipped by AllToolForest. Resume contents are passed to those local browser libraries and are not sent to an analysis server by this Task 2 implementation.


## Task 3 — Job Description Requirement Intelligence

Task 3 converts raw job-description text into explainable requirement records without matching those requirements to the resume.

It adds:

- structured JD headings, bullets and sentence segments
- hard-skill extraction
- tool/platform extraction
- domain-knowledge extraction
- soft-skill extraction
- certification/license extraction
- education extraction
- experience-requirement extraction
- job-title/function extraction
- methodology/process extraction
- safely detectable travel, shift, location and work-authorization constraints
- REQUIRED / PREFERRED / GENERAL importance
- multi-word phrase preservation
- section-context inheritance for required/preferred groups
- boilerplate, benefits, EEO and company-marketing suppression
- original source text, source segment and mention provenance
- UNKNOWN + low-confidence fallback where an explicit requirement cannot be safely classified

Task 3 does **not** normalize equivalent terms. For example, `PowerBI` is not converted into `Power BI` and `JS` is not converted into `JavaScript`; that belongs to Task 4.

Task 3 also does not:

- compare requirements with resume evidence
- infer candidate skills
- calculate ATS Readiness
- calculate Job Requirement Coverage
- assign priority recommendations
- create the production dashboard
- replace the production analyzer


## Task 4 — Terminology, Synonym + Skill Normalization

Task 4 adds a separate conservative terminology layer that converts safe equivalent spellings and abbreviations into canonical concepts while preserving the employer's original wording.

Examples include:

- PowerBI → Power BI
- MS Excel / Excel → Microsoft Excel
- AML → Anti-Money Laundering
- KYC → Know Your Customer
- CI CD / CI-CD → CI/CD
- AWS → Amazon Web Services
- GCP / Google Cloud → Google Cloud Platform
- SAP FI/CO → SAP FICO
- SAP Materials Management → SAP MM
- C Sharp → C#
- C Plus Plus → C++
- ICD10 → ICD-10
- Customer Support → Customer Service
- GDPR → General Data Protection Regulation

Ambiguous short forms are context-gated. Examples include JS, HR, TA, RN, AP, AR, GL, BI, ML, SOC and bare Basis.

The independent Task 4 catalog covers common terminology across IT/software, BPO/customer service, banking/compliance, finance/accounting, healthcare, engineering/manufacturing, HR/recruitment, sales/marketing, legal/privacy, logistics, construction, education, retail/hospitality, administration, design, data/AI, cybersecurity, cloud, public-service/GIS and skilled trades.

Explicit false-equivalence guardrails include:

- Java ≠ JavaScript
- SAP Basis ≠ SAP FICO
- SAP MM ≠ SAP SD
- React ≠ JavaScript
- AML ≠ general banking
- KYC ≠ AML
- Power BI ≠ Tableau
- AWS ≠ Azure
- GCP ≠ AWS

Task 4 also exposes conservative word-family normalization for analyze/analysis/analytical, manage/management, and coordinate/coordination. It does not use these families to invent requirements.

Normalized requirements retain:

- original JD source text
- original matched text
- canonical label
- concept ID
- normalization method
- normalization confidence
- original mentions and normalized mentions
- Task 3 importance/provenance

Task 4 does **not**:

- inspect the candidate's resume for matching evidence
- infer that the candidate possesses any normalized skill
- calculate ATS Readiness
- calculate Job Requirement Coverage
- assign recommendations or priority levels
- implement the production dashboard
- replace the production analyzer


## Task 5 — ATS Readiness Engine

Task 5 adds the independent ATS Readiness half of the product. It does not compare the resume to the job description.

The engine produces explainable findings across:

- parseability
- candidate contact signals
- standard resume sections
- date and chronology consistency
- content density
- repeated lines
- custom/unclear heading signals
- unusual symbol usage
- PDF reading-order risk
- DOCX table dependence
- embedded-image text risk
- quantified achievement evidence

Supported section equivalents include common headings for Summary/Objective, Skills, Work Experience, Education, Certifications/Licenses and Projects.

Uploaded PDF/DOCX checks use parser evidence only. The engine never claims that every ATS will reject a table, image, layout or file that raises a risk signal.

Pasted text receives structure/content checks but uploaded-file formatting is explicitly marked NOT_APPLICABLE because file-layout risk cannot be inferred reliably from pasted text.

Quantified achievement detection intentionally excludes obvious phone numbers and date-only lines. It looks for outcome/count contexts such as percentages, currencies, handled/processed volumes, users, cases, tickets and similar measurable evidence.

The ATS Readiness result is a transparent classification:

- STRONG
- NEEDS_REVIEW
- HIGH_RISK
- INSUFFICIENT_DATA

There is no hidden employer score and no interview/hiring prediction.

Task 5 extends Task 2 parser diagnostics only where required for ATS readiness:

- DOCX block/table/heading/list counts
- DOCX table-text ratio
- embedded-image presence
- PDF sparse-page ratio
- PDF possible reading-order page count

Task 5 does **not**:

- compare candidate evidence with job requirements
- infer that a requirement is matched
- calculate Job Requirement Coverage
- prioritize job-match recommendations
- generate tailored resume content
- build the results dashboard
- replace the production analyzer


## Task 6 — Resume Evidence + Job Match Engine

Task 6 performs requirement-by-requirement evidence matching between the candidate's parsed resume and the normalized job-description requirements.

Evidence hierarchy:

1. exact resume phrase
2. safely normalized equivalent terminology
3. contextual evidence in the relevant resume section

The engine preserves the distinction between a keyword being present and the resume clearly evidencing a requirement.

Examples:

- a direct hard skill/tool such as SQL or Power BI can be supported by explicit resume presence
- a soft skill such as Leadership is MATCHED when it appears in Work Experience/Projects, but only PARTIAL when it appears as a standalone skill keyword
- a job title/function is strongest when found in Work Experience
- a certification is MATCHED in Certifications/Licenses and PARTIAL if wording only appears elsewhere
- education requirements compare degree level and, when specified, field of study in the Education section
- numeric experience requirements use non-overlapping Work Experience date ranges only
- year-only employment dates are treated as estimates
- topic-specific experience such as transaction monitoring must appear in Work Experience for a full match
- travel, shift, work-authorization and similar constraints become UNCERTAIN when a resume cannot legitimately prove them
- unknown/proprietary requirements never become fully matched merely because identical wording appears

Each job-match finding retains:

- requirement
- original JD source text
- REQUIRED/PREFERRED/GENERAL importance
- category
- MATCHED/PARTIAL/NOT_FOUND/UNCERTAIN status
- resume evidence excerpts
- source section/location
- confidence
- explanation
- experience-duration evidence where relevant

Task 6 explicitly does **not**:

- calculate Job Requirement Coverage
- assign weights to requirements
- rank or prioritize findings
- create HIGH/MEDIUM/OPTIONAL recommendations
- generate resume content
- build the results dashboard
- replace the production analyzer

The canonical Task 6 state intentionally keeps `jobMatch.coverage = null` and `priorityRecommendations = []` so Task 7 remains a separate release gate.


## Task 7 — Transparent Job Requirement Coverage Model + Prioritization

Task 7 turns the Task 6 requirement-by-requirement evidence findings into a transparent **Job Requirement Coverage** result. It is not an employer ATS score and does not predict hiring outcomes.

### Coverage formula

`Coverage = sum(requirement weight × evidence credit) / sum(assessable requirement weights) × 100`

Evidence credit:

- MATCHED = 1.0
- PARTIAL = 0.5
- NOT_FOUND = 0.0
- UNCERTAIN = excluded from the denominator
- NOT_APPLICABLE = excluded from the denominator
- UNKNOWN/unclassified requirements = excluded from the denominator

Importance weights:

- REQUIRED = 3
- GENERAL = 2
- PREFERRED = 1

Category multipliers:

- hard skill = 1.25
- tool/platform = 1.10
- domain knowledge = 1.25
- soft skill = 0.75
- certification/license = 1.25
- education = 1.25
- experience = 1.25
- job title/function = 1.00
- methodology/process = 1.10
- other constraint = 1.00
- unknown = 0

This means required hard skills, qualifications, certifications, and experience carry substantially more weight than preferred/general soft-skill items. The weights are fixed product logic and are regression-tested for monotonic behavior; they are not calibrated to employer ATS systems or chosen to make results look impressive.

### Coverage labels

- STRONG: at least 80% coverage and no assessable REQUIRED item is NOT_FOUND
- MODERATE: at least 50% coverage, or 80%+ with a required gap
- LIMITED: below 50%
- INSUFFICIENT_DATA: no assessable requirements

### Required result breakdowns

Task 7 exposes separate coverage summaries for:

- Required requirements
- Preferred requirements
- Hard skills
- Tools
- Qualifications
- Certifications
- Experience
- Soft skills

Every assessable requirement also exposes its individual weight, evidence credit, and earned contribution so the percentage can be reconstructed.

### Priority model

- HIGH PRIORITY: an assessable REQUIRED requirement is NOT_FOUND
- MEDIUM PRIORITY: REQUIRED/PREFERRED-excluded important requirements with partial, uncertain, or general missing evidence as defined by the deterministic priority rules
- OPTIONAL: missing or weak PREFERRED requirements

MATCHED findings produce no recommendation.

Recommendations are category-aware and always include truthfulness guardrails. Examples:

- certifications: list only credentials genuinely held
- education: never invent or upgrade a qualification
- experience: never invent employers, dates, duration, or duties
- soft skills: support with a real work/project example rather than keyword stuffing
- travel/work authorization/other constraints: verify manually when the resume cannot prove them
- unknown requirements: review manually rather than guessing

Every recommendation carries the invariant:

`Add, clarify, or strengthen content only when it is genuinely true and supported by your real experience, skills, qualifications, or credentials.`

### Explicit exclusions

Task 7 does **not**:

- use generic JD boilerplate or noise as coverage input
- treat UNCERTAIN as a failure
- treat unknown proprietary requirements as scored failures
- hide requirement weights
- manipulate scores to look impressive
- predict interviews, hiring, recruiter decisions, or employer ATS scores
- build the production results dashboard
- implement Task 8 UI/workflow
- deploy or replace the production analyzer
