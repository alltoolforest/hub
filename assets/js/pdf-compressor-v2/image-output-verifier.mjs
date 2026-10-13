// Permit only declared image substitutions. Restore original images in an
// in-memory verification copy, then require the complete lossless graph identity.
import {losslessFingerprint} from './lossless-invariants.mjs';
import {isPlainOpaqueImage} from './lossless-image-dedup.mjs';
export function createImageOutputVerifier({PDF,readPages,verifyJpeg}={}) {
  if(typeof readPages!=='function'||typeof verifyJpeg!=='function')throw Error('independent-image-reader-required');
  return async({original,output,replacements,mode})=>{
    const a=await PDF.PDFDocument.load(original.slice(),{updateMetadata:false,throwOnInvalidObject:true});
    const b=await PDF.PDFDocument.load(output.slice(),{updateMetadata:false,throwOnInvalidObject:true});
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
      b.context.assign(entry.ref,PDF.PDFRawStream.of(old.dict.clone(b.context),old.contents.slice()));
    }
    const restored=new Uint8Array(await b.save({useObjectStreams:false}));
    if(await losslessFingerprint(original,{PDF})!==await losslessFingerprint(restored,{PDF}))
      throw Error('protected-document-structure-changed');
    const before=await readPages(original.slice()),after=await readPages(output.slice());
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('independent-page-profile-changed');
    return true;
  };
}
