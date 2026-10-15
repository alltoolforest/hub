// Adaptive candidate path for oversized, ordinary opaque scan images.
// Streams Flate rows and uses browser-native scaled JPEG decode; it never
// creates a full-resolution RGBA buffer or a full-resolution canvas.
// All candidates still require independent source/output PDF verification.
import {streamFlateImage} from './streaming-flate-image.mjs';
import {inspectJpegHeader,preserveJpegMetadata} from './jpeg-source-decoder.mjs';
import {QUALITY_MODES} from './image-policy.mjs';

export function scaledImageDimensions(width,height,mode){
  const maximum=QUALITY_MODES[mode]?.maxDimension;
  if(!maximum||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)
    throw Error('invalid-image-dimensions');
  const scale=Math.min(1,maximum/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export async function downsampleSourceJpeg(bytes,{descriptor,width,height,signal}={}){
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')
    throw Error('native-image-decoder-unavailable');
  const header=inspectJpegHeader(bytes);
  const channels=descriptor.colorSpace==='/DeviceGray'?1:3;
  if(header.unsupported||header.unsupportedMetadata||header.precision!==8||
     header.components!==channels||header.width!==descriptor.width||header.height!==descriptor.height||
     channels===1&&header.metadata.some(m=>m.marker===226))
    throw Error('unsupported-image-semantics');
  if(signal?.aborted)throw Error('cancelled');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}),{
    imageOrientation:'none',colorSpaceConversion:'none',
    resizeWidth:width,resizeHeight:height,resizeQuality:'high'});
  const canvas=new OffscreenCanvas(width,height);
  try{
    if(signal?.aborted)throw Error('cancelled');
    if(bitmap.width!==width||bitmap.height!==height)throw Error('native-image-dimensions');
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw Error('canvas-unavailable');
    context.drawImage(bitmap,0,0,width,height);
    const rgba=context.getImageData(0,0,width,height).data;
    const rgb=new Uint8Array(width*height*3);
    for(let p=0;p<width*height;p++)
      for(let c=0;c<3;c++)rgb[p*3+c]=rgba[p*4+c];
    return rgb;
  }finally{bitmap.close();canvas.width=canvas.height=1;}
}
export async function sampleOversizedSource(bytes,{descriptor,width,height,signal}={}){
  if(descriptor.filter==='/DCTDecode')
    return downsampleSourceJpeg(bytes,{descriptor,width,height,signal});
  if(descriptor.filter==='/FlateDecode'){
    const channels=descriptor.colorSpace==='/DeviceGray'?1:3;
    return streamFlateImage(bytes,{width:descriptor.width,height:descriptor.height,
      channels,targetWidth:width,targetHeight:height,signal});
  }
  throw Error('unsupported-oversized-image-filter');
}
export async function encodeOversizedImageCandidate({bytes,descriptor,mode,encodeJpeg,signal}={}){
  const {width,height}=scaledImageDimensions(descriptor.width,descriptor.height,mode);
  if(width*height>4000000)return {status:'preserve',reason:'output-memory-budget'};
  if(typeof encodeJpeg!=='function')return {status:'preserve',reason:'jpeg-encoder-unavailable'};
  try{
    const rgb=await sampleOversizedSource(bytes,{descriptor,width,height,signal});
    if(signal?.aborted)throw Error('cancelled');
    let encoded=await encodeJpeg({rgb,width,height,quality:QUALITY_MODES[mode].jpegQuality,signal});
    if(!(encoded instanceof Uint8Array)||encoded.length<4||
       encoded[0]!==255||encoded[1]!==216||
       encoded.at(-2)!==255||encoded.at(-1)!==217)throw Error('invalid-jpeg-output');
    if(descriptor.filter==='/DCTDecode')encoded=preserveJpegMetadata(bytes,encoded);
    if(encoded.length>=bytes.length||
       descriptor.filter==='/DCTDecode'&&encoded.length>bytes.length*0.9)
      return {status:'preserve',reason:'no-image-stream-savings'};
    return {status:'candidate-only',bytes:encoded,filter:'/DCTDecode',colorSpace:'/DeviceRGB',
      width,height,bitsPerComponent:8,estimatedImageBytesSaved:bytes.length-encoded.length,
      requiresIndependentPDFValidation:true,adaptive:true};
  }catch(error){
    if(signal?.aborted||error?.message==='cancelled')throw Error('cancelled');
    // Failure of one image codec must not reject the document; other candidates
    // and lossless optimization may still succeed. Never release partial bytes.
    return {status:'preserve',reason:'adaptive-codec-unavailable'};
  }
}
