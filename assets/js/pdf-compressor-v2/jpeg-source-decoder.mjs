import {assessImage} from './image-policy.mjs';
// PDF image semantics: EXIF orientation and standalone JPEG ICC metadata do
// not replace the explicit DeviceRGB/DeviceGray PDF color-space dictionary.
// Inject the pinned PDF.js software JPEG decoder; never let a photo viewer
// rotate or color-manage a PDF image behind the document's back.
function scanRemainder(bytes,start){
  let i=start,segments=0,metadataAfterScan=false;
  const skip=()=>{
    if(i+2>bytes.length)throw Error('truncated-source-jpeg');
    const length=bytes[i]*256+bytes[i+1];
    if(length<2||i+length>bytes.length)throw Error('truncated-source-jpeg');
    i+=length;
  };
  skip();
  while(i<bytes.length){
    if(bytes[i++]!==255)continue;
    while(bytes[i]===255)i++;
    const marker=bytes[i++];
    if(marker===0||marker>=208&&marker<=215)continue;
    if(++segments>10000)throw Error('invalid-source-jpeg');
    if(marker===217)return metadataAfterScan||i<bytes.length;
    if(marker===220)throw Error('unsupported-jpeg-dnl');
    if([192,193,194].includes(marker))throw Error('duplicate-jpeg-frame');
    if(marker>=224&&marker<=239||marker===254){metadataAfterScan=true;skip();}
    else if([218,196,219,221,204].includes(marker))skip();
    else throw Error('unsupported-jpeg-scan-marker');
  }
  throw Error('jpeg-eoi-missing');
}
export function inspectJpegHeader(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('invalid-source-jpeg');
  let i=2,segments=0,frame=null;const metadata=[];let unsupportedMetadata=false;
  while(i<bytes.length){
    if(++segments>10000||bytes[i++]!==255)throw Error('invalid-source-jpeg');
    while(bytes[i]===255)i++;
    const marker=bytes[i++];
    if(marker===218){if(!frame)throw Error('jpeg-frame-missing');const metadataAfterScan=scanRemainder(bytes,i);return {...frame,metadata,metadataAfterScan,unsupportedMetadata:unsupportedMetadata||metadataAfterScan};}
    if(marker===220)throw Error('unsupported-jpeg-dnl');
    if(marker===217)throw Error('jpeg-frame-missing');
    if(marker===216||marker===0||marker>=208&&marker<=215)throw Error('invalid-source-jpeg');
    if(i+2>bytes.length)throw Error('truncated-source-jpeg');
    const length=bytes[i]*256+bytes[i+1];
    if(length<2||i+length>bytes.length)throw Error('truncated-source-jpeg');
    if(marker>=224&&marker<=239||marker===254){
      metadata.push({marker,bytes:bytes.slice(i-2,i+length)});
      // EXIF/Adobe/custom application semantics are not validated yet. Preserve
      // the complete source image rather than stripping or misinterpreting them.
      if(![224,226,254].includes(marker))unsupportedMetadata=true;
    }
    if([192,193,194].includes(marker)){
      if(length<8)throw Error('invalid-jpeg-frame');
      if(frame)throw Error('duplicate-jpeg-frame');
      frame={precision:bytes[i+2],height:bytes[i+3]*256+bytes[i+4],width:bytes[i+5]*256+bytes[i+6],components:bytes[i+7]};
      if(length!==8+3*frame.components)throw Error('invalid-jpeg-frame');
      let maxH=0,maxV=0,samples=0;
      for(let c=0;c<frame.components;c++){
        const sampling=bytes[i+9+3*c],h=sampling>>4,v=sampling&15;
        if(h<1||h>4||v<1||v>4)throw Error('invalid-jpeg-sampling');
        maxH=Math.max(maxH,h);maxV=Math.max(maxV,v);samples+=h*v;
      }
      if(samples>10)throw Error('invalid-jpeg-sampling');
      frame.coefficientBytes=Math.ceil(frame.width/(8*maxH))*Math.ceil(frame.height/(8*maxV))*samples*64*4;
    }
    if(marker>=192&&marker<=207&&![192,193,194,196,200,204].includes(marker))return {unsupported:true};
    i+=length;
  }
  throw Error('jpeg-frame-missing');
}
export function createPDFJpegDecoder(JpegImage){
  if(typeof JpegImage!=='function')throw Error('pdf-jpeg-decoder-unavailable');
  return async({bytes,descriptor,signal})=>{
    if(signal?.aborted)throw Error('cancelled');
    if(!assessImage(descriptor,'balanced',undefined,{allowJpeg:true}).eligible)return {status:'preserve'};
    const header=inspectJpegHeader(bytes),channels=descriptor.colorSpace==='/DeviceGray'?1:3;
    if(header.unsupported||header.unsupportedMetadata||header.precision!==8||header.components!==channels)return {status:'preserve'};
    // Gray profile metadata cannot be attached unchanged to a new RGB JPEG.
    // Leave that image intact until a profile-preserving gray codec is verified.
    if(channels===1&&header.metadata.some(m=>m.marker===226))return {status:'preserve'};
    if(header.width!==descriptor.width||header.height!==descriptor.height)throw Error('jpeg-source-dimension-mismatch');
    const image=new JpegImage();image.parse(bytes);
    if(image.width!==header.width||image.height!==header.height||image.numComponents!==channels)throw Error('jpeg-source-dimension-mismatch');
    const rgb=image.getData({width:header.width,height:header.height,forceRGB:true,isSourcePDF:true});
    if(rgb.length!==header.width*header.height*3)throw Error('jpeg-decoded-size-mismatch');
    const rgba=new Uint8ClampedArray(header.width*header.height*4);
    for(let p=0;p<header.width*header.height;p++){rgba.set(rgb.subarray(p*3,p*3+3),p*4);rgba[p*4+3]=255;}
    if(signal?.aborted)throw Error('cancelled');return rgba;
  };
}

export function preserveJpegMetadata(source,encoded){
  const original=inspectJpegHeader(source);
  if(original.unsupportedMetadata||original.unsupported)throw Error('unsupported-jpeg-metadata');
  const pieces=[encoded.subarray(0,2),...original.metadata.map(m=>m.bytes)];let i=2;
  while(i<encoded.length){
    const start=i;if(encoded[i++]!==255)throw Error('invalid-encoded-jpeg');
    while(encoded[i]===255)i++;const marker=encoded[i++];
    if(marker===218){pieces.push(encoded.subarray(start));break;}
    if(i+2>encoded.length)throw Error('invalid-encoded-jpeg');
    const length=encoded[i]*256+encoded[i+1];if(length<2||i+length>encoded.length)throw Error('invalid-encoded-jpeg');
    if(![224,226,254].includes(marker))pieces.push(encoded.subarray(start,i+length));
    i+=length;
  }
  const result=new Uint8Array(pieces.reduce((sum,p)=>sum+p.length,0));let offset=0;
  for(const piece of pieces){result.set(piece,offset);offset+=piece.length;}return result;
}
