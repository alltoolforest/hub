// Application Document Prep Task 1: pure checks; not used by frozen image tools.
export const A4_POINTS=[595.28,841.89];
export function sourcePixelLimit(isMobile){return isMobile?16_000_000:30_000_000}
export function outputPixelLimit(isMobile){return isMobile?8_000_000:24_000_000}
export function checkPixels(width,height,limit,context='Image'){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||
    width>16384||height>16384||width*height>limit)
   throw Error(context+' dimensions exceed this device limit ('+Math.round(limit/1e6)+' million pixels, maximum 16,384 per side). Choose a smaller image or dimensions.');
 return {width,height};
}
export function checkApplicationFit(fit){
 if(fit==='stretch')throw Error('Stretch can distort application photos or signatures. Choose Contain or Cover instead.');
 if(!['contain','cover'].includes(fit))throw Error('Choose a valid fit mode.');
 return fit;
}
export function validateEncodedBlob(blob,type,width,height,targetKB=0){
 if(!blob||!blob.size||!Number.isFinite(blob.size))throw Error('The encoded file is empty. Try another format or smaller dimensions.');
 if(blob.type!==type)throw Error('This browser did not produce '+type+'. Choose a supported output format and retry.');
 if(type!=='application/pdf'&&(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1))
   throw Error('Output image dimensions are invalid.');
 if(targetKB>0&&blob.size>targetKB*1024)
   throw Error('Output is '+(blob.size/1024).toFixed(1)+' KB, exceeding the requested '+targetKB+' KB. Reduce dimensions or quality or increase the limit. The previous output is preserved.');
 return {kb:blob.size/1024,width,height,type};
}
const ascii=(bytes,i,length)=>String.fromCharCode(...bytes.subarray(i,i+length));
// Read cheap headers before browser image decode to reject very large PNG/JPEG images.
export function sniffImageDimensions(bytes,extension){
 if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
 if(extension==='png'&&bytes.length>=24&&bytes[0]===137&&ascii(bytes,1,3)==='PNG'&&ascii(bytes,12,4)==='IHDR'){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return {width:view.getUint32(16),height:view.getUint32(20)};
 }
 if((extension==='jpg'||extension==='jpeg')&&bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
  let p=2;
  while(p+4<bytes.length){
   if(bytes[p]!==255){p++;continue;}
   const marker=bytes[p+1];p+=2;
   if(marker===255||marker===0||marker===216)continue;
   if(marker===217||marker===218)break;
   if(p+2>bytes.length)break;
   const len=(bytes[p]<<8)|bytes[p+1];
   if(len<2||p+len>bytes.length)break;
   if(([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]).includes(marker)&&len>=7)
     return {width:(bytes[p+5]<<8)|bytes[p+6],height:(bytes[p+3]<<8)|bytes[p+4]};
   p+=len;
  }
 }
 if(extension==='webp'&&bytes.length>=30&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP'){
  const kind=ascii(bytes,12,4);
  if(kind==='VP8X')return {width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
  if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)
   return {width:((bytes[27]<<8)|bytes[26])&0x3fff,height:((bytes[29]<<8)|bytes[28])&0x3fff};
  if(kind==='VP8L'&&bytes[20]===47)
   return {width:1+bytes[21]+((bytes[22]&63)<<8),height:1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)};
 }
 return null; // HEIC/unknown header: post-decode size check is mandatory.
}
export function validatePdfPages(pdf,pageCount=1){
 const pages=pdf.getPages();
 if(pages.length!==pageCount)throw Error('Unexpected PDF page count. Export was not saved.');
 const {width,height}=pages[0].getSize();
 if(Math.abs(width-A4_POINTS[0])>0.2||Math.abs(height-A4_POINTS[1])>0.2)
   throw Error('Generated PDF page dimensions are not A4.');
 return {width,height,pages:pages.length};
}