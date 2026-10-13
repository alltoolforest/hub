// Canonical Task 6: orchestration of independently verified engines only.
// No UI, production wiring, network requests or full-page rasterization.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {runVerifiedLossless} from './qpdf-lossless-adapter.mjs';
import {runVerifiedImageCompression} from './image-compression.mjs';
import {planCompression,describeResult,MODES} from './mode-policy.mjs';

export class CompressionPipelineError extends Error {
  constructor(code){super(code);this.name='CompressionPipelineError';this.code=code;}
}
const checkCancel=signal=>{if(signal?.aborted)throw new CompressionPipelineError('cancelled');};
export async function compressPDF(bytes,{PDF,readPages,optimize,encodeJpeg,
  verifyJpeg,decodeJpeg,mode='balanced',signal,limits=INPUT_LIMITS,onProgress=()=>{}}={}){
  if(!MODES.includes(mode))throw new RangeError('Unsupported compression mode');
  checkCancel(signal);
  onProgress('inspect');
  const inspected=await inspectPDFInput(bytes,{PDF,readPages,signal,limits});
  const plan=planCompression({mode,images:inspected.images,pages:inspected.pageCount,
    classification:inspected.classification,allowJpeg:typeof decodeJpeg==='function'});
  if(!plan.allowed)throw new CompressionPipelineError(plan.reason);
  const stages=[];
  let current=bytes;
  // Every stage independently verifies its own source/output equivalence.
  // Lossless fingerprints then preserve the image stage's accepted content.
  if(mode!=='lossless'&&plan.imageCandidates>0){
    onProgress('embedded-images');
    const image=await runVerifiedImageCompression(current,{PDF,readPages,encodeJpeg,
      verifyJpeg,decodeJpeg,mode,signal,limits});
    checkCancel(signal);
    stages.push({engine:'embedded-images',status:image.status,
      inputBytes:current.length,outputBytes:image.bytes.length});
    current=image.bytes;
  }
  onProgress('lossless');
  const lossless=await runVerifiedLossless(current,{PDF,readPages,optimize,signal,limits});
  checkCancel(signal);
  stages.push({engine:'lossless',status:lossless.status,
    inputBytes:current.length,outputBytes:lossless.bytes.length});
  current=lossless.bytes;
  // Final no-expansion policy refers to the original, not a staged input.
  if(current.length>=bytes.length)current=bytes.slice();
  const summary=describeResult({inputBytes:bytes.length,outputBytes:current.length});
  return {bytes:current,status:summary.success?'compressed':'original-retained',
    inputBytes:bytes.length,outputBytes:current.length,savedBytes:summary.savedBytes,
    reductionPercent:summary.reductionPercent,mode,
    classification:inspected.classification,
    settings:{imageQualityReductionAllowed:mode!=='lossless',
      imageTransformationApplied:summary.success&&stages.some(stage=>
        stage.engine==='embedded-images'&&stage.status==='compressed'),
      ...(mode==='lossless'?{}:plan.settings)},
    stages,message:summary.message};
}
