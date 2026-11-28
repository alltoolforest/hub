# Scanned PDF to Text V2.2 — owner-approved freeze

Date: 2026-11-28

Status: FROZEN for the accepted staging feature scope by explicit owner decision. Implementation merge: `8c8fa3789b04629b0f8b6311ca7f18cd3cc339f7` (PR #251). Reviewed candidate: `9050824875eb967f16277ae00b408daafc62cff4`.

Qualification workflow https://github.com/alltoolforest/hub/actions/runs/46111584348 passed on implementation `b07699214238e0fa523fa459d37778d28fdd3e47`. See `scanned-pdf-ocr-v2.2-remediation.md` for full measured results and limitations. Original ten-page fixture reportedly passed 36/36 rows. Advanced fixture: 24/24 pages, 99.12% character accuracy, 96.08% word accuracy, 330/397 exact rows, 21/40 exact rupee amounts. Financial data and low-resolution tables require source verification; the tool is not certified for unattended financial extraction. Full advanced Firefox run timed out; advanced WebKit and physical-device qualification remain open. Public-release HOLD is not overridden by this scope freeze. Hosting publication and live manual checks were not independently verified after merge.

Limits retained: desktop 100 MiB/500 pages per run, mobile 15 MiB/10 pages per run. No other tool or site-wide settings changed. Do not reopen for discretionary feature expansion. Reopen only for confirmed production defects, security/compatibility/legal issues, or explicitly approved future releases. Preserve existing qualification and known-risk evidence.
