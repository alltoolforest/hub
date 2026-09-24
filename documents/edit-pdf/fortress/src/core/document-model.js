import { PDFName, PDFArray, PDFDict, PDFRawStream, PDFRef, decodePDFRawStream } from './pdf-lib.js';
import { inspectFontResource } from '../fonts/font-inspector.js';

function key(ref){return ref?.toString?.() ?? String(ref);}
function contentsRefs(page){
  const raw=page.node.get(PDFName.of('Contents'));
  if(!raw) return [];
  if(raw instanceof PDFArray) return raw.asArray();
  return [raw];
}
function decodedStream(ctx,ref){
  const obj=ref instanceof PDFRawStream?ref:ctx.lookup(ref);
  if(!(obj instanceof PDFRawStream)) return null;
  const bytes=decodePDFRawStream(obj).getBytes();
  return {obj,bytes:new Uint8Array(bytes)};
}

export function getPageContentStreams(pdfDoc,pageIndex){
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context; const refs=contentsRefs(page);
  return refs.map((ref,streamIndex)=>{
    const d=decodedStream(ctx,ref);
    return {streamIndex,ref,refKey:key(ref),bytes:d?.bytes??new Uint8Array(),rawStream:d?.obj??null};
  });
}

export function buildStreamReferenceCounts(pdfDoc){
  const counts=new Map();
  for(let i=0;i<pdfDoc.getPageCount();i++){
    for(const ref of contentsRefs(pdfDoc.getPage(i))){ const k=key(ref); counts.set(k,(counts.get(k)||0)+1); }
  }
  return counts;
}

export function replacePageContentStream(pdfDoc,pageIndex,streamIndex,newBytes,{cloneShared=true}={}){
  const page=pdfDoc.getPage(pageIndex); const ctx=pdfDoc.context; const raw=page.node.get(PDFName.of('Contents'));
  const refs=contentsRefs(page); if(streamIndex<0||streamIndex>=refs.length) throw new Error('Invalid stream index');
  const counts=buildStreamReferenceCounts(pdfDoc); const oldRef=refs[streamIndex]; const shared=(counts.get(key(oldRef))||0)>1;
  const dict=ctx.obj({}); const newRef=ctx.register(PDFRawStream.of(dict,newBytes));
  if(raw instanceof PDFArray){ raw.set(streamIndex,newRef); }
  else page.node.set(PDFName.of('Contents'),newRef);
  return {oldRef,newRef,sharedCloned:cloneShared&&shared};
}

export function listPageFontContexts(pdfDoc,pageIndex){
  const page=pdfDoc.getPage(pageIndex); const fonts=page.node.Resources()?.lookup(PDFName.of('Font'));
  if(!(fonts instanceof PDFDict)) return [];
  const out=[];
  for(const [name] of fonts.entries()){
    const n=name?.asString?.()?.replace(/^\//,'') || name?.toString?.()?.replace(/^\//,'');
    if(n) out.push(inspectFontResource(pdfDoc,pageIndex,n));
  }
  return out.filter(Boolean);
}

export function detectDocumentFlags(pdfDoc){
  const ctx=pdfDoc.context; const trailer=ctx.trailerInfo||{};
  const encrypted=!!trailer.Encrypt;
  const acroForm=pdfDoc.catalog?.lookup?.(PDFName.of('AcroForm'));
  let hasAcroForm=acroForm instanceof PDFDict;
  let signed=false;
  if(hasAcroForm){
    const visit=(obj,depth=0)=>{
      if(depth>16||signed) return;
      const d=obj instanceof PDFDict?obj:ctx.lookup(obj);
      if(!(d instanceof PDFDict)) return;
      const ft=d.lookup(PDFName.of('FT')); const name=ft?.asString?.()?.replace(/^\//,'')||ft?.toString?.()?.replace(/^\//,'');
      if(name==='Sig'||d.get(PDFName.of('V'))&&name==='Sig'){signed=true;return;}
      const kids=d.lookup(PDFName.of('Kids')); if(kids instanceof PDFArray) for(const k of kids.asArray()) visit(k,depth+1);
    };
    const fields=acroForm.lookup(PDFName.of('Fields'));
    if(fields instanceof PDFArray) for(const f of fields.asArray()) visit(f);
  }
  return {encrypted,hasAcroForm,signed};
}

export class DocumentModel{
  constructor(pdfDoc){this.pdfDoc=pdfDoc;this.flags=detectDocumentFlags(pdfDoc);}
  page(index){
    const page=this.pdfDoc.getPage(index); const mb=page.getMediaBox(); const cb=page.getCropBox();
    return {index,rotation:page.getRotation().angle,mediaBox:mb,cropBox:cb,streams:getPageContentStreams(this.pdfDoc,index),fonts:listPageFontContexts(this.pdfDoc,index)};
  }
}
