# ATS & Job Match Analyzer V2 — Task 1 Architecture

This directory contains only the Task 1 foundation from the approved Replacement Master Blueprint.

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
