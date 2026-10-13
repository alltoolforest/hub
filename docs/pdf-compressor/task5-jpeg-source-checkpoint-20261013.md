# Task 5 — safe JPEG source decoding and private real-scan QA

Continues PR #196 from its verified code checkpoint c69d214c1c21babdc80050777b27a7dbeceb717d
and documentation checkpoint 842f17bcc17070144eba1ee18145ddd5a8f93b31.

## Confirmed capability gap and implementation

Private real-scan tests confirmed that the old image engine retained every JPEG
page image. Lossless structural savings alone were negligible. This change
adds an explicitly injected, pinned PDF.js 6.3.289 software JPEG decoder.
The default input/image policy remains conservative when no decoder is provided.
Dimensions, bit depth, component count and pixel budget are checked before
full JPEG parsing. Supported RGB/grayscale JPEGs use PDF color-space semantics,
without applying standalone-photo EXIF rotation or substituting embedded ICC
profiles for the PDF's explicit color-space dictionary.

Supported APP0/APP2/comment metadata is retained exactly during recompression.
Unverified EXIF, Adobe and custom application semantics preserve the whole
original image. Masks, PDF ICCBased/custom color spaces and decode dictionaries
remain outside the supported transformation scope.
Gray JPEGs with embedded profile/application metadata also remain intact because
the browser codec emits RGB JPEGs; a gray profile cannot be copied into RGB data.
Recompression must save at
least 10% of an existing JPEG stream; final PDF no-expansion checks still apply.
JPEG sources use tighter provisional decoded-pixel limits than Flate sources
(RMS <=6 Balanced / <=10 Strong, average per-channel bias <=5).
The complete protected-object graph and independent page-profile verifier
remain mandatory. A failed quality check cannot release an output.

## Executed local verification

28 selected unit/adjacent regression tests passed with zero skips, including
real software JPEG decoding, forged/oversized dimensions, truncated data,
metadata retention, EXIF fallback and the prior safety/integrity checks.
Three private real-world scanned PDFs (five total pages) passed Chromium Balanced
and Strong compression, full protected-structure verification, independent
render comparisons, and visual review of every page. Both modes delivered
meaningful savings on all three. Their originals contained no OCR/text layer;
this test does not claim to add OCR. Existing synthetic hidden-OCR tests cover
retention of text layers. Source files, rendered images, output PDFs, private
filenames, hashes and detailed results remain outside GitHub.

Expanded synthetic browser QA includes a high-quality JPEG scan and an already
efficient JPEG. Each browser executes 28 cases across both modes, with full-page
render/text comparisons, shared resources, masks, hidden OCR and downsampling.
Final CI run 38352387958 succeeded on code checkpoint
814df909ae0ca23cb78b3d61f563a397cf2a2850. Chromium, Firefox and WebKit each
passed all 28 image cases (84 total), including the new JPEG paths. Input-integrity,
lossless output preservation and pinned-runtime/source-artifact gates also passed.

## Remaining acceptance and dependencies

Task 5 remains open for physical mobile memory/performance evidence. Pixel limits and desktop tests are not a phone
performance guarantee. PDF.js JPEG coefficient buffers add memory beyond raw
pixel arrays and must be included in the device envelope. The software decoder
currently comes from the pinned isolated QA dependency; future runtime bundling
must preserve its provenance. Later mode routing must use injected engine
capabilities rather than assume that conservative input-policy candidate counts
describe all supported JPEG transformations.

Tasks 6–13 remain gated by the canonical blueprint. No production route/UI,
shared engine, frozen tool or Image Enhancer changes; no deployment/freeze.
Overall launch status: NO-GO.
