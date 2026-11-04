# Document Editor PDF zoom slider — 2026-11-04

Replaced the native PDF minus/plus controls with an accessible slider and visible percentage. The range remains 60–200%, with 5% keyboard steps. Dragging updates the label; releasing commits through the existing changeView/zoom/render path. Unfinished-edit protection and zoom snapshot semantics remain.

A one-time visibility observer applies that same zoom action after the hybrid host becomes visible. Previously the first render could use a hidden host's zero width and minimum fit; the next zoom then jumped from that small fit. The observer disconnects after fitting and on disposal.

Scope: view controls and cache-versioned entry imports only. Text editing, PDF reflow, parsing and export routines are unchanged. Frozen Edit PDF and other tools are untouched.

Validation: 157 Document Editor unit tests and 26 DOM stability checks pass. Browser checks at 1280px and 390px pass for initial fit, min/max scale, keyboard stepping, percentage, unchanged PDF export bytes, no page-level horizontal overflow and retention of unfinished text when zoom is refused. These are viewport checks, not physical-device certification.

Document Editor remains unfrozen pending user manual acceptance, including confirmation of the earlier iPhone save fix, followed by final regression/freeze approval.
