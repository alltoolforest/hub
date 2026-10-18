// V3 experimental non-flattening path: replace only eligible JPEG XObjects.
// Page programs/text/metadata are never intentionally rasterized. This only
// emits verified candidate bytes; no production worker/UI currently imports it.
export class V3ImageRecodeError extends Error {
  constructor(code){super(code);this.name='V3ImageRecodeError';this.code=code;}
}
const fail=code=>{throw new V3ImageRecodeError(code);};
export const RECODE_PROFILES=Object.freeze({
  balanced:Object.freeze({maxDimension:2000,quality:0.55,maxPixels:8000000}),
  strong:Object.freeze({maxDimension:1500,quality:0.35,maxPixels:8000000}),
  maximum:Object.freeze({maxDimension:950,quality:0.18,maxPixels:8000000})
});
const check=signal=>{if(signal?.aborted)fail('cancelled');};
export async function recompressJpegXObjects(source,{
  PDF,mode='maximum',signal,inspectRestrictions,verifyOutput,
  createBitmap=blob=>createImageBitmap(blob),
  makeCanvas=(w,h)=>new OffscreenCanvas(w,h),
  maxImages=1000,maxOutputBytes=100000000,
  onProgress=()=>{}
}={}){
  if(!(source instanceof Uint8Array)||source.length<16)fail('invalid-input');
  if(!RECODE_PROFILES[mode])fail('invalid-mode');
  if(!PDF?.PDFDocument?.load||!PDF?.PDFRawStream?.of||!PDF?.PDFName?.of)fail('runtime-unavailable');
  // A simple PDF-lib reopen is NOT sufficient independent proof. The caller
  // must supply a trusted security inspector AND a complete document graph/
  // text/annotations/attachments verifier. Neither may be silently omitted.
  if(typeof inspectRestrictions!=='function')fail('security-inspection-required');
  if(typeof verifyOutput!=='function')fail('independent-verification-required');
  if(!Number.isSafeInteger(maxImages)||maxImages<1||maxImages>10000)fail('invalid-image-budget');
  check(signal);
  const authorized=await inspectRestrictions(source,{mode,signal});
  if(authorized?.allowed!==true)fail(authorized?.code??'restricted-document');
  check(signal);
  const doc=await PDF.PDFDocument.load(source,{updateMetadata:false,throwOnInvalidObject:true});
  const entries=doc.context.enumerateIndirectObjects(),N=PDF.PDFName.of;
  const masks=new Set();
  for(const [,object] of entries){
    if(!(object instanceof PDF.PDFRawStream)||String(object.dict.get(N('Subtype')))!=='/Image')continue;
    for(const key of ['Mask','SMask']){
      const ref=object.dict.get(N(key));
      if(ref instanceof PDF.PDFRef)masks.add(String(ref));
    }
  }
  let considered=0,skipped=0;
  const replacements=[];
  const profile=RECODE_PROFILES[mode];
  for(const [ref,stream] of entries){
    check(signal);
    if(!(stream instanceof PDF.PDFRawStream)||String(stream.dict.get(N('Subtype')))!=='/Image')continue;
    if(++considered>maxImages)fail('image-count-budget');
    const dict=stream.dict,field=k=>dict.get(N(k));
    const width=field('Width')?.asNumber?.(),height=field('Height')?.asNumber?.();
    if(masks.has(String(ref))||field('Mask')||field('SMask')||field('Decode')||
       field('DecodeParms')||field('DP')||field('ImageMask')||
       String(field('Filter'))!=='/DCTDecode'||String(field('ColorSpace'))!=='/DeviceRGB'||
       field('BitsPerComponent')?.asNumber?.()!==8||
       !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
       width<1||height<1||width*height>profile.maxPixels||stream.contents.length<200){
      skipped++;continue;
    }
    const data=stream.contents;
    if(data[0]!==255||data[1]!==216||data.at(-2)!==255||data.at(-1)!==217){
      skipped++;continue;
    }
    let image,preview,candidateImage;
    try{
      image=await createBitmap(new Blob([data],{type:'image/jpeg'}));
      if(image?.width!==width||image?.height!==height){skipped++;continue;}
      const scale=Math.min(1,profile.maxDimension/Math.max(width,height));
      const outWidth=Math.max(1,Math.round(width*scale));
      const outHeight=Math.max(1,Math.round(height*scale));
      preview=makeCanvas(outWidth,outHeight);
      const ctx=preview?.getContext?.('2d',{alpha:false});
      if(!ctx||typeof preview.convertToBlob!=='function')fail('canvas-unavailable');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,outWidth,outHeight);
      ctx.drawImage(image,0,0,outWidth,outHeight);
      check(signal);
      const blob=await preview.convertToBlob({type:'image/jpeg',quality:profile.quality});
      if(blob?.type!=='image/jpeg')fail('jpeg-encode-failed');
      const encoded=new Uint8Array(await blob.arrayBuffer());
      if(encoded.length>=data.length||encoded.length<4||encoded[0]!==255||
         encoded[1]!==216||encoded.at(-2)!==255||encoded.at(-1)!==217){
        skipped++;continue;
      }
      candidateImage=await createBitmap(new Blob([encoded],{type:'image/jpeg'}));
      if(candidateImage?.width!==outWidth||candidateImage?.height!==outHeight)
        fail('jpeg-output-dimensions-mismatch');
      const next=dict.clone(doc.context);
      next.set(N('Filter'),N('DCTDecode'));
      next.set(N('Width'),PDF.PDFNumber.of(outWidth));
      next.set(N('Height'),PDF.PDFNumber.of(outHeight));
      next.set(N('Length'),PDF.PDFNumber.of(encoded.length));
      doc.context.assign(ref,PDF.PDFRawStream.of(next,encoded));
      // Keep the established verified-image manifest contract: the verifier
      // restores each exact original stream, checks non-image graph identity,
      // and independently reopens/compares page and text structure.
      replacements.push({ref:String(ref),
        descriptor:{width,height,bitsPerComponent:8,filter:'/DCTDecode',
          colorSpace:'/DeviceRGB',streamBytes:data.length},
        candidate:{bytes:encoded,width:outWidth,height:outHeight},
        originalBytes:data.length,outputBytes:encoded.length});
      onProgress({processed:considered,replaced:replacements.length});
    }catch(error){
      if(error instanceof V3ImageRecodeError)throw error;
      if(signal?.aborted)fail('cancelled');
      // A malformed/unsupported source image is not re-encoded. The caller's
      // security inspection and final independent checks still apply.
      skipped++;
    }finally{
      candidateImage?.close?.();image?.close?.();
      if(preview){preview.width=0;preview.height=0;}
    }
  }
  if(!replacements.length)return {status:'no-eligible-images',bytes:null,replacements,considered,skipped};
  check(signal);
  const output=new Uint8Array(await doc.save({useObjectStreams:false}));
  if(output.length>=source.length||output.length>maxOutputBytes)
    return {status:'not-smaller',bytes:null,replacements,considered,skipped,outputBytes:output.length};
  check(signal);
  const reopened=await PDF.PDFDocument.load(output,{updateMetadata:false,throwOnInvalidObject:true});
  const originalPages=doc.getPageCount();
  if(reopened.getPageCount()!==originalPages)fail('page-count-changed');
  // Mandatory independent equivalence verification is the final authority.
  // Image appearance may change; non-image objects and text must not.
  if(await verifyOutput({original:source,output,replacements,mode,signal})!==true)
    fail('independent-output-verification-failed');
  check(signal);
  return {status:'compressed',bytes:output,replacements,considered,skipped,
    inputBytes:source.length,outputBytes:output.length,pageCount:originalPages,
    destructive:false,mode};
}
