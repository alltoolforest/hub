# PDF Compressor — Tasks 10–13 release-candidate report

## Manual performance follow-up

The OnePlus Nord4 report of a three-minute wait reopened mobile performance acceptance. The scoped follow-up reduces stream-decoding and repeated inspection overhead, improves progress stages, and enforces expired worker deadlines. The final candidate completed the same private PDF in 32.0 seconds versus 66.1 seconds for the previous download in local Chromium, with the same output size and preserved content. Physical-phone acceptance remains open. See [the follow-up report](mobile-performance-followup-20261013.md) for current source, artifact hash, measurements, and verification. Historical evidence below remains valid for its recorded revisions.

## Decision and scope

Engineering and automated verification for Tasks 10–13 are prepared for pre-deployment audit. Physical-device, assistive-technology and production-only checks remain explicit release gates, deferred to this final stage at the user's request. This is not production approval or a freeze decision.

The recovered source checkpoint is `977dd06958e6a0cdd1801a9a6a16237122067d17`; diagnostic-boundary and large-memory evidence follow-up is `cc13b2ce371cdb4c7af906997a52c709f7a2f4ef`. Draft PR: https://github.com/alltoolforest/hub/pull/202. The interrupted journal remains in history. Tasks 1–9 and accepted private scan-quality results were retained; only confirmed dependencies for the larger input envelope were changed.

## Task 10 — Performance envelope

Implemented 100,000,000-byte standard and known-capability mobile limits; separate bounded decoded streams, aggregate expansion, image pixels, predictor rows, operators, graph/scalar budgets and private-parser allocations. File ownership moves inspection and processing reads into disposable workers while independently binding the source digest in the main thread. Retry, cancellation, receipt binding and no-expansion remain enforced. Redundant parser and serialization copies were removed; mutation tests verify source immutability.

Files: device-policy, input-inspector, compression-session, worker-bridge, scalar-budget, independent-input-reader, JPEG preflight, private parser/provenance, invariant/adapter/image-verifier dependencies and isolated test hosts.

| Profile | Input ceiling | Total image pixels | Operator ceiling |
| --- | ---: | ---: | ---: |
| Standard | 100 MB | 32 MP | 2,000,000 |
| Known-capability mobile | 100 MB | 32 MP | 2,000,000 |
| Unknown-memory mobile | 12 MiB | 12 MP | 200,000 |
| Low-memory hint, 2 GB or less | 8 MiB | 8 MP | 200,000 |

Per stream: 32,000,000 decoded bytes; standard aggregate: 512,000,000. Unknown/low-memory aggregate: 128,000,000. Individual images remain bounded by the profile. A 100 MB compressed input can still be rejected for decoded complexity. Memory hints do not measure available RAM. Unknown-memory Safari/mobile is not advertised as a 100 MB profile.

| Actual-content fixture | Mode | Input bytes | Output bytes |
| --- | --- | ---: | ---: |
| Four 8 MP scan pages | Balanced | 96,010,241 | 1,730,178 |
| Same scan | Strong | 96,010,241 | 571,465 |
| Same scan | Lossless | 96,010,241 | 21,244,328 |
| Scan with native selectable text | Strong | 96,010,919 | 572,002 |
| Ten distinct protected CSV attachments | All three | 99,999,995 | 342,379 |
| Ten high-entropy attachments | Lossless | 99,999,455 | 99,999,455 |

These synthetic fixtures contain real embedded resources, not trailing padding. All cases passed protected-graph and independent text verification, size reporting and worker cleanup. Entropy fallback has exact original source/output digests. No reduction percentage is promised for other PDFs.

The supplied complex digital PDF also passed its previously interrupted integrated File-session check: 21,607,943 → 20,644,640 bytes, 4.46% savings, three pages, exact text/structure preserved. Its private input and detailed receipt remain outside Git.

