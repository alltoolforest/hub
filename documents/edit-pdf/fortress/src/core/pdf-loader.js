import { PDFDocument } from './pdf-lib.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 60 * 1024 * 1024,
  maxPages: 250,
});

export async function loadPdfForEditing(input,{limits=DEFAULT_LIMITS}={}){
  const bytes=input instanceof Uint8Array?new Uint8Array(input):new Uint8Array(input);
  if(bytes.byteLength>limits.maxBytes) throw new Error(`PDF exceeds ${Math.round(limits.maxBytes/1024/1024)} MB limit`);
  let doc;
  try { doc=await PDFDocument.load(bytes.slice(),{ignoreEncryption:true,updateMetadata:false}); }
  catch(err){ const e=new Error('Could not parse this PDF safely.'); e.cause=err; throw e; }
  if(doc.getPageCount()>limits.maxPages) throw new Error(`PDF exceeds ${limits.maxPages}-page limit`);
  return {originalBytes:bytes,pdfDoc:doc,pageCount:doc.getPageCount()};
}
