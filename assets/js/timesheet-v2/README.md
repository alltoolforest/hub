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
