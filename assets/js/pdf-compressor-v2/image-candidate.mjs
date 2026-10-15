// AllToolForest PDF Compressor V2 — Task 5 isolated image codec candidate.
// This module NEVER edits a PDF. Candidate must pass an independent PDF
// resource replacement/verification gate before use in a downloadable file.
import {assessImage} from './image-policy.mjs';
import {preserveJpegMetadata} from './jpeg-source-decoder.mjs';
export class ImageCandidateError extends Error {
  constructor(code){super(code);this.name='ImageCandidateError';this.code=code;}
}
export async function encodeRasterCandidate({descriptor,rgba,mode='balanced',encodeJpeg,signal,allowJpeg=false,sourceJpeg}={}){
  if(signal?.aborted)throw new ImageCandidateError('cancelled');
  const decision=assessImage(descriptor,mode,undefined,{allowJpeg});
  if(!decision.eligible) return {status:'preserve',reason:decision.reason};
  if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||
    rgba.byteLength!==decision.pixels*4)
    throw new ImageCandidateError('invalid-rgba-buffer');
  // JPEG loses detail; transparent input or decode failures must never be
  // mistaken for valid PDF image replacement candidates.
  for(let i=3;i<rgba.length;i+=4){
    if(rgba[i]!==255)return {status:'preserve',reason:'alpha-detected'};
  }
  if(typeof encodeJpeg!=='function')throw new ImageCandidateError('codec-unavailable');
  const inputBytes=descriptor.streamBytes;
  if(!Number.isSafeInteger(inputBytes)||inputBytes<1)
    throw new ImageCandidateError('invalid-source-size');
  // Area averaging suppresses aliasing when reducing scans; never upscale.
  const scale=Math.min(1,decision.maxDimension/Math.max(descriptor.width,descriptor.height));
  const width=Math.max(1,Math.round(descriptor.width*scale)),height=Math.max(1,Math.round(descriptor.height*scale));
  const rgb=new Uint8Array(width*height*3);
  for(let y=0;y<height;y++){
    if(signal?.aborted)throw new ImageCandidateError('cancelled');
    const y0=y*descriptor.height/height,y1=(y+1)*descriptor.height/height;
    for(let x=0;x<width;x++){
      const x0=x*descriptor.width/width,x1=(x+1)*descriptor.width/width;
      const sums=[0,0,0];let weight=0;
      for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
        const w=(Math.min(y1,sy+1)-Math.max(y0,sy))*(Math.min(x1,sx+1)-Math.max(x0,sx));
        const p=(sy*descriptor.width+sx)*4;weight+=w;
        for(let c=0;c<3;c++)sums[c]+=rgba[p+c]*w;
      }
      for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=Math.round(sums[c]/weight);
    }
  }
  let data;
  try{data=await encodeJpeg({rgb,width,height,
    quality:decision.jpegQuality,signal});}
  catch{throw new ImageCandidateError(signal?.aborted?'cancelled':'codec-failed');}
  if(signal?.aborted)throw new ImageCandidateError('cancelled');
  if(!(data instanceof Uint8Array)||data.length<4||
     data[0]!==0xff||data[1]!==0xd8||
     data[data.length-2]!==0xff||data[data.length-1]!==0xd9)
    throw new ImageCandidateError('invalid-jpeg');
  // CMYK and YCCK Adobe APP14 describe *four* encoded components.
  // The newly encoded candidate is RGB; copying APP14 would corrupt colors.
  if(descriptor.filter==='/DCTDecode'&&descriptor.colorSpace!=='/DeviceCMYK')
    data=preserveJpegMetadata(sourceJpeg,data);
  if(data.length>=inputBytes||(descriptor.filter==='/DCTDecode'&&data.length>inputBytes*.9))
    return {status:'preserve',reason:'no-image-stream-savings'};
  // Do not assume saved PDF size: extra dictionaries, xrefs and resource
  // metadata can cancel this gain. Final gate belongs to later tasks.
  return {status:'candidate-only',bytes:data,filter:'/DCTDecode',
    colorSpace:'/DeviceRGB',width,height,
    bitsPerComponent:8,estimatedImageBytesSaved:inputBytes-data.length,
    requiresIndependentPDFValidation:true};
}
