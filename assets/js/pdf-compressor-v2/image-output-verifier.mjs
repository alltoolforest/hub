// Permit only declared image substitutions. Restore original images in an
// in-memory verification copy, then require the complete lossless graph identity.
import {losslessFingerprint} from './lossless-invariants.mjs';
import {isPlainOpaqueImage} from './lossless-image-dedup.mjs';
export function createImageOutputVerifier({PDF,readPages,verifyJpeg,limits}={}) {
  if(typeof readPages!=='function'||typeof verifyJpeg!=='function')throw Error('independent-image-reader-required');
  return async({original,output,replacements,mode})=>{
    const a=await PDF.PDFDocument.load(original,{updateMetadata:false,throwOnInvalidObject:true});
    const b=await PDF.PDFDocument.load(output,{updateMetadata:false,throwOnInvalidObject:true});
    const source=new Map(a.context.enumerateIndirectObjects().map(([ref,obj])=>[String(ref),obj]));
    const target=new Map(b.context.enumerateIndirectObjects().map(([ref,obj])=>[String(ref),{ref,obj}]));
    const declared=new Set(),N=PDF.PDFName.of;
    for(const r of replacements){
      if(declared.has(r.ref))throw Error('duplicate-image-manifest');declared.add(r.ref);
      const old=source.get(r.ref),entry=target.get(r.ref),next=entry?.obj,c=r.candidate;
      if(!isPlainOpaqueImage(old,PDF)||!isPlainOpaqueImage(next,PDF))throw Error('unsafe-image-replacement');
      for(const key of ['Type','Subtype','BitsPerComponent'])
        if(String(old.dict.get(N(key)))!==String(next.dict.get(N(key))))throw Error('image-dictionary-changed');
      if(old.dict.get(N('Width'))?.asNumber?.()!==r.descriptor.width||
        old.dict.get(N('Height'))?.asNumber?.()!==r.descriptor.height||
        String(old.dict.get(N('ColorSpace')))!==r.descriptor.colorSpace||
        !Number.isSafeInteger(c.width)||!Number.isSafeInteger(c.height)||c.width<1||c.height<1||
        c.width>r.descriptor.width||c.height>r.descriptor.height)throw Error('invalid-image-manifest');
      if(!['/FlateDecode','/DCTDecode'].includes(String(old.dict.get(N('Filter'))))||String(next.dict.get(N('Filter')))!=='/DCTDecode'||
        String(next.dict.get(N('ColorSpace')))!=='/DeviceRGB'||
        next.dict.get(N('Width'))?.asNumber?.()!==c.width||next.dict.get(N('Height'))?.asNumber?.()!==c.height||
        next.contents.length!==c.bytes.length||next.contents.some((v,i)=>v!==c.bytes[i]))throw Error('image-manifest-mismatch');
      // Validate the encoded candidate independently before ignoring its bytes
      // in the protected-structure comparison. Never normalize arbitrary images.
      if(await verifyJpeg({bytes:next.contents.slice(),originalStream:old,descriptor:r.descriptor,
        width:c.width,height:c.height,mode})!==true)throw Error('jpeg-quality-verification-failed');
      b.context.assign(entry.ref,PDF.PDFRawStream.of(old.dict.clone(b.context),old.contents));
    }
    const restored=await b.save({useObjectStreams:false});
    const options={PDF,maxEntries:limits?.maxInvariantEntries,maxTotalDecodedBytes:limits?.maxTotalDecodedBytes,maxStreamBytes:limits?.maxDecodedStreamBytes};
    if(await losslessFingerprint(original,options)!==await losslessFingerprint(restored,options))
      throw Error('protected-document-structure-changed');
    const before=await readPages(original,{maxPages:limits?.maxPages,maxOperators:limits?.maxOperators,maxImagePixels:limits?.maxImagePixels}),after=await readPages(output,{maxPages:limits?.maxPages,maxOperators:limits?.maxOperators,maxImagePixels:limits?.maxImagePixels});
    // PDF.js may omit an image-paint operation when the source XObject exceeds
    // its safe maxImageSize. The approved candidate is smaller and paints again.
    // This one count can therefore change even though the complete original
    // PDF graph was restored and verified above (including page operators).
    // NEVER exempt text, geometry, annotations, links, or ordinary images.
    const oversized=replacements.some(r=>r.descriptor.width*r.descriptor.height>
      (limits?.maxImagePixels??8000000));
    const stripPaints=pages=>pages.map(({imagePaints,...protectedFields})=>protectedFields);
    if(JSON.stringify(before)!==JSON.stringify(after)&&
      (!oversized||JSON.stringify(stripPaints(before))!==JSON.stringify(stripPaints(after))))
      throw Error('independent-page-profile-changed');
    return true;
  };
}
