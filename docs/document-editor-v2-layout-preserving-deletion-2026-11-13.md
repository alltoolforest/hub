# Document Editor layout-preserving PDF deletion — 2026-11-13

The reported deletion failed after source text removal, when the upward-compaction guard could not prove it safe to move surrounding content. Treating a movement restriction as a mandatory text-deletion failure prevented removal of isolated text on structured pages.

The exporter now retains the verified source deletion and existing page coordinates for an explicit set of layout constraints: separate columns, structured-vector/image boundaries, rotated pages, footer/annotation/link boundaries and split-widget movement. It records DELETION_LAYOUT_PRESERVED with the reason. Missing source geometry, malformed geometry and failed graphics/vector inspection remain errors. Existing signed/encrypted-document and form-region protections are unchanged. This does not bypass text export validation or use a white overlay.

Column detection now considers separated fragments on the same baseline. Adjacent words in a column are grouped before comparing column widths, so PDF.js word segmentation does not hide the second column. Safe paragraph deletions continue to compact upward. Native editing displays a preserved-layout status when that fallback applies.

Only the Document Editor copy, its cache-versioned entry chain and its regression tests changed. Frozen Edit PDF and other tools are unchanged.

Validation:
- 159 Document Editor unit tests pass.
- 26 DOM stability checks pass.
- Generated structured-page browser workflows at 1280px and 390px pass: direct deletion, exported text removal, exact retained text coordinates, pixel identity outside the deleted heading, retained link URL/rectangle, page count, Undo/Redo, local draft recovery and download.
- Existing supplied-resume regressions pass for deleting an original line and deleting after paragraph expansion: upward movement, export, Undo/Redo, recovery and preservation of the earlier page.
- The form-boundary test confirms a widget that cannot safely move retains its original geometry and value while the already-cleared text stays deleted.

The current attachments contain screenshots and a JPG page preview, not the actual reported PDF. Tests use synthetic structured content and the previously supplied resume. This does not certify the exact reported PDF or physical devices. Manual acceptance and freeze remain pending.
