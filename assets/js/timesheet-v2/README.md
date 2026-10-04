# Timesheet & Work Hours V2

## Task 1 — Core Timesheet Data Model & Accuracy Foundation

This package is isolated from the current production Timesheet UI. Task 1 does not modify or mount into production.

Implemented Task 1 scope:

- Monday or Sunday week start
- normalized week-start date and seven calendar dates
- up to three work periods per day
- start/end time, next-day/overnight state and unpaid break per period
- explicit equal-time behavior:
  - same day = 0 minutes
  - next day = 24 hours
- period, daily and weekly totals
- weekly regular/overtime split from a user-supplied threshold
- hours/minutes and decimal-hour representations
- optional rounding: none / nearest 5 / 6 / 10 / 15 minutes
- overlap rejection to prevent double-counted periods
- no jurisdiction-specific overtime law or pay-premium logic

### Rounding policy

When enabled, rounding is applied **per work period after subtracting the unpaid break and before daily/weekly aggregation**. The default is no rounding.

### Boundary

Task 1 intentionally does not implement:

- responsive/mobile builder UI
- live entry UI
- persistence/localStorage
- copy/CSV/PDF export
- accessibility remediation beyond pure data contracts
- SEO/content changes
- production deployment

Those belong to later blueprint tasks.


## Task 2 — Mobile-First Timesheet Builder UX

Task 2 adds an isolated responsive builder layer without changing production.

Implemented:

- responsive weekly builder
- stacked mobile day cards; no core table/horizontal-scroll workflow
- real day/date context
- include/exclude day control
- up to three work periods per day
- add/remove work-period controls
- start/end time, unpaid break and next-day controls
- live daily totals
- live regular/overtime/total weekly summary
- week-start, week-date, overtime-threshold, rounding and display-format controls
- contextual day errors for overlap/calculation failures
- 44px mobile control baseline and reduced-motion handling

Task 2 intentionally does not implement persistence/localStorage, CSV/PDF/copy export, production SEO, production wiring, deployment, or freeze.


## Task 3 — Persistence, Validation & Recovery

Task 3 adds scoped browser-local persistence and stronger recovery/validation without changing production.

Implemented:

- explicit Save this week
- Restore saved week
- Start new timesheet without deleting the saved week
- Clear saved data
- scoped storage key: `alltoolforest.timesheet-v2.week`
- versioned storage envelope and engine-version guard
- bounded stored payload size
- corrupt JSON / unsupported schema / unsupported engine-version recovery
- storage-unavailable failure handling
- per-day validation for malformed time, invalid break, overlap and invalid period data
- global validation for week start, date, overtime threshold, rounding and display format
- invalid days remain in state and do not erase other valid days
- weekly summary is withheld while blocking validation errors remain

Task 3 intentionally does not implement CSV, copy/PDF export, production SEO, production wiring, deployment, or freeze.


## Task 4 — Timesheet Reporting & Export

Task 4 adds engine-backed reporting and export without changing production.

Implemented:

- structured weekly report model sourced directly from the Task 1 calculation engine
- week range, included days, work periods, unpaid breaks, daily totals, weekly regular/overtime/total
- applied overtime threshold and rounding information
- Copy summary
- CSV export with UTF-8 BOM
- spreadsheet-formula injection neutralization for CSV cells
- sanitized deterministic week-based CSV filename
- Print / Save PDF through the browser print dialog
- A4 and US Letter print layouts
- invalid timesheets are blocked from report/export
- mobile-stacked export controls

Task 4 intentionally does not implement Task 5 accessibility/security/performance hardening, Task 6 production SEO/content changes, production wiring, deployment, or freeze.


## Task 5 — Accessibility, Privacy, Security & Performance Hardening

Task 5 hardens the isolated V2 builder without changing production or adding Task 6 SEO work.

Implemented:

- browser-local privacy disclosure covering calculation and local-storage behavior
- scoped Clear Saved Data behavior verified not to remove unrelated storage
- day/date/period-specific accessible names for time, break and overnight controls
- day-level validation messages linked through aria-describedby
- aria-invalid applied to controls while their day contains blocking validation errors
- visible invalid-control styling with forced-colors support
- existing 44px touch targets and reduced-motion behavior retained
- CSV spreadsheet-formula injection protection retained and regression-tested
- printable output script-tag safety regression and overtime disclaimer retained
- delayed CSV object-URL revocation for safer browser download completion
- maximum supported workload test: 7 days × 3 periods = 21 periods
- calculation/validation/report pipeline performance budget: 75 ms in the deterministic regression harness
- no network dependency added to the core timesheet workflow

Task 5 intentionally does not implement Task 6 SEO/user-guidance changes, production wiring, deployment, production audit, manual verification, final regression, or freeze.


## Task 6 — Technical SEO & User Guidance

Task 6 prepares the SEO metadata and crawlable static guidance required for launch without changing the production Timesheet page. Production wiring remains Task 7.

Prepared:

- production title and meta description
- canonical path: `/hub/work/timesheet/`
- expected single H1 text: `Timesheet & Work Hours`
- Open Graph title, description and type
- intentional omission of structured data because no schema is required for launch
- crawlable static guidance covering:
  - how the calculator works
  - work-hours calculation
  - unpaid breaks
  - overnight shifts
  - decimal hours vs hours/minutes
  - user-defined weekly overtime
  - rounding
  - employees/freelancers/shift workers
  - privacy
  - FAQ
- relevant internal links to Time & Duration, Freelance Rate Calculator and Invoice Builder
- legally neutral overtime wording with no jurisdiction-specific compliance claim
- privacy wording aligned to the actual browser-local calculation and local-storage behavior

Task 6 intentionally does not modify `work/timesheet/index.html`, wire production metadata/content, deploy, audit production, run manual verification, final regression, or freeze. Those belong to Task 7.


## Final release status

**Timesheet & Work Hours V2 → PRODUCTION VERIFIED → FROZEN**

Final Task 7 gate:
- pre-deployment audit: PASS
- production replacement: PASS
- production source audit: PASS
- manual verification: skipped by explicit user instruction
- final regression: PASS
- P0: 0
- P1: 0

Freeze policy: do not modify, refactor, redesign, or add features to this tool unless there is a confirmed production defect, security/privacy issue, compatibility regression, legal/compliance requirement, or an explicitly approved future release.