Performance: eleven small/medium/large and repeated diagnostic runs passed; cancellation during synchronous lossless optimization passed, with no stale download or active worker after reset. Managed worker backing storage reached about 664 MB in the separate 96 MB scan sample; smaller diagnostic samples peaked around 206 MB. These are sampled CDP counters, exclude main/fixture/native/GPU/RSS memory and can miss transient peaks. CPU utilization was unavailable; wall time and heartbeat are recorded. Large-fixture File construction contributed to observed ~0.4–0.6 second heartbeat gaps. No physical-phone performance certification is inferred.

Unresolved: final physical Android/iOS/low-memory checks. Risk: legitimate complex documents may safely reject and large inputs can still exceed device memory. Dependency change: explicit profiles and verifier budgets replace the old uniform 20 MiB assumption. No WASM rebuild or shared parser change was required.

## Task 11 — Workflow and accessibility

The isolated UI supports Select PDF → mode → Compress → verified result → Download; Balanced defaults, quality explanations, original/output/saved sizes, the mode actually used, cancellation, retry and reset. Failed replacement identifies the still-active source. Filenames are literal text. Scoped styles provide visible focus, large controls and narrow reflow. Status announcements remain outside busy ancestors.

Files: compressor-ui.mjs/.css, candidate-app, candidate/browser QA and builder. The rebuilt offline candidate passed all-mode actual downloads with SHA-256 receipt equality, cancellation/reset, no remote requests and 320px reflow. Axe WCAG 2A/AA and 2.1 AA checks passed in initial/completed/error states. Module-worker UI gates cover 320, 390, 768 and 1280px, keyboard activation, hostile filenames and cleanup in Chromium/Firefox/WebKit.

Unresolved: TalkBack/VoiceOver and actual mobile download interaction. Automated axe does not certify screen-reader usability. Regression risk is session/UI synchronization; receipt, stale-result and lifecycle gates remain in place. No shared CSS changed.

## Task 12 — Naming, metadata and content

Prepared title, description, one H1, canonical `https://alltoolforest.com/documents/pdf-compressor/`, breadcrumb and explanatory mode/privacy/preservation/troubleshooting content in release-candidate-content.html. The candidate keeps noindex and the existing URL. Its CSP restricts document processing to local resources. Unsupported images are preserved where safe inspection succeeds; signed/encrypted/unsafe inputs may reject. Text remains selectable; the tool does not add OCR.

Release activation must update only the `pdf-compressor` entry in assets/js/catalog.js and its references in index.html/documents/index.html, plus the tool page's title/description/OG/breadcrumb/workspace naming. Prepared label: **PDF Compressor**. Prepared description: **Compress eligible PDF images or optimize PDF structure on your device.** Those live/shared files remain unchanged until approved release integration. Do not rebuild or publish unrelated frozen tools or hybrid-build output. Site-wide robots, sitemap, domain and indexing policy remain unchanged.

Verification: HTML/canonical/name inspection, candidate accessibility/reflow, unchanged route and final scope audit. Risk: catalog/page activation must be atomic to avoid stale naming. No general 100 MB promise is made for unknown/low-memory profiles. Remaining activation belongs to the approved release sequence.

## Task 13 — Integrated verification and release preparation

Local affected regression: **57 passed, zero failures/skips**. Pinned qpdf runtime hashes and exact private-parser replacement/hash provenance passed. The full 15-fixture × 3-mode final-integrity corpus verifies reopening, graph identity, text/OCR/geometry, rendering quality, masks, shared/efficient JPEGs, forms, bookmarks, attachments and tags. Local final corpus: 45 cases each in Chromium 141, Firefox 142 and WebKit 26, **135 passed**. Interface and lifecycle gates also passed across those browser engines. Final source CI: **12/12 jobs passed** on `cc13b2ce371cdb4c7af906997a52c709f7a2f4ef`, run https://github.com/alltoolforest/hub/actions/runs/38440493242. The earlier run exposed a stale 20 MiB diagnostic expectation; it was corrected to the 100 MB pre-read boundary and the entire source CI rerun passed.

