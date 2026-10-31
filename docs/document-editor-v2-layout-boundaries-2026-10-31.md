# Document Editor: Word layout and PDF boundaries — 31 October 2026

## Scope

Continues the 30 October advanced-flow release. Only Document Editor modules, its isolated PDF copy, tests and this report are changed. Frozen Edit PDF and all other tools remain untouched. Physical-device and cross-browser compatibility work is explicitly deferred at the user's request; functional Chromium checks remain part of validating these changes.

## Word improvements

- Preview now uses explicit table grid widths, fixed layout, table alignment/indent, cell padding, shading, supported border styles, vertical alignment and row height/keep-together settings. Unequal **table column** widths are supported; unequal page-section columns remain approximate.
- Compatible continuous sections with matching page geometry share a fragmentation context rather than always starting a separate preview viewport. Sections with different geometry or unequal section-column definitions remain separate.
- Inherited keep-with-next, keep-lines, page-break-before and widow/orphan settings reach preview. Paragraph layout edits preserve these existing settings; minimum line spacing no longer forces smaller text lines than the font size.
- Bold and italic now follow toggle semantics through style inheritance, while direct run formatting remains absolute. Creating a derived style writes the relative toggle needed to achieve the requested appearance.

## PDF improvements

- Overflow cuts on source, receiving and continuation pages consider live text, graphics, annotations and applicable keep groups. Cuts move upward to retain supported objects whole when safe space exists.
- Final graphics and annotation checks still run before page reconstruction. Unknown graphics, side/footer intersections and objects that cannot fit the available band remain protected.
- Graphics bounds account for supported stroked paths, including a conservative transformed stroke/miter envelope. Unsupported grouped graphics/shading continue to be refused.
- Source overflow text/block identifiers are recalculated after adjusting the cut, preventing subsequent editing from relying on the former boundary.
- Refusal for a too-tall boundary object is tested to leave serialized source pages unchanged.

## Verification

- Fresh automated suite: **115/115** tests pass, including frozen-source isolation and the new style/layout and PDF boundary cases.
- Boundary test moves form widgets and whole graphics off both source and receiving pages, preserving field values/appearances. It checks the updated source line/block mapping.
- Rendered mixed-flow test moves an original image that crosses the proposed cut and an added image to page 2. Both retain **640 colored pixels** at the test scale, all **12 scanned text bands** survive, and the OCR correction/native insertion remain present.
- Word rendered test checks one continuous page context, a 1:2 table-column width ratio, cell appearance, edit/export and draft recovery. The existing advanced Word scenario also passes.
- At the preceding validation checkpoint for these changes, the five complex Word files passed **60/60** checks; the ten-PDF corpus passed **39/39** functional checks and **66** visual comparisons across 19 exports. Native expansion retained exact word multiplicities. Mixed-scan and ordinary expansion passed; the oversized form-sentinel replacement remained safely refused with original content retained.

## Remaining scope

This is an incremental fidelity improvement, not full Microsoft Word layout parity. Floating-image wrapping, unequal page-section columns, odd/even section starts, conditional table styles, complete numbering behavior and first/even header/footer preview still need further work or remain approximate. Browser fragmentation cannot certify exact Word pagination without comparison in Word.

PDF objects intersecting fixed band edges, unsupported grouped graphics, scans without a safe whitespace cut, rotated scans, XFA/unknown form geometry and signed documents remain protected. The tool remains unfrozen; the compatibility work requested to be skipped is not being performed in this release.
