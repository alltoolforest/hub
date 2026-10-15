// Canonical Task 6: orchestration of independently verified engines only.
// No UI, production wiring, network requests or full-page rasterization.
import {inspectPDFInput,INPUT_LIMITS} from './input-inspector.mjs';
import {runVerifiedLossless} from './qpdf-lossless-adapter.mjs';
import {runVerifiedImageCompression} from './image-compression.mjs';
import {planCompression,describeResult,MODES} from './mode-policy.mjs';
import {attemptOptionalStage} from './recoverable-stage-policy.mjs';

export class CompressionPipelineError extends Error {
  constructor(code){super(code);this.name='CompressionPipelineError';this.code=code;}
}
const checkCancel=signal=>{if(signal?.aborted)throw new CompressionPipelineError('cancelled');};
export async function compressPDF(bytes,{PDF,readPages,optimize,encodeJpeg,
  verifyJpeg,decodeJpeg,mode='balanced',signal,limits=INPUT_LIMITS,onProgress=()=>{},inspectInput=inspectPDFInput}={}){
  if(!MODES.includes(mode))throw new RangeError('Unsupported compression mode');
  checkCancel(signal);
  onProgress('inspect');
  const startedAt=performance.now();
  const inspected=await inspectInput(bytes,{PDF,readPages,signal,limits});
  const plan=planCompression({mode,images:inspected.images,pages:inspected.pageCount,
    classification:inspected.classification,allowJpeg:typeof decodeJpeg==='function'});
  if(!plan.allowed)throw new CompressionPipelineError(plan.reason);
  const stages=[];
  let current=bytes;
  const now=()=>performance.now();
  const stageTimings={inspectionMs:now()-startedAt,imageMs:0,losslessMs:0};
  // Every stage independently verifies its own source/output equivalence.
  // Lossless fingerprints then preserve the image stage's accepted content.
  if(mode!=='lossless'&&plan.imageCandidates>0){
    onProgress('embedded-images');
    const imageStarted=now();
    const imageAttempt=await attemptOptionalStage('embedded-images',()=>
      runVerifiedImageCompression(current,{PDF,readPages,encodeJpeg,
        verifyJpeg,decodeJpeg,mode,signal,limits,inspectInput}),{signal});
    checkCancel(signal);
    stageTimings.imageMs=now()-imageStarted;
    if(imageAttempt.status==='recovered'){
      // The failed candidate is discarded entirely. Only the unchanged,
      // originally inspected bytes may pass into the next verified stage.
      stages.push({engine:'embedded-images',status:'preserved-after-failure',
        reason:imageAttempt.reason,inputBytes:current.length,outputBytes:current.length});
    }else{
      const image=imageAttempt.value;
      stages.push({engine:'embedded-images',status:image.status,
        inputBytes:current.length,outputBytes:image.bytes.length});
      current=image.bytes;
    }
  }
  onProgress('lossless');
  const losslessStarted=now();
  const losslessAttempt=await attemptOptionalStage('lossless',()=>
    runVerifiedLossless(current,{PDF,readPages,optimize,signal,limits,onProgress,inspectInput}),{signal});
  checkCancel(signal);
  stageTimings.losslessMs=now()-losslessStarted;
  if(losslessAttempt.status==='recovered'){
    // Retain the last independently image-verified result, or exact original.
    // Final independent verification is still mandatory before download.
    stages.push({engine:'lossless',status:'preserved-after-failure',
      reason:losslessAttempt.reason,inputBytes:current.length,outputBytes:current.length});
  }else{
    const lossless=losslessAttempt.value;
    stages.push({engine:'lossless',status:lossless.status,
      inputBytes:current.length,outputBytes:lossless.bytes.length});
    current=lossless.bytes;
  }
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
    stages,stageTimings,message:summary.message};
}
