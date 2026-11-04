# Document Editor PDF replacement fix — 2026-11-04

## Problem and change

Native Find and Replace restored raw text intents directly. Unlike tapping a paragraph, that path did not invoke measured expansion when replacement text exceeded its original region. Longer titles or paragraphs therefore failed with a mapped-region fit error.

Search replacement now uses the existing queueEdit/queueExpandedEdit and insertion editing paths, retaining detected formatting, page flow and export validation. Expanded clear/insert pairs appear once in search results. Replacing inside an expanded paragraph updates its paired text. Batch notifications are deferred; success creates one Undo entry and a validation failure restores the previous transactions, preview and history. A completed batch clears the transient insertion status so the next search is allowed.

The phone panel shows Find, a multiline Replace with field, Search and a primary Replace button. A context preview identifies the matched page. Previous/Next appear only for multiple matches. Case/whole-word controls and Replace all are under Options. Enter searches; replacement line breaks remain literal, and Ctrl/Command+Enter applies a replacement. Empty replacement deletes the match. Styles are scoped to this PDF search panel.

## Verification

- 157 Document Editor unit tests pass, including existing text, recovery, protected-content failure and history checks.
- 26 DOM stability checks pass.
- Chromium browser workflows at 390px and 1280px pass: longer title at original 24pt, multiline cross-page flow, subsequent replacement in an expanded paragraph without duplicate search entries, deletion/upward flow, multiple-page Replace all, one-step Undo and validated download.
- A two-page batch whose second page is rotated fails safely: the first page's provisional replacement is rolled back, both original titles export unchanged, and no Undo entry is added.
- Zoom slider browser regression passes at both widths: bounds, keyboard, percentage, unfinished edit protection and identical unchanged export bytes.
- Phone panel screenshot inspected; no page-level horizontal overflow or browser script errors observed in those workflows.

This is viewport/browser verification, not physical iPhone certification. The reported private PDF was not attached in this request; the heading replacement was reproduced with a generated native PDF. Unsupported PDF boundaries remain protected. Physical-device/manual acceptance and the final freeze decision remain pending. Frozen Edit PDF and other tools are unchanged.
