// Canonical Task 5 integration only; UI/lifecycle/mode orchestration follows later.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {transformEmbeddedImages} from './embedded-image-transform.mjs';
import {createImageOutputVerifier} from './image-output-verifier.mjs';
export async function runVerifiedImageCompression(bytes,{PDF,readPages,encodeJpeg,verifyJpeg,decodeJpeg,mode='balanced',signal,limits=INPUT_LIMITS}={}){
  return transformEmbeddedImages(bytes,{PDF,mode,encodeJpeg,decodeJpeg,signal,
    inspectInput:data=>inspectPDFInput(data,{PDF,readPages,signal,limits}),
    verifyOutput:createImageOutputVerifier({PDF,readPages,verifyJpeg,limits})});
}
