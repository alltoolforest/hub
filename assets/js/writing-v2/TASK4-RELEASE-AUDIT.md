# Professional Writing Assistant V2 — Task 4 Release Gate

Date: 2026-10-05
Branch: `professional-writing-task4-20261005`
Baseline: verified Task 3 branch `professional-writing-task3-20261005`

## Task 4 scope

Replace the old production Professional Writing Assistant with the verified V2 implementation, then follow the permanent AllToolForest release sequence:

**Implement → Pre-deployment audit → Deploy → Production audit → Manual verification where required → Regression → Freeze**

No new product capability belongs in Task 4.

## Production replacement

- `work/writing/index.html` now mounts the isolated V2 bootstrap directly.
- The old shared `assets/js/app.js` → `assets/js/work.js` Writing Assistant path is not loaded on this page.
- Other Work tools still use their existing shared runtime unchanged.
- The production page contains crawlable guidance, privacy disclosure and FAQ content.
- The production page is indexable; the Task 3 candidate remains noindex.

## Pre-deployment gates

Required before merge:

- Task 1 regression PASS
- Task 2 regression PASS
- Task 3 regression PASS
- Task 4 production-page regression PASS
- syntax checks PASS
- exact diff limited to Professional Writing Assistant V2 assets, its production page and dedicated CI
- no frozen/unrelated tool changes
- P0 = 0
- P1 = 0

## Production audit after merge

Verify:

- production URL returns successfully
- V2 bootstrap/CSS assets return successfully
- production HTML references V2 directly
- old shared Writing Assistant runtime is not loaded by this page
- production HTML is indexable and contains the Task 3 guidance/privacy content
- deployment commit contains no unrelated modifications
- GitHub Pages serves the merged revision

## Manual verification

Where practical, confirm on a real browser/device:

- Write flow
- Improve flow
- editable result
- Copy
- Download TXT
- Save / Restore / Clear draft
- keyboard focus/error behavior
- narrow mobile layout

Do not claim physical-device verification unless it was actually performed.

## Freeze gate

Freeze only after production audit and required manual verification reveal no P0/P1 blocker.

Once frozen, reopen only for a confirmed production bug, security/privacy issue, compatibility regression, legal/compliance requirement, or explicitly approved later release.
