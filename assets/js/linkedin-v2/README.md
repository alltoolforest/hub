# LinkedIn Profile Helper V2

## Task 1 — Profile Intelligence & Evidence Foundation

This package is isolated from the current production LinkedIn Profile Helper.

Implemented Task 1 scope:

- candidate modes: Fresher/Student, Experienced, Career changer
- structured inputs for target role, current role, industry, current headline, About, experience, skills, achievements, professional goal and optional resume text
- bounded text inputs
- source-traceable evidence extraction
- explicit verified-vs-suggested role alignment
- protected false-equivalence guards for Java/JavaScript, SAP Basis/SAP FICO and Power BI/Tableau
- conservative target-role suggestion library
- no employer, metric, certification, experience, or skill invention

Task 1 intentionally does not implement:
- headline/About/experience generation
- profile review scoring/checklist
- UI replacement
- local draft persistence
- accessibility/SEO hardening
- production wiring or deployment


## Task 2 — Evidence-Based Profile Optimization Engine

Implemented Task 2 scope:

- three headline alternatives: professional/balanced, concise, evidence/keyword focused
- headline length guard
- structured standard and concise About generation
- evidence-grounded experience rewriting
- supported skills vs target-role suggestions kept separate
- deterministic profile review using Strong / Needs attention / Missing states
- review checks for headline, About, experience, skills, evidence strength, target-role consistency, generic wording and repetition
- no opaque profile score
- refinement actions for shorten, stronger opening, concise wording and professional wording
- grounding guards for unsupported metrics and suggested skills becoming factual claims
- target-role and candidate-mode variation preserved

Task 2 intentionally does not implement:
- production UI replacement
- section-card workflow
- local draft persistence
- copy-per-section controls
- accessibility/SEO hardening
- production wiring or deployment
