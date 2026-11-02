# Document Editor iPhone download fix — 2 November 2026

User reports editing succeeds on iPhone but downloading fails. Previous code
clicked a detached download anchor after asynchronous preparation and retained no
visible retry action. This is a fragile delivery path; the exact device/browser
failure was not reproduced on a physical iPhone.

The shared workspace now exposes a prepared file through attached Save file and
Open file links, retaining ordinary automatic downloads. Where navigator.canShare
accepts the actual file, a separate Share / Save to Files button calls share
synchronously from the fresh click. Cancellation retains the prepared file. A
blocked share keeps save/open fallbacks. Editing, rerendering or clearing the
session invalidates old prepared links. pagehide no longer revokes a URL Safari
may still be opening or that a back/forward-cache return still needs.

All export bytes, document validation and editing engines are unchanged. Changes
are confined to Document Editor download/workspace UI, stylesheet, release cache
identifier and tests.

Validation: 144 unit tests pass. Chromium browser tests at phone viewport width
pass normal download and fresh-tap retry with identical bytes for TXT, DOCX, XLSX,
CSV and PDF. Native sharing, cancellation, unsupported capabilities, attached
links and empty TXT are covered by deterministic tests. These checks do not
certify iOS Safari. User must retry on the original iPhone before freeze.
