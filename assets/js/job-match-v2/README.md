# ATS & Job Match Analyzer V2 — Tasks 1–4 Foundation

This directory contains the isolated foundations completed through Task 4 of the approved Replacement Master Blueprint. It is not connected to the production analyzer.

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
