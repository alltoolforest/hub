// Task 2: optional target-size attempts, strictly limited to already-verified
// compression modes. A requested target is a best effort, never an output-size
// guarantee and never permission to bypass text/graph/image verification.
// Do not broaden this into Task 3's general stage-recovery behavior.
import {MODES} from './mode-policy.mjs';

export class TargetSizeError extends Error {
  constructor(code){super(code);this.name='TargetSizeError';this.code=code;}
}
export const profileAttempts=Object.freeze({
  balanced:Object.freeze(['balanced']),
  strong:Object.freeze(['balanced','strong']),
  maximum:Object.freeze(['strong','maximum'])
});
export function validateTargetSize(targetBytes,{sourceBytes,mode}={}){
  if(!MODES.includes(mode))throw new TargetSizeError('invalid-compression-mode');
  if(mode==='lossless')throw new TargetSizeError('target-requires-lossy-mode');
  if(!Number.isSafeInteger(targetBytes)||targetBytes<1||
    !Number.isSafeInteger(sourceBytes)||sourceBytes<16||targetBytes>100000000)
    throw new TargetSizeError('invalid-target-size');
  return targetBytes;
}
export async function compressToTarget(bytes,{targetBytes,mode,runVerified,signal,onProgress=()=>{}}={}){
  if(!(bytes instanceof Uint8Array))throw new TargetSizeError('invalid-input');
  validateTargetSize(targetBytes,{sourceBytes:bytes.length,mode});
  if(typeof runVerified!=='function')throw new TargetSizeError('verified-engine-required');
  let best=null;
  const trials=[];
  // One-third-or-less targets are aggressive. Maximum was explicitly
  // selected, so its fully verified profile can be tried first. If it reaches
  // the target, avoid an otherwise redundant Strong pass. For less demanding
  // targets, retain the quality-first Strong -> Maximum order. If Maximum
  // misses the aggressive goal, run Strong too and choose the smaller verified
  // candidate; never bypass verification or change JPEG quality limits.
  const tightMaximum=mode==='maximum' && targetBytes*3<=bytes.length;
  const order=tightMaximum?['maximum','strong']:profileAttempts[mode];
  for(const profile of order){
    if(signal?.aborted)throw new TargetSizeError('cancelled');
    onProgress('target-attempt');
    // A runVerified implementation must complete independent PDF verification
    // and produce its integrity receipt before any candidate is considered.
    const candidate=await runVerified(bytes,{mode:profile,signal,onProgress});
    if(signal?.aborted)throw new TargetSizeError('cancelled');
    const receipt=candidate?.integrity,output=candidate?.bytes;
    if(!(output instanceof Uint8Array)||output.length<16||output.length>bytes.length||
      candidate.mode!==profile||receipt?.version!==1||receipt.mode!==profile||
      receipt.independentTextVerified!==true||
      receipt.inputBytes!==bytes.length||receipt.outputBytes!==output.length||
      receipt.savedBytes!==bytes.length-output.length)
      throw new TargetSizeError('invalid-verified-target-candidate');
    trials.push(Object.freeze({profile,outputBytes:output.length,
      targetReached:output.length<=targetBytes}));
    if(!best||output.length<best.bytes.length)best=candidate;
    if(best.bytes.length<=targetBytes)break;
  }
  // The selection says which maximum quality-degradation tier the user
  // consented to; "effectiveMode" reports the actual verified tier.
  // The receipt fields for original/output bytes and digests are inherited
  // from the independently verified candidate without modification.
  return {
    ...best,mode,integrity:{...best.integrity,mode},
    settings:{...best.settings,effectiveMode:best.mode,requestedTargetBytes:targetBytes,
      targetReached:best.bytes.length<=targetBytes},
    target:{requestedBytes:targetBytes,reached:best.bytes.length<=targetBytes,
      effectiveMode:best.mode,attempts:trials}
  };
}
