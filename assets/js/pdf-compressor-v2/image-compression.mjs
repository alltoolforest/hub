// Canonical Task 5 integration only; UI/lifecycle/mode orchestration follows later.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {transformEmbeddedImages} from './embedded-image-transform.mjs';
import {createImageOutputVerifier} from './image-output-verifier.mjs';
import {createVerifiedJpegEvidenceCache} from './verified-jpeg-evidence.mjs';
export async function runVerifiedImageCompression(bytes,{PDF,readPages,encodeJpeg,verifyJpeg,
  decodeJpeg,mode='balanced',signal,limits=INPUT_LIMITS,inspectInput=inspectPDFInput}={}){
  // A candidate is independently decoded and quality-checked once. The
  // protected output graph verifier then checks the exact embedded bytes
  // against the manifest and a SHA-256-bound approval before release.
  // A different byte, source, dimension, mode or descriptor is re-evaluated.
  const approvedJpeg=createVerifiedJpegEvidenceCache(verifyJpeg,{signal});
  return transformEmbeddedImages(bytes,{PDF,mode,encodeJpeg,decodeJpeg,signal,
    inspectInput:data=>inspectInput(data,{PDF,readPages,signal,limits}),
    verifyJpeg:approvedJpeg,
    verifyOutput:createImageOutputVerifier({PDF,readPages,verifyJpeg:approvedJpeg,limits})});
}
