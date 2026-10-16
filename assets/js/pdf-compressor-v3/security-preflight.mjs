// Independent V3 PDF source-security gate.
// Never substitute a synthetic benchmark allow-all callback in production.
// This is intentionally independent of image-codec eligibility: unsupported
// JPEG metadata must not prevent a valid, consented raster compression.
export class V3SecurityError extends Error {
  constructor(code){super(code);this.name='V3SecurityError';this.code=code;}
}
const fail=code=>{throw new V3SecurityError(code);};
const DANGEROUS_KEYS=new Set([
  '/JS','/JavaScript','/Launch','/OpenAction','/AA','/RichMedia',
  '/Rendition','/Movie','/Sound','/SubmitForm','/GoToR','/GoToE'
]);
const DANGEROUS_ACTIONS=new Set([
  '/JavaScript','/Launch','/SubmitForm','/GoToR','/GoToE','/ImportData'
]);
const SIGNATURE_TYPES=new Set(['/Sig','/DocTimeStamp']);
function checkAbort(signal){if(signal?.aborted)fail('cancelled');}
export async function inspectV3Source(bytes,{
  PDF,signal,maxBytes=100_000_000,maxPages=1200,maxObjects=200_000
}={}){
  checkAbort(signal);
  if(!(bytes instanceof Uint8Array)||bytes.length<16)fail('invalid-pdf');
  if(bytes.length>maxBytes)fail('input-too-large');
  if(!PDF?.PDFDocument?.load||!PDF?.PDFDict||!PDF?.PDFArray)fail('security-reader-unavailable');
  // PDF-lib rejects encrypted sources by default. Do not override this.
  let document;
  try{
    document=await PDF.PDFDocument.load(bytes,{
      updateMetadata:false,throwOnInvalidObject:true,ignoreEncryption:false
    });
  }catch{
    fail('unreadable-or-encrypted-pdf');
  }
  checkAbort(signal);
  const ctx=document.context;
  if(document.isEncrypted||ctx?.trailerInfo?.Encrypt)fail('encrypted-pdf');
  const pages=document.getPageCount();
  if(!Number.isSafeInteger(pages)||pages<1||pages>maxPages)fail('page-limit');
  for(const page of document.getPages()){
    const box=page.getMediaBox();
    if(!Number.isFinite(box.width)||!Number.isFinite(box.height)||
      box.width<=0||box.height<=0||box.width>20000||box.height>20000)
      fail('unsafe-page-geometry');
  }
  let objects=0,nodes=0,hasForms=false,hasAttachments=false,hasAnnotations=false;
  // Walk parsed dictionaries and direct arrays, NOT arbitrary content bytes.
  // PDF-lib expands object streams during parsing; signed/active dictionaries
  // in compressed object streams must also be inspected.
  const visited=new WeakSet();
  const scan=(obj,depth)=>{
    if(++nodes>1_000_000||depth>35)fail('security-structure-limit');
    if(!obj||typeof obj!=='object'||obj instanceof PDF.PDFRef)return;
    if(visited.has(obj))return;
    visited.add(obj);
    if(obj instanceof PDF.PDFArray){
      if(obj.size()>100000)fail('security-structure-limit');
      for(let i=0;i<obj.size();i++)scan(obj.get(i),depth+1);
      return;
    }
    if(!(obj instanceof PDF.PDFDict))return;
    for(const [key,value] of obj.entries()){
      const k=String(key),v=String(value);
      if(k==='/ByteRange'||(k==='/Type'&&SIGNATURE_TYPES.has(v))||
          (k==='/FT'&&v==='/Sig')||(k==='/Perms'))
        fail('signed-or-certified-pdf');
      if(DANGEROUS_KEYS.has(k)||(k==='/S'&&DANGEROUS_ACTIONS.has(v)))
        fail('active-content-pdf');
      if(k==='/AcroForm'||k==='/FT')hasForms=true;
      if(k==='/EmbeddedFiles'||v==='/EmbeddedFile')hasAttachments=true;
      if(k==='/Annots')hasAnnotations=true;
      scan(value,depth+1);
    }
  };
  scan(document.catalog?.dict,0);
  for(const [,obj] of ctx.enumerateIndirectObjects()){
    if(++objects>maxObjects)fail('object-limit');
    checkAbort(signal);
    // Many active-content dictionaries are indirect; scan all of them.
    if(obj instanceof PDF.PDFRawStream)scan(obj.dict,0);
    else scan(obj,0);
  }
  checkAbort(signal);
  return Object.freeze({allowed:true,pages,objects,
    hasForms,hasAttachments,hasAnnotations,
    destructiveLosses:Object.freeze([
      'selectable text','forms','annotations and links',
      'bookmarks','attachments','document tagging'
    ])});
}
