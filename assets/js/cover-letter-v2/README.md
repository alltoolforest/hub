# Cover Letter Builder V2 — Task 1 Foundation

This directory is an isolated implementation of **Task 1 — Candidate, Resume & Job Intelligence Foundation** from the approved five-task Cover Letter Builder Replacement Master Blueprint.

## Release boundary

- This package is **not connected to the production Cover Letter Builder**.
- It does not generate cover letters.
- It does not contain templates, preview, export, tone controls, quality scoring, draft persistence, SEO page changes, or deployment work from Tasks 2–5.
- Frozen ATS & Job Match Analyzer code is not modified or imported.
- Other AllToolForest tools are not modified.

## Task 1 capabilities

- Candidate modes: fresher/student, experienced, career changer.
- Candidate/contact/target-company/recipient inputs.
- Motivation/company-interest input with bounded plain-text sanitation.
- Pasted resume text analysis.
- PDF/DOCX file validation and extraction-result/fallback contract.
- Resume section/evidence indexing for experience, skills, education, certifications, projects, achievements, internships and volunteering.
- Metric discovery without inventing metrics.
- Job-description requirement extraction.
- Required/preferred/unknown requirement classification.
- Requirement typing for skills/general requirements, experience, qualifications and responsibilities.
- Conservative evidence-to-requirement matching.
- Explicit non-equivalence guardrails for Java/JavaScript, SAP Basis/SAP FICO and Power BI/Tableau.
- Known aliases for AWS, Microsoft Excel, AML, KYC and Power BI.
- Unknown requirements remain uncertain rather than being fabricated.

## File extraction boundary

Task 1 defines safe PDF/DOCX intake and extraction-result behavior. The production page is intentionally untouched. Parser wiring into a future V2 UI belongs to later integration work; scanned/image-only PDFs explicitly fall back to pasted text rather than adding OCR outside the approved V1 scope.

## Security/performance boundaries

- Text inputs are normalized as plain text and bounded.
- Resume uploads are limited to PDF/DOCX and 8 MB.
- No network calls.
- No persistent storage.
- No unsafe HTML rendering.
- No dependency on the frozen ATS Analyzer.


## Task 2 — Evidence-Based Writing Engine + Quality Checker

Task 2 adds only the approved writing-intelligence layer on top of the verified Task 1 foundation.

Implemented:

- complete cover-letter text structure: candidate header, greeting, opening, evidence body, motivation, closing and sign-off
- candidate-aware framing for fresher/student, experienced and career-changer modes
- evidence prioritization with a maximum of three supporting items
- preference for truthful measurable evidence when available
- REQUIRED requirements weighted above PREFERRED requirements during evidence selection
- Professional, Concise, Warm and Confident tone controls
- Concise and Standard length modes
- controlled section refinements: shorten, strengthen wording, opening adjustment and closing adjustment
- numeric claim-grounding guard that blocks unsupported generated metrics
- deterministic Cover Letter Quality Checker for role/company presence, greeting, closing, length, paragraph structure, motivation, metrics, repetition and unsupported numbers
- no interview-probability or employer-ATS claims

Task 2 does **not** add templates, live preview, production UI, draft persistence, PDF/DOCX export, production SEO changes, deployment or production replacement. Those remain Tasks 3–5.


## Task 4 — Export, Privacy, Security, Performance & SEO

Task 4 adds the approved launch-readiness infrastructure without deploying or replacing production.

Implemented:

- copy-to-clipboard export
- browser-native Print / Save PDF with A4 and US Letter print layouts
- direct PDF exporter adapter contract with strict PDF Blob validation
- sanitized export filenames
- privacy messaging for browser-local generation and device-local saved drafts
- editable-text, filename and URL security guards
- workload/performance budgets aligned with the existing Task 1 limits
- non-critical-work scheduling helper
- production SEO metadata/content model with title, description, canonical path, guidance sections and FAQ
- Task 3 builder integration for copy, print/save-PDF and optional direct-PDF download

### Direct PDF dependency

The repository currently has no bundled PDF-generation library. Task 4 intentionally does not add a remote CDN dependency or fake a PDF download. The one-click Download PDF control activates only when a trusted bundled PDF exporter is supplied through the adapter. Print / Save PDF is fully available through the browser.

DOCX remains a preferred, non-blocking enhancement and is not implemented in Task 4.

Task 4 does not deploy, replace the production page, modify production SEO tags, or freeze the tool. Those gates belong to Task 5.
