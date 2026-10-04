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
