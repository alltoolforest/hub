# Professional Writing Assistant V2 — Task 1

This folder contains the isolated Task 1 writing-engine foundation.

Implemented:

- two modes: Write / Improve existing writing
- six workplace message types
- audience controls
- six tone controls
- short / standard / detailed length controls
- message-specific input contracts
- automatic subject generation where relevant
- deterministic fact-preserving message construction
- improve-existing objectives:
  - professional
  - clearer
  - concise
  - warmer
  - diplomatic
  - confident
- protected-detail preservation for names, dates, numbers, percentages, currency, email addresses, URLs and quoted text
- bounded source input
- no account/network dependency

Task 1 deliberately does **not** change production UI, add persistence, field-level accessibility validation, SEO content, deployment, or release/freeze behavior. Those remain Tasks 2–4.


## Task 2 — Simple Guided UX, Editing, Persistence & Accessibility

Implemented only Task 2 of the remediation blueprint:

- two clear entry modes:
  - Write a professional message
  - Improve existing writing
- Write flow:
  - message type
  - audience
  - tone
  - message-specific key information
  - Create professional wording
- Improve flow:
  - paste existing writing
  - choose improvement objective
  - Improve writing
- irrelevant fields stay hidden because each message type renders only its own field set
- lower-priority context is kept under **More options**
- output supports:
  - editable subject when relevant
  - editable message
  - Copy
  - Regenerate from current inputs
  - Download TXT
  - New message
- browser-local draft controls:
  - Save draft
  - Restore draft
  - Clear saved draft
- local draft schema is scoped to the Professional Writing Assistant
- corrupt/unsupported stored data fails safely
- manual output edits are preserved while inputs change and are overwritten only by explicit regenerate
- field-specific validation:
  - `aria-invalid`
  - `aria-describedby`
  - visible field error text
  - focus first invalid field
  - collapsed advanced section opens before focusing an invalid field inside it
- source-order keyboard navigation; no positive tabindex
- restrained live status messages
- responsive rules for 700px, 390px, 360px and 320px
- practical 44px mobile action targets

Task 2 intentionally does **not**:

- change `work/writing/index.html`
- replace the existing production Writing Assistant
- add Task 3 privacy/security/performance/SEO guidance
- deploy the V2 interface
- run the release/freeze sequence

Those remain Tasks 3–4.
