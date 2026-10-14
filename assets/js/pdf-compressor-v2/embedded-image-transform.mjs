// Task 5 isolated transformation. No output is released without an independent
// verifier approving every replacement and all protected document structures.
import {assessImage} from './image-policy.mjs';
import {encodeRasterCandidate} from './image-candidate.mjs';
import {isPlainOpaqueImage} from './lossless-image-dedup.mjs';

export async function inflateExact(bytes, expected) {
  const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const out=new Uint8Array(expected);let offset=0;
  try {
    for(;;){const {value,done}=await reader.read();if(done)break;
      if(offset+value.length>expected)throw Error('image-decoded-size-mismatch');
      out.set(value,offset);offset+=value.length;
    }
    if(offset!==expected)throw Error('image-decoded-size-mismatch');
    return out;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

export async function transformEmbeddedImages(bytes,{PDF,mode='balanced',encodeJpeg,
  inspectInput,verifyOutput,signal,decodeJpeg}={}) {
  if(typeof inspectInput!=='function'||typeof verifyOutput!=='function')
    throw Error('independent-verification-required');
  if(signal?.aborted)throw Error('cancelled');
  await inspectInput(bytes); // Must reject signed/encrypted/unsafe inputs.
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  const N=PDF.PDFName.of,replacements=[];let inspected=0;
  for(const [ref,stream] of doc.context.enumerateIndirectObjects()) {
    if(!isPlainOpaqueImage(stream,PDF))continue;
    if(++inspected>1000)throw Error('image-inventory-limit');
    if(signal?.aborted)throw Error('cancelled');
    const d=stream.dict,descriptor={width:d.get(N('Width'))?.asNumber?.(),
      height:d.get(N('Height'))?.asNumber?.(),bitsPerComponent:d.get(N('BitsPerComponent'))?.asNumber?.(),
      filter:String(d.get(N('Filter'))),colorSpace:String(d.get(N('ColorSpace'))),streamBytes:stream.contents.length};
    const allowJpeg=typeof decodeJpeg==='function';
    const policy=assessImage(descriptor,mode,undefined,{allowJpeg});if(!policy.eligible)continue;
    let rgba;
    if(descriptor.filter==='/DCTDecode'){
      const decoded=await decodeJpeg({bytes:stream.contents.slice(),descriptor,signal});
      if(decoded?.status==='preserve')continue;
      rgba=decoded;
      if(!(rgba instanceof Uint8Array||rgba instanceof Uint8ClampedArray)||rgba.length!==policy.pixels*4)
        throw Error('jpeg-decoded-size-mismatch');
    }else{
      const raw=await inflateExact(stream.contents,policy.expectedRawBytes);
      rgba=new Uint8Array(policy.pixels*4);const gray=descriptor.colorSpace==='/DeviceGray';
      for(let p=0;p<policy.pixels;p++){
        rgba[p*4]=raw[p*(gray?1:3)];rgba[p*4+1]=raw[p*(gray?1:3)+(gray?0:1)];
        rgba[p*4+2]=raw[p*(gray?1:3)+(gray?0:2)];rgba[p*4+3]=255;
      }
    }
    const candidate=await encodeRasterCandidate({descriptor,rgba,mode,encodeJpeg,signal,allowJpeg,sourceJpeg:stream.contents});
    if(candidate.status!=='candidate-only')continue;
    const dict=d.clone(doc.context);dict.set(N('Filter'),N('DCTDecode'));
    dict.set(N('Width'),PDF.PDFNumber.of(candidate.width));dict.set(N('Height'),PDF.PDFNumber.of(candidate.height));
    dict.set(N('ColorSpace'),N('DeviceRGB'));dict.set(N('Length'),PDF.PDFNumber.of(candidate.bytes.length));
    doc.context.assign(ref,PDF.PDFRawStream.of(dict,candidate.bytes));
    replacements.push({ref:String(ref),descriptor,candidate});
  }
  if(!replacements.length)return {status:'original-retained',bytes:bytes.slice(),savedBytes:0,replacements:0};
  const output=await doc.save({useObjectStreams:false});
  if(signal?.aborted)throw Error('cancelled');
  if(output.length>=bytes.length)return {status:'original-retained',bytes:bytes.slice(),savedBytes:0,replacements:0};
  // A boolean true is required; absent/partial verification never approves output.
  if(await verifyOutput({original:bytes.slice(),output:output.slice(),replacements,mode})!==true)
    throw Error('image-output-integrity-failed');
  if(signal?.aborted)throw Error('cancelled');
  return {status:'compressed',bytes:output,savedBytes:bytes.length-output.length,replacements:replacements.length};
}
