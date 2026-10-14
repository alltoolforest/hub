# Approved 100 MB input requirement

The user clarified the launch target on 2026-10-13: input PDFs up to
100,000,000 bytes (100 MB). The earlier 20 MiB diagnostic budget is a verified
baseline, not the agreed launch ceiling. This requirement reopens Task 10
resource work; Tasks 11–13 and launch readiness remain pending. Other frozen
tools remain outside scope.

## Implementation checkpoint

The qpdf provider now accepts an explicit `maximumBytes` budget, validating both
input and output against it. Its default remains the verified baseline. Three
adapter tests pass, including boundary rejection before module allocation,
output bounds, cleanup and existing source restrictions. This is budget plumbing,
not evidence that the current engine can safely compress 100 MB files.

## Dependencies to resolve before changing the advertised limit

| Component | Current constraint | Required evidence/change |
| --- | --- | --- |
| Input and device policy | 20 MiB standard/mobile; smaller unknown/low-memory profiles | A coherent 100 MB contract with explicit resource failures |
| Worker/session | Full source allocation, transfer copy, output copy and retained retry source | Measure and reduce overlapping allocations without breaking retry/cancel |
| qpdf | Whole input/output filesystem buffers and 256 MiB WASM heap | Real large-file execution; reviewed source-build change if required |
| Independent inspection | Aggregate drawing-operation ceiling of 200,000 | Safe handling of complex digital PDFs, not merely large scans |
| Integrity fingerprints | 32 MB per decoded stream and 128 MB aggregate | Bounded verification of legitimate large documents without weakening preservation |
| Image processing | Per-image and aggregate decoded-pixel budgets | Serial processing and bounded image memory for image-heavy inputs |
| Final verification | Additional whole-document parsing and copies | Preserve independent text, structure and no-expansion guarantees at target size |

## Acceptance evidence still required

Exercise real-content scanned, digital, mixed and already-optimized PDFs near
100 MB, plus complex PDFs above the old limit. Padding-only fixtures do not prove
100 MB compression. Check all modes, exact boundary handling, output reopening,
text/OCR and protected graph preservation, no expansion, repeated runs,
cancellation during synchronous optimization, retry and cleanup. Record measured
memory limitations honestly and include OnePlus Nord 4 and the blueprint device
matrix. Browser-local processing remains the architecture; no server upload is
authorized by this requirement.

Do not advertise 100 MB support or close Task 10 until this evidence exists.

## Superseding final evidence

The recovered 100 MB engineering envelope, real-content verification and remaining physical-device gates are documented in `tasks10-13-release-report-20261013.md` and the final-large-file/memory/performance evidence. The earlier constraints above describe the historical checkpoint, not the current implementation.
