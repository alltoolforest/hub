# Image Enhancer & Upscaler — model benchmark gate

Status: pre-deployment / draft branch only. This document is a release gate, not a production capability claim.

## Rules

A model may be exposed to users only after all of these are verified: code license, model-weight license, redistribution/commercial-use rights, immutable/pinned asset source, integrity hash, browser/ONNX compatibility, download size, memory behavior, inference speed, output quality, cancellation/fallback behavior, and CSP compatibility.

The production-oriented browser order remains: WebGPU when actually available and reliable → WASM/CPU → truthful standard high-quality resampling. No standard resampling path may be described as AI.

## Current verified core

| Candidate | Intended role | Size | Rights/provenance | Browser state | Decision |
| --- | --- | ---: | --- | --- | --- |
| Real-ESRGAN `realesr-general-x4v3.onnx` | general super-resolution / reconstruction | 4,871,181 B | Upstream Real-ESRGAN; BSD-3-Clause; pinned `NovareOrbis/nova-ai-models@v3`; SHA-256 pinned in enhancer manifest | Real 1×/2×/4× tiled ONNX inference verified under production-style CSP with GPU disabled (WASM path) | **PASS — current core** |
| Browser resampling | compatibility/text-fidelity fallback | n/a | browser API | alpha-preserving fallback verified | **PASS — fallback only, never AI** |

## Dedicated restoration candidates

| Candidate | Intended role | Size / cost | Rights/provenance | Current blocker | Decision |
| --- | --- | ---: | --- | --- | --- |
| Real-ESRGAN companion WDN x4v3 | denoise-strength companion to compact x4v3 | roughly compact-model class in known ONNX exports | upstream Real-ESRGAN concept is documented, but the exact production ONNX asset is not present in the enhancer's currently pinned/allowed jsDelivr model set | immutable allowed-origin asset + exact SHA-256 + browser memory/speed/quality benchmark are not yet verified | **HOLD — promising denoise candidate** |
| NAFNet deblur ONNX (OpenCV Zoo) | deblur / restoration | about 91.7 MB | OpenCV Zoo model directory is MIT; exact model provenance must remain attached to any selected artifact | too large to accept as a default emerging-market/mobile browser dependency without a real device/WASM/WebGPU memory and latency matrix | **HOLD — benchmark only** |
| Real-ESRGAN x4plus-class model | higher-capacity SR | materially larger/heavier than compact x4v3 in common ONNX exports | Real-ESRGAN family; exact selected weight/export still requires its own immutable asset + hash | download/memory/inference cost vs quality gain not yet justified | **HOLD — optional quality-tier research** |
| Face-restoration model | local face recovery | TBD | TBD | no candidate has passed model-weight rights, identity-preservation, browser memory, multi-face, and hallucination tests | **HOLD — do not expose** |

## What the current restoration controls mean

The current **Fidelity / Balanced / Recovery** controls are pipeline policies around the verified Real-ESRGAN core. They include source-quality heuristics, conservative pre-cleaning/source blending, reconstruction disclosure, and bounded edge-aware post-sharpening. They are **not** represented as a dedicated AI denoise/deblur model.

## Content-aware routing boundary

Until additional models pass this gate, content-aware routing may only choose among already-verified behaviors. In particular:

- high-fidelity photos: prefer source-preserving blend;
- low-resolution/false-resolution sources: prefer stronger recovery disclosure;
- portraits/faces: identity-preserving conservative settings only; no face-restoration claim;
- text/logos: prefer standard high-quality resampling until a text-safe AI path is benchmarked, so letters are not silently reconstructed;
- illustrations/digital art: conservative use of the verified general model; no anime-specialist claim;
- old/damaged photos: stronger recovery policy only; no scratch/deblur model claim until separately verified.

Auto routing must state what it actually detected. Source-quality heuristics may guide quality routing; semantic face/text classification must not be claimed until a verified detector/classifier is present.

## Required benchmark set before a new model can pass

Portraits (single/group/small/dark face), hair/fur, foliage/grass/water/buildings, product labels/fabric/reflective surfaces, screenshots/logos/UI/text, 320×240/640×480/720p sources, heavy/repeated JPEG compression, focus/light-motion blur, and old photos with noise/fade/scratches.

Record at minimum: detail recovery, fidelity, hallucination/reconstruction behavior, edge artifacts, skin naturalness, text correctness, processing time, peak memory behavior, download size, output size, cancellation, and fallback behavior.
