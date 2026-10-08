// Image to Text OCR Task 2: conservative preparation and phone-format preflight.
// No generative restoration, no invented characters, no edits to shared image/PDF engines.
import {checkImageDimensions,recognitionSize} from './image-ocr-reliability.js';

export const OCR_ROTATIONS=[0,90,180,270];
export const OCR_PREPARATIONS=['original','contrast'];
export function ocrSettings(rotation='0',preparation='original'){
 const angle=Number(rotation);
 if(!OCR_ROTATIONS.includes(angle))throw Error('Choose a supported 0°, 90°, 180° or 270° rotation.');
 if(!OCR_PREPARATIONS.includes(preparation))throw Error('Choose Original or Gentle contrast.');
 return {rotation:angle,preparation};
}
export function preparedDimensions(width,height,rotation=0){
 const angle=ocrSettings(rotation).rotation;
 const base=recognitionSize(width,height);
 return angle%180?{width:base.height,height:base.width}:{width:base.width,height:base.height};
}
export function drawPreparedOcr(ctx,image,dimensions,settings){
 const {rotation,preparation}=ocrSettings(settings.rotation,settings.preparation);
 const base=recognitionSize(image.width,image.height);
 if(dimensions.width!==(rotation%180?base.height:base.width)||
    dimensions.height!==(rotation%180?base.width:base.height))
  throw Error('OCR canvas dimensions do not match the selected rotation.');
 ctx.save();
 try{
  if(preparation==='contrast')ctx.filter='grayscale(100%) contrast(135%)';
  if(rotation===90){ctx.translate(dimensions.width,0);ctx.rotate(Math.PI/2);}
  else if(rotation===180){ctx.translate(dimensions.width,dimensions.height);ctx.rotate(Math.PI);}
  else if(rotation===270){ctx.translate(0,dimensions.height);ctx.rotate(-Math.PI/2);}
  ctx.drawImage(image,0,0,base.width,base.height);
 }finally{ctx.restore();}
}
// WebP header dimensions: lossy VP8, lossless VP8L, and extended VP8X.
export function webpDimensions(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 const ascii=(i,n)=>String.fromCharCode(...bytes.subarray(i,i+n));
 if(bytes.length<20||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP')
  throw Error('This WebP file has an invalid header.');
 const kind=ascii(12,4);
 if(kind==='VP8X'){
  if(bytes.length<30)throw Error('WebP dimensions header is incomplete.');
  return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),
          height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
 }
 if(kind==='VP8 '){
  if(bytes.length<30||bytes[23]!==157||bytes[24]!==1||bytes[25]!==42)
   throw Error('WebP image dimensions header is invalid.');
  return {width:((bytes[27]<<8)|bytes[26])&16383,
          height:((bytes[29]<<8)|bytes[28])&16383};
 }
 if(kind==='VP8L'){
  if(bytes.length<25||bytes[20]!==47)throw Error('WebP lossless header is invalid.');
  return {width:1+bytes[21]+((bytes[22]&63)<<8),
          height:1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)};
 }
 throw Error('Unsupported WebP image encoding.');
}
export function isHeifContainer(bytes){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(bytes.length<16||String.fromCharCode(...bytes.subarray(4,8))!=='ftyp')return false;
 const ascii=(i,n)=>String.fromCharCode(...bytes.subarray(i,i+n));
 const brands=new Set(['heic','heix','hevc','hevx','mif1','msf1']);
 if(brands.has(ascii(8,4)))return true;
 const limit=Math.min(bytes.length,64);
 for(let i=16;i+4<=limit;i+=4)if(brands.has(ascii(i,4)))return true;
 return false;
}
export async function validatePhoneImage(file,extension,isMobile){
 if(extension==='webp'){
  const bytes=new Uint8Array(await file.slice(0,64).arrayBuffer());
  const size=webpDimensions(bytes);
  checkImageDimensions(size.width,size.height,isMobile);
  return size;
 }
 if(extension==='heic'||extension==='heif'){
  if(file.size>(isMobile?12:25)*1024*1024)
   throw Error('HEIC/HEIF is too large for reliable browser decoding on this device. Use a smaller file.');
  const bytes=new Uint8Array(await file.slice(0,64).arrayBuffer());
  if(!isHeifContainer(bytes))throw Error('This HEIC/HEIF file has an invalid container header.');
  return null; // Pixel dimensions checked after the HEIC decoder runs.
 }
 throw Error('Unsupported phone image format.');
}
export function ocrProgressMilestone(progress,statusText,previous=-1){
 const percentage=Number.isFinite(progress)?Math.max(0,Math.min(100,Math.round(progress*100))):null;
 const milestone=percentage===null?null:Math.floor(percentage/20)*20;
 return {
  value:percentage,
  announce:milestone!==null&&milestone>previous,
  milestone,
  text:statusText||'Recognizing text'
 };
}
