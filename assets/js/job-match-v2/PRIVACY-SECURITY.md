# ATS & Job Match Analyzer V2 — Privacy & Local Processing

## Processing model

The replacement analyzer is designed for local browser processing.

- Resume PDF parsing uses the vendored local PDF.js files in `assets/vendor/pdf.mjs` and `assets/vendor/pdf.worker.mjs`.
- Resume DOCX parsing uses the vendored local Mammoth.js file in `assets/vendor/mammoth.js`.
- Pasted resume text and pasted job-description text are processed by local JavaScript modules.
- Requirement extraction, terminology normalization, ATS Readiness, evidence matching, Job Requirement Coverage, prioritization, dashboard rendering, comparison, and report generation run in the browser.
- No remote AI model is used by the V2 analyzer.
- No resume or job-description text is sent to an AllToolForest server by the V2 analyzer.
- No resume or job-description text is sent to a third-party parsing, analytics, or model service by the V2 analyzer.

Preferred user-facing statement:

> No server upload. Your resume and job description are analyzed in your browser.

## Third-party libraries

The V2 analyzer uses third-party parsing libraries that are stored and loaded locally from the AllToolForest site:

- PDF.js — local module and local worker
- Mammoth.js — local script

These are code dependencies, not remote processing services. The V2 parser loader declares `remoteDependency: false`.

## Analytics boundary

Resume text, job-description text, parsed sections, evidence excerpts, filenames, and analysis findings must not be included in analytics events, URLs, query parameters, log payloads, or telemetry.

Task 9 static checks verify that the V2 package does not introduce analytics or network calls.

## Same-session comparison

Previous-vs-current coverage comparison is held in memory only.

The V2 dashboard does not use:

- localStorage
- sessionStorage
- IndexedDB
- account storage

Starting a new analysis or choosing Clear sensitive data clears the same-session analysis state and comparison history.

## Reports

Copy and TXT export are initiated by the user in the browser.

TXT download uses a temporary browser object URL and revokes that URL immediately after triggering the download.

Print / Save PDF uses the browser print path.

## Security boundary

User-controlled resume and job-description content is rendered with DOM text nodes / `textContent`, not HTML injection APIs.

The system treats formula-like strings such as `=SUM(A1:A2)` as ordinary text. It does not evaluate spreadsheet formulas.

Task 9 also strips control characters, Unicode bidi override/isolate controls, zero-width space/word-joiner/BOM characters at text-ingestion boundaries while preserving normal Unicode letters.

## File/resource limits

- resume file: 25 MB maximum
- pasted resume text: 250,000 characters maximum
- job description: 150,000 characters maximum
- PDF: 100 pages maximum
- parsed resume text: 500,000 characters maximum
- DOCX HTML expansion: 2,000,000 characters maximum

These limits reduce browser memory/denial-of-service risk.