Privacy/security: local-only network inspection, opaque hostile filenames/errors, signed/encrypted/action safeguards, decoded allocation tests, predictor/scalar/object-stream guards, JPEG DNL/sampling preflight, source immutability and output binding passed. Offline candidate dependencies and notices are embedded. Internal screenshot inspection confirmed the mobile layout; screenshots are not deliverables.

Final diff is limited to assets/js/pdf-compressor-v2, compressor-specific tests/docs, its diagnostic builder and compressor CI. Frozen tools, shared vendors/engines, live tool page, shared app/catalog/styles, robots and sitemap are unchanged. Previously accepted task evidence remains valid; CI adjacent compressor regressions check dependencies without reimplementing them.

## Final manual checklist

1. On OnePlus Nord 4 Chrome, open the final offline candidate, confirm the displayed limit, and test the supplied complex PDF plus a suitable near-100 MB PDF in all three modes. Download/open each result and compare every page; retain originals.
2. Cancel a long run, retry the same file, change modes, submit an invalid/oversize replacement and clear/reset. Confirm no stale download and that the valid source remains recoverable after failed replacement.
3. Check TalkBack: file label, mode/quality, status changes, cancel and result/download focus order. Check VoiceOver on Safari and actual mobile downloads where available.
4. Complete the blueprint OS/device matrix where available: Android Chrome, iPhone Safari, Windows Chrome/Edge/Firefox and macOS Safari, including a low-memory phone. Respect the displayed profile limit; record unsupported resource failures separately from crashes.
5. Any blank/missing/corrupted page, lost text/form/link/attachment, unexpected upload, browser crash or unusable essential control blocks release. Reconfirm accepted scan readability after downloading with the selected mode.

## Deployment and rollback

After manual evidence and pre-deployment audit are accepted, integrate only the isolated compressor page/engine and its exact catalog label references on an approved release branch. Build the candidate from the tested source and pinned runtime; retain licenses. Do not activate legacy rebuilding fallback or rasterize pages. Check the production origin's CSP, WASM/fonts, cache/version URLs, no-upload behavior, links, input limits and actual download bytes before release approval.

Record the previous production revision and compressor page/assets/catalog label before activation. Roll back those scoped artifacts to that exact revision if any integrity/privacy/runtime blocker appears; invalidate only relevant compressor caches and verify restored routing. Repeat production audit, manual verification and directly related regression before freeze. This report authorizes neither merge nor deploy nor freeze.

## Candidate artifact

`PDF_Compressor_Release_Candidate_100MB.html`, 12,273,629 bytes; SHA-256 `5e2cc47c89088e46c39979dcf0f1dff5986c7bea0cb82aa3b9556e5256bcc997`. This self-contained, noindex, local-only candidate embeds the pinned runtime/fonts/notices and runs the verified interface. It is a manual-test release candidate, not the routed production page.

## Final completion checkpoint

**RELEASE CANDIDATE — READY FOR PRE-DEPLOYMENT AUDIT**, with the user-requested end-stage manual checks explicitly pending. Tasks 10–13 engineering/automated deliverables are complete. This report-only checkpoint adds no executable changes to the source commit that passed 12/12 CI jobs.

| CI gate | Result |
| --- | --- |
| Independent input integrity / adjacent compressor regressions | PASS |
| Pinned qpdf runtime/source-build provenance | PASS |
| Interface — Chromium, Firefox, WebKit | PASS (3 jobs) |
| Embedded-image output in three engines | PASS |
| Document-aware modes in three engines | PASS |
| Final-output integrity in three engines | PASS |
| Lossless independent outputs / module-worker CSP | PASS |
| File lifecycle in three engines | PASS |
| Offline diagnostic/candidate, privacy, budgets, performance | PASS |
| Real-content near-100 MB attachments/scans/mixed resources | PASS |

Remaining work is manual device/assistive-technology review, pre-deployment audit, separately authorized release integration/deployment, production audit/regression and then freeze. None of those unperformed gates is reported as passed.
