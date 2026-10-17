// Blueprint Task 6 — document-aware mode orchestration (no production imports).
// This does not compress; only explicit, approved pipelines may produce output.
import {classifyDocument,assessImage,QUALITY_MODES} from './image-policy.mjs';
export const MODES=Object.freeze(['lossless','balanced','strong','maximum']);
export function planCompression({mode='balanced',images=[],pages=1,signed=false,
  encrypted=false,hasUnknownSecurity=false,classification,allowJpeg=false}={}){
  if(!MODES.includes(mode))throw new RangeError('Unsupported compression mode');
  if(signed||encrypted||hasUnknownSecurity)
    return {allowed:false,reason:'restricted-document',mode};
  if(mode==='lossless')
    return {allowed:true,mode,lossless:true,imageCandidates:0,
      quality:'no-intentional-image-quality-reduction'};
  const classified=classifyDocument(images,{pages,hasSignature:signed,encrypted,mode});
  if(!classified.safe)return {allowed:false,reason:classified.reason,mode};
  const candidates=classification==='digital'||classification==='vector-or-empty'?0:
    images.filter(image=>assessImage(image,mode,undefined,{allowJpeg,allowAdaptive:true}).eligible).length;
  return {allowed:true,mode,lossless:true,imageCandidates:candidates,
    imagesPreserved:images.length-candidates,settings:QUALITY_MODES[mode],
    quality:mode==='balanced'?'moderate-lossy-image-candidates':
      mode==='strong'?'higher-lossy-image-candidates':'maximum-lossy-image-candidates',
    warning:'Not a compression result. Candidate images require independent pixel/PDF verification.'};
}
export function describeResult(result){
  if(!result||!Number.isSafeInteger(result.inputBytes)||!Number.isSafeInteger(result.outputBytes)||
     result.inputBytes<=0||result.outputBytes<=0)
    throw new TypeError('Missing measured output byte counts');
  if(result.outputBytes>result.inputBytes)
    return {success:false,reason:'larger-output-rejected'};
  const savedBytes=result.inputBytes-result.outputBytes;
  return {success:savedBytes>0,savedBytes,originalBytes:result.inputBytes,
    finalBytes:result.outputBytes,reductionPercent:Number((100*savedBytes/result.inputBytes).toFixed(2)),
    message:savedBytes===0?'No reduction; original retained':'Verified byte reduction'};
}
