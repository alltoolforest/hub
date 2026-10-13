// Canonical Blueprint v1.0 Task 3: read-only inspection, not compression.
// Dependencies are injected. Never import a shared UI, write a PDF, execute
// document actions, request passwords, or fetch/upload document data.
import {inspectJpegHeader} from './jpeg-source-decoder.mjs';
export const INPUT_LIMITS=Object.freeze({maxBytes:20*1024*1024,maxPages:500,
  maxObjects:50000,maxGraphEntries:250000,maxDepth:100,maxImages:1000,
  maxImagePixels:8000000,maxTotalImagePixels:32000000});
export class InputInspectionError extends Error {
  constructor(code,message,options){super(message,options);this.name='InputInspectionError';this.code=code;}
}
const fail=(code,message)=>{throw new InputInspectionError(code,message);};
const cancel=signal=>{if(signal?.aborted)fail('cancelled','Inspection cancelled. Select or retry your PDF.');};
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
export async function inspectPDFInput(bytes,{PDF,readPages,signal,limits=INPUT_LIMITS}={}){
  cancel(signal);
  if(!(bytes instanceof Uint8Array)||bytes.length<16)
    fail('invalid-input','Select a complete PDF file.');
  if(bytes.length>limits.maxBytes)fail('file-limit','This PDF exceeds the current inspection size limit. Try a smaller file.');
  // Strict supported scope: conventional complete PDFs, not parser-repaired
  // damaged files. Header/EOF checks do not substitute for structural parsing.
  const header=new TextDecoder('ascii').decode(bytes.subarray(0,16));
  const tail=new TextDecoder('ascii').decode(bytes.subarray(Math.max(0,bytes.length-1024)));
  if(!/^%PDF-1\.[0-7](?:\s|$)/.test(header)&&!/^%PDF-2\.0(?:\s|$)/.test(header))
    fail('unsupported-header','This file has no supported PDF header. Export a fresh PDF from its source application.');
  if(!/%%EOF\s*$/.test(tail))fail('incomplete-pdf','This PDF appears incomplete. Download or export a fresh copy.');
  if(!PDF?.PDFDocument||typeof readPages!=='function')
    fail('inspection-unavailable','The independent PDF inspection engine is unavailable. Retry when it is ready.');
  let doc;
  try{doc=await PDF.PDFDocument.load(bytes.slice(),{updateMetadata:false,
    // This only permits reading the encryption marker. The next gate rejects
    // encrypted documents before content inspection; no password or decryption.
    throwOnInvalidObject:true,ignoreEncryption:true});}
  catch(error){
    if(error?.name==='EncryptedPDFError')fail('encrypted-pdf','Password-protected PDFs are not supported. Use an authorized unencrypted copy.');
    fail('invalid-pdf','The PDF could not be parsed safely. Export a fresh copy.');
  }
  cancel(signal);
  const {context}=doc,N=PDF.PDFName.of;
  const has=(dict,key)=>dict instanceof PDF.PDFDict&&dict.has(N(key));
  const name=(dict,key)=>String(dict.get(N(key))??'');
  const objects=context.enumerateIndirectObjects();
  if(objects.length>limits.maxObjects)fail('object-limit','This PDF has too many objects for safe inspection on this device.');
  if(doc.isEncrypted||context.trailerInfo.Encrypt)
    fail('encrypted-pdf','Encrypted PDFs are unsupported. Use an authorized unencrypted copy.');
  let entries=0,signed=has(doc.catalog,'Perms'),xfa=false,activeContent=false,
    attachmentPresent=false,totalPixels=0;
  const seen=new Set(),images=[];
  function walk(value,depth=0){
    cancel(signal);
    if(++entries>limits.maxGraphEntries||depth>limits.maxDepth)
      fail('structure-limit','This PDF is too complex for the supported inspection limits.');
    if(value instanceof PDF.PDFRef){
      const key=String(value);if(seen.has(key))return;seen.add(key);
      const resolved=context.lookup(value);
      if(!resolved)fail('broken-reference','This PDF contains a missing object. Export a fresh copy.');
      walk(resolved,depth+1);return;
    }
    if(value instanceof PDF.PDFInvalidObject)fail('invalid-object','This PDF contains an invalid object. Export a fresh copy.');
    if(value instanceof PDF.PDFRawStream){walk(value.dict,depth+1);return;}
    if(value instanceof PDF.PDFDict){
      if(name(value,'Type')==='/Sig'||name(value,'FT')==='/Sig'||has(value,'ByteRange'))signed=true;
      if(has(value,'XFA'))xfa=true;
      if(name(value,'Type')==='/EmbeddedFile'||has(value,'EmbeddedFiles')||has(value,'EF')||has(value,'AF'))attachmentPresent=true;
      if(['/JavaScript','/Launch','/GoToR','/SubmitForm','/ImportData'].includes(name(value,'S'))||
        has(value,'JS')||has(value,'AA')||has(value,'OpenAction'))activeContent=true;
      for(const [,v] of value.entries())walk(v,depth+1);
    }else if(value instanceof PDF.PDFArray){
      for(let i=0;i<value.size();i++)walk(value.get(i),depth+1);
    }
  }
  // Walk all objects, including unreachable sensitive/invalid objects: do not
  // treat catalog presence alone as signature or corruption detection.
  for(const [ref,object] of objects){walk(ref);
    if(object instanceof PDF.PDFRawStream&&name(object.dict,'Subtype')==='/Image'){
      const d=object.dict,num=k=>context.lookup(d.get(N(k)))?.asNumber?.()??null;
      const width=num('Width'),height=num('Height');
      if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)
        fail('invalid-image','This PDF contains an image with invalid dimensions. Export a fresh copy.');
      const pixels=width*height;totalPixels+=pixels;
      if(!Number.isSafeInteger(pixels)||pixels>limits.maxImagePixels||totalPixels>limits.maxTotalImagePixels)
        fail('image-pixel-limit','The embedded images exceed the current decoded-image inspection budget. Try a lower-resolution copy.');
      // Dictionary dimensions alone cannot bound a forged encoded JPEG frame.
      // This runs before the independent parser may decode direct JPEG images.
      if(name(d,'Filter')==='/DCTDecode'){
        let frame;
        try{frame=inspectJpegHeader(object.contents);}catch{
          fail('image-header-unverifiable','A JPEG image header could not be verified. Export a fresh PDF.');
        }
        if(frame.width!==width||frame.height!==height)
          fail('encoded-image-dimensions','JPEG dimensions disagree with the PDF image dictionary. Export a fresh PDF.');
      }
      images.push({ref:String(ref),width,height,bitsPerComponent:num('BitsPerComponent'),
        filter:name(d,'Filter'),colorSpace:name(d,'ColorSpace'),streamBytes:object.contents.length,
        mask:has(d,'Mask'),softMask:has(d,'SMask'),decode:has(d,'Decode'),decodeParms:has(d,'DecodeParms')});
    }
  }
  if(images.length>limits.maxImages)fail('image-limit','This PDF contains too many images for supported processing.');
  if(signed)fail('signed-pdf','This PDF contains a signature or certification marker. Compression can invalidate it; keep the original.');
  if(xfa)fail('unsupported-xfa','Dynamic XFA forms are unsupported. Keep this original PDF.');
  if(activeContent)fail('unsupported-actions','This PDF contains interactive document actions that cannot yet be verified safely. Keep the original.');
  let pages;
  try{pages=doc.getPages();}catch{fail('invalid-pages','The PDF page tree is damaged. Export a fresh copy.');}
  if(!pages.length||pages.length>limits.maxPages)fail('page-limit','The PDF must contain between 1 and '+limits.maxPages+' pages.');
  const geometry=pages.map(page=>{
    const media=page.getMediaBox(),crop=page.getCropBox(),rotation=page.getRotation().angle;
    if(![media.x,media.y,media.width,media.height,crop.x,crop.y,crop.width,crop.height,rotation].every(Number.isFinite)||
      media.width<=0||media.height<=0||crop.width<=0||crop.height<=0||rotation%90!==0)
      fail('invalid-geometry','The PDF contains unsupported page dimensions or rotation.');
    return {mediaBox:media,cropBox:crop,rotation};
  });
  let independent;
  try{independent=await readPages(bytes.slice(),{signal,maxPages:limits.maxPages,maxImagePixels:limits.maxImagePixels});}
  catch(error){cancel(signal);if(error instanceof InputInspectionError)throw error;
    throw new InputInspectionError('independent-inspection-failed',
      'The independent reader could not verify this PDF. Export a fresh copy.',{cause:error});}
  cancel(signal);
  if(!independent||independent.pages?.length!==pages.length)
    fail('reader-disagreement','PDF readers disagree about the page tree. Keep the original.');
  for(let i=0;i<pages.length;i++){
    const p=independent.pages[i],g=geometry[i],box=g.cropBox;
    if(!p||!Number.isSafeInteger(p.textItems)||p.textItems<0||!Number.isSafeInteger(p.imagePaints)||p.imagePaints<0||
      !Array.isArray(p.view)||p.view.length!==4||
      p.rotation!==((g.rotation%360)+360)%360||
      p.view.some((n,j)=>!Number.isFinite(n)||Math.abs(n-[box.x,box.y,box.x+box.width,box.y+box.height][j])>.01))
      fail('reader-disagreement','PDF readers disagree about page content or geometry. Keep the original.');
  }
  const textPages=independent.pages.filter(p=>p.textItems>0).length;
  const imagePages=independent.pages.filter(p=>p.imagePaints>0).length;
  const classification=textPages?(imagePages?'mixed':'digital'):(imagePages?'image-only':'vector-or-empty');
  return freeze({valid:true,sourceBytes:bytes.length,pageCount:pages.length,classification,
    // Image-only is not proof of scanner provenance; text over images may be OCR.
    hasTextLayer:textPages>0,possibleOCR:textPages>0&&imagePages>0,
    geometry,pages:independent.pages,images,structures:{
      forms:has(doc.catalog,'AcroForm'),bookmarks:has(doc.catalog,'Outlines'),
      attachments:attachmentPresent,
      annotations:independent.pages.some(p=>p.annotations>0),
      links:independent.pages.some(p=>p.links>0),
      tags:has(doc.catalog,'StructTreeRoot'),metadata:has(doc.catalog,'Metadata')||Boolean(context.trailerInfo.Info),
      signatures:false,encryption:false},
    preservationPolicy:'Preserve all document and page structures. No compression or download is authorized by inspection.',
    processingApproved:false});
}

// Transactional input selection only; full processing lifecycle belongs to Task 8.
export function createInputSession(inspect){
  if(typeof inspect!=='function')throw new TypeError('inspect must be a function');
  let active=null,generation=0;
  return {
    get report(){return active?.report??null;},
    sourceBytes(){return active?.bytes.slice()??null;},
    async replace(bytes,options){
      const id=++generation;
      if(!(bytes instanceof Uint8Array))fail('invalid-input','Select a PDF file.');
      const candidate=bytes.slice();
      const report=await inspect(candidate.slice(),options);
      if(id!==generation)return {status:'stale-input-discarded'};
      cancel(options?.signal);
      active={bytes:candidate,report};return {status:'ready',report};
    },
    clear(){generation++;active=null;}
  };
}
