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
