// PDF Merger only: bookmark consent and safety regression.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {verifiedMerge,checkComplexStructure} from '../assets/js/pdf-merger-verify.js';
import {mergePdfBatch} from '../assets/js/pdf-merger-runner.js';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
function outline(doc){
 const N=lib.PDFName.of;
 const root=doc.context.obj({Type:N('Outlines'),Count:1});
 const ref=doc.context.register(root);
 const page=doc.getPages()[0];
 const mark=doc.context.obj({Title:lib.PDFString.of('Part 1'),Parent:ref,Dest:[page.ref,N('Fit')]});
 const markRef=doc.context.register(mark);
 root.set(N('First'),markRef);root.set(N('Last'),markRef);
 doc.catalog.set(N('Outlines'),ref);
}
async function file(name,width,{bookmarks=false,form=false,signature=false}={}){
 const doc=await lib.PDFDocument.create();doc.addPage([width,500]);
 if(bookmarks)outline(doc);
 if(form)doc.getForm().createTextField('user-email').addToPage(doc.getPages()[0]);
 if(signature)doc.catalog.set(lib.PDFName.of('Perms'),doc.context.obj({Example:true}));
 const bytes=new Uint8Array(await doc.save());
 return {file:{name,size:bytes.length,lastModified:1,arrayBuffer:async()=>bytes.slice().buffer},pageCount:1};
}
test('valid PDF with real outline is rejected by default with an actionable choice',async()=>{
 const a=await file('PremiumTablePlanB.pdf',352,{bookmarks:true});
 const b=await file('ordinary.pdf',410);
 await assert.rejects(()=>verifiedMerge([a,b],lib),/PremiumTablePlanB.pdf.*bookmarks.*Merge pages only/);
});
test('explicit page-only consent merges and verifies bookmarked source while omitting outlines',async()=>{
 const a=await file('PremiumTablePlanB.pdf',352,{bookmarks:true});
 const b=await file('ordinary.pdf',410);
 const result=await verifiedMerge([a,b],lib,{allowBookmarkLoss:true,isMobile:true});
 const pdf=await lib.PDFDocument.load(await result.blob.arrayBuffer());
 assert.equal(result.pageCount,2);
 assert.deepEqual(pdf.getPages().map(page=>page.getWidth()),[352,410]);
 assert.equal(pdf.catalog.get(lib.PDFName.of('Outlines')),undefined);
});
test('consent does not disable protection of forms, signatures or tag structures',async()=>{
 const ordinary=await file('plain.pdf',300);
 for(const opts of [{form:true},{signature:true}]){
  const special=await file('protected.pdf',350,{bookmarks:true,...opts});
  await assert.rejects(()=>verifiedMerge([special,ordinary],lib,{allowBookmarkLoss:true}),/protected.pdf.*contains/);
 }
 const tagged=await lib.PDFDocument.create();tagged.addPage([350,400]);outline(tagged);
 tagged.catalog.set(lib.PDFName.of('StructTreeRoot'),tagged.context.obj({Type:lib.PDFName.of('StructTreeRoot')}));
 assert.throws(()=>checkComplexStructure(tagged,lib,'tagged.pdf',{allowBookmarkLoss:true}),/tagged accessibility/);
});
test('normal PDF still merges with default consent false using existing fallback',async()=>{
 const first=await file('a.pdf',340),last=await file('b.pdf',440);
 const result=await mergePdfBatch([first,last],{isMobile:true,loadEngine:async()=>lib});
 const pdf=await lib.PDFDocument.load(await result.blob.arrayBuffer());
 assert.deepEqual(pdf.getPages().map(p=>p.getWidth()),[340,440]);
});
