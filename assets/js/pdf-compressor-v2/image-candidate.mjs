// AllToolForest PDF Compressor V2 — Task 5 isolated image codec candidate.
// This module NEVER edits a PDF. Candidate must pass an independent PDF
// resource replacement/verification gate before use in a downloadable file.
import {assessImage} from './image-policy.mjs';
export class ImageCandidateError extends Error {
  constructor(code){super(code);this.name='ImageCandidateError';this.code=code;}
}
export async function encodeRasterCandidate({descriptor,rgba,mode='balanced',encodeJpeg,signal}={}){
  if(signal?.aborted)throw new ImageCandidateError('cancelled');
  const decision=assessImage(descriptor,mode);
  if(!decision.eligible) return {status:'preserve',reason:decision.reason};
  if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||
    rgba.byteLength!==decision.pixels*4)
    throw new ImageCandidateError('invalid-rgba-buffer');
  if(typeof encodeJpeg!=='function')throw new ImageCandidateError('codec-unavailable');
  // JPEG loses detail; transparent input or decode failures must never be
  // mistaken for valid PDF image replacement candidates.
  for(let i=3;i<rgba.length;i+=4){
    if(rgba[i]!==255)return {status:'preserve',reason:'alpha-detected'};
  }
  const inputBytes=descriptor.streamBytes;
  if(!Number.isSafeInteger(inputBytes)||inputBytes<1)
    throw new ImageCandidateError('invalid-source-size');
  const rgb=new Uint8Array(decision.pixels*3);
  for(let p=0,s=0;p<rgba.length;p+=4){
    rgb[s++]=rgba[p];rgb[s++]=rgba[p+1];rgb[s++]=rgba[p+2];
  }
  let data;
  try{data=await encodeJpeg({rgb,width:descriptor.width,height:descriptor.height,
    quality:decision.jpegQuality,signal});}
  catch{throw new ImageCandidateError('codec-failed');}
  if(signal?.aborted)throw new ImageCandidateError('cancelled');
  if(!(data instanceof Uint8Array)||data.length<4||
     data[0]!==0xff||data[1]!==0xd8||
     data[data.length-2]!==0xff||data[data.length-1]!==0xd9)
    throw new ImageCandidateError('invalid-jpeg');
  if(data.length>=inputBytes)
    return {status:'preserve',reason:'no-image-stream-savings'};
  // Do not assume saved PDF size: extra dictionaries, xrefs and resource
  // metadata can cancel this gain. Final gate belongs to later tasks.
  return {status:'candidate-only',bytes:data,filter:'/DCTDecode',
    colorSpace:'/DeviceRGB',width:descriptor.width,height:descriptor.height,
    bitsPerComponent:8,estimatedImageBytesSaved:inputBytes-data.length,
    requiresIndependentPDFValidation:true};
}
