import {PDFDocument} from '../fortress/src/core/pdf-lib.js';
import {exportEditedPdf} from '../fortress/src/export/exporter.js';
export async function replaceOcrPage(doc,pageIndex,pageBytes){
 const one=await PDFDocument.load(pageBytes.slice(),{ignoreEncryption:true,updateMetadata:false});if(one.getPageCount()!==1)throw new Error('OCR page snapshot is not a single-page PDF.');if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())throw new Error('OCR target page is unavailable.');const original=doc.getPage(pageIndex),candidate=one.getPage(0);if(Math.abs(original.getWidth()-candidate.getWidth())>.01||Math.abs(original.getHeight()-candidate.getHeight())>.01||original.getRotation().angle!==candidate.getRotation().angle)throw new Error('OCR page geometry changed.');const [replacement]=await doc.copyPages(one,[0]);doc.insertPage(pageIndex,replacement);doc.removePage(pageIndex+1);
}
export async function composeMixedExport(sourceBytes,transactions,ocrPages,measure,rasterPages=[]){
 if(typeof measure!=='function')throw new Error('Mixed flow geometry is unavailable.');const combined=await PDFDocument.load(sourceBytes.slice(),{ignoreEncryption:true,updateMetadata:false});for(const {pageIndex,bytes}of ocrPages)await replaceOcrPage(combined,pageIndex,bytes);const bytes=new Uint8Array(await combined.save({useObjectStreams:false,updateFieldAppearances:false})),geometry=await measure(bytes,{rasterPages,configure:false});if(!Array.isArray(geometry)||geometry.length!==combined.getPageCount())throw new Error('Mixed flow page geometry is incomplete.');
 const replanned=transactions.map(tx=>tx.reflowPlan?{...tx,reflowPlan:{...tx.reflowPlan,cascadePages:geometry.filter(g=>g.pageIndex>tx.pageIndex)}}:tx);return exportEditedPdf(bytes,replanned);
}
