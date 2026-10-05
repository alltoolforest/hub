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


## Task 3 — Profile Builder UX, Editing & Local Drafts

Implemented Task 3 scope:

- guided profile workflow: details → review → optimize
- mobile-first stacked form and section-card layout
- editable Headline, About, Experience and Skills outputs
- three selectable headline alternatives
- copy-per-section controls
- manual edits preserved across regeneration
- explicit Reset to suggestion per section
- visible separation of supported skills and suggested-to-review skills
- local browser draft save, restore, start new and clear saved data
- scoped storage key: `alltoolforest.linkedin-v2.draft`
- corrupt saved-data recovery and unrelated-storage preservation
- character counters for Headline and About
- 44px mobile action targets and no core horizontal-scroll workflow

Task 3 intentionally does not implement:
- Task 4 accessibility/security/performance hardening
- technical SEO/user-guidance content
- production wiring
- deployment or freeze


## Task 4 — Accessibility, Security, Performance & Technical SEO Hardening

Implemented Task 4 scope:

- browser-local privacy disclosure covering processing, local draft storage, no LinkedIn login and no profile scraping
- field-level target-role validation linked with aria-describedby and aria-invalid
- optimized-section character counters linked programmatically to their textareas
- explicit textual review states so status is not color-only
- forced-colors/high-contrast support
- reduced-motion and mobile reflow retained
- strict text rendering with no unsafe innerHTML/insertAdjacentHTML path
- scoped localStorage behavior and unsupported-schema recovery regression
- maximum practical profile performance fixture and 150 ms deterministic pipeline budget
- production-ready SEO metadata values, canonical path and OG metadata
- crawlable static guidance covering headline, About, experience, skills, target-role keywords, freshers, career changers, truthful achievements and privacy
- focused internal links to Resume Studio, ATS & Job Match Analyzer and Cover Letter Builder
- FAQ and no forced structured data for launch
- headline guidance aligned to the current 220-character LinkedIn headline limit
- About guidance aligned to the current 2,600-character LinkedIn About limit

Task 4 intentionally does not:
- modify `work/linkedin/index.html`
- replace the production LinkedIn tool
- deploy
- run production audit/manual verification/final regression
- freeze the tool

Those actions belong only to Task 5.


## Rework Blueprint — Task 1: Global Target Role Intelligence & Guided Entry

Implemented only the first task of the LinkedIn Profile Helper rework:

- Profile Mode remains the first decision: Fresher / Student, Experienced, Career changer
- Target Role now uses the frozen Resume Studio role engine through a read-only LinkedIn adapter
- LinkedIn autocomplete inherits the verified Resume Studio catalog: 393 titles across 39 categories at this checkpoint
- query threshold starts at 2 characters
- case-insensitive and conservative typo-tolerant matching is inherited from Resume Studio
- target-role selection creates a canonical LinkedIn role record with:
  - title
  - role family
  - category
  - confidence
  - related titles
  - common role skills
  - common responsibilities
  - internal positioning themes
  - provenance
- selected canonical role persists in working state until the user edits the target-role text
- custom unmatched roles remain allowed as a safe General/fallback record without invented skills or responsibilities
- accessible combobox/listbox semantics and Arrow Up/Down, Enter and Escape keyboard handling
- mobile role options retain a 44px practical touch target
- frozen Resume Studio role-engine source remains unchanged

Task 1 intentionally does not implement:

- role-based starter packs
- 5–8 suggestions for Headline/About/Experience/Skills/Achievements/Professional Focus
- Suggested → Confirmed → User-entered evidence-state workflow
- integration of confirmed suggestions into Review & Optimize
- reworked full-page UX from later tasks
- deployment, production audit, or freeze

Production `work/linkedin/index.html` is intentionally unchanged in this task.


## Rework Blueprint — Task 2: Role-Based Profile Starter Pack & Confirmation System

Implemented only Task 2 of the LinkedIn Profile Helper rework:

- selecting a canonical target role now creates role-based starter guidance for:
  - Current headline
  - Current About section
  - Experience text
  - Current skills
  - Achievements / evidence
  - Professional focus / next step
- each main section provides 5–8 options/prompts where appropriate
- role-specific skills and responsibilities are sourced from the read-only Resume Studio role engine
- evidence states are explicit:
  - `suggested`
  - `confirmed`
  - `user_entered`
- every item retains its section, kind, source and role provenance
- suggestions never become Confirmed without an explicit user action
- users can:
  - confirm/deselect suggestions
  - edit suggestion text
  - remove suggestions
  - add their own information
- achievement prompts use blanks rather than fabricated results or metrics and cannot be confirmed until edited into a completed truthful statement
- career-changer mode keeps target-role responsibility ideas separate from transferable ideas derived from a recognized current role
- Fresher mode uses project/education/practical-evidence prompts rather than implying employment history
- custom/unrecognized target roles receive editable generic prompts instead of fabricated skills or responsibilities
- target-role changes:
  - replace unconfirmed role suggestions with new-role suggestions
  - preserve Confirmed and User-entered information
  - flag Confirmed target-role items from the previous role for review instead of silently deleting them
- the existing Role Starter Suggestions UI exposes Suggested / Confirmed / Added by you states and supports mobile selection/editing

Task 2 intentionally does not:

- feed Confirmed/User-entered starter information into Review & Optimize
- rewrite the existing optimizer around the new evidence-state model
- rebuild the final guided page structure
- update persistence to store the new starter-pack state
- deploy the rework to production
- run the release/freeze sequence

Those belong to Tasks 3–5.

Production `work/linkedin/index.html` and frozen Resume Studio remain unchanged.
