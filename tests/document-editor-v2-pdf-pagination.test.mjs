import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const {paginateInsertedLayout,insertContinuationPages}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/paragraph-pagination.js');
const {mapFlowRectangle}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/flow-map.js');
test('visual lines paginate within source/footer and continuation frames without losing blank or long lines',()=>{
 const lines=['',...Array.from({length:300},(_,i)=>'Line '+i),''];const layout={pageSize:{width:600,height:800},size:12,lineHeight:14.4,lines,bottomY:-4000};
 const chunks=paginateInsertedLayout({y:300,reflowPlan:{footerGuard:{top:70},topMargin:30,bottomMargin:24}},layout);
 assert.ok(chunks.length>4);assert.deepEqual(chunks.flatMap(c=>c.lines),lines);assert.equal(chunks[0].y,300);assert.ok(chunks[0].bottomY>=74);for(const c of chunks.slice(1))assert.ok(c.bottomY>=24);
});
test('inserted paragraph pages precede existing following pages and expose immutable object index mappings',async()=>{
 const {PDFDocument}=globalThis.PDFLib,doc=await PDFDocument.create();for(let i=0;i<3;i++)doc.addPage([600,800]);const oldPages=doc.getPages();
 const chunks=[0,1,2].map(()=>({pageSize:{width:600,height:800}})),metric=insertContinuationPages(doc,1,chunks);assert.equal(doc.getPageCount(),5);assert.equal(doc.getPage(4),oldPages[2]);assert.equal(doc.getPage(1),oldPages[1]);
 assert.deepEqual(mapFlowRectangle({x:50,y:200,width:20,height:10},2,[metric]),{x:50,y:200,width:20,height:10,pageIndex:4});
 assert.equal(insertContinuationPages(doc,0,chunks.slice(0,1)),null);
});
test('inserting paragraph continuation pages preserves canonical form fields on shifted original pages',async()=>{
 const {PDFDocument}=globalThis.PDFLib,{verifyFormPreservation}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/form-protection.js');
 const doc=await PDFDocument.create();for(let i=0;i<3;i++)doc.addPage([600,800]);const field=doc.getForm().createTextField('Reflow audit field');field.setText('Retained form value');field.addToPage(doc.getPage(2),{x:50,y:200,width:180,height:24});const original=await doc.save({useObjectStreams:false});
 const metric=insertContinuationPages(doc,1,[0,1,2].map(()=>({pageSize:{width:600,height:800}}))),output=await doc.save({useObjectStreams:false});await verifyFormPreservation(original,output,{reflowMetrics:[metric]});const reopened=await PDFDocument.load(output);assert.equal(reopened.getForm().getTextField('Reflow audit field').getText(),'Retained form value');
});
