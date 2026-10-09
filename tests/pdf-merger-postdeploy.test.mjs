// Post-deployment PDF Merger regression: only this tool's modules and markup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {preparePdfBatch,samePdfContents} from '../assets/js/pdf-merger-input.js';
import {checkComplexStructure,verifiedMerge} from '../assets/js/pdf-merger-verify.js';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
function mockFile(name,bytes,lastModified=10){
 return {name,size:bytes.length,lastModified,
  slice:(a,b)=>({arrayBuffer:async()=>bytes.slice(a,b).buffer}),
  arrayBuffer:async()=>bytes.slice().buffer};
}
function fakeBytes(t){return new TextEncoder().encode('%PDF-1.7\\n'+t);}
const loadPdf=async()=>({getPageCount:()=>1});

test('matching metadata but different PDF bytes never causes a false duplicate',async()=>{
 const a=mockFile('same.pdf',fakeBytes('AAAA'),12);
 const b=mockFile('same.pdf',fakeBytes('BBBB'),12);
 assert.equal(a.size,b.size);
 assert.equal(await samePdfContents(a,b),false);
 const batch=await preparePdfBatch([],[a,b],{isMobile:true,loadPdf});
 assert.equal(batch.entries.length,2);
 assert.deepEqual(batch.skipped,[]);
 const sameAgain=await preparePdfBatch(batch.entries,[a,b],{isMobile:true,loadPdf});
 assert.equal(sameAgain.entries.length,0);
 assert.deepEqual(sameAgain.skipped,['same.pdf','same.pdf']);
});
test('comparison remains content-aware across chunk boundaries and works on small files',async()=>{
 const bytes=new Uint8Array(256*1024+7);bytes.fill(7);const other=bytes.slice();
 assert.equal(await samePdfContents(mockFile('a.pdf',bytes),mockFile('b.pdf',other)),true);
 other[256*1024+3]=8;
 assert.equal(await samePdfContents(mockFile('a.pdf',bytes),mockFile('b.pdf',other)),false);
});
test('document-level structures that page copying can drop fail closed',async()=>{
 const doc=await lib.PDFDocument.create();doc.addPage([300,500]);
 for(const [key,reason] of [
  ['StructTreeRoot','tagged accessibility'],
  ['OCProperties','optional-content'],
  ['PageLabels','custom page'],
  ['Dests','named destinations'],
  ['Threads','document threads'],
  ['Collection','PDF portfolio']
 ]){
  const name=lib.PDFName.of(key);
  doc.catalog.set(name,doc.context.obj({Example:1}));
  assert.throws(()=>checkComplexStructure(doc,lib,'complex.pdf'),new RegExp(reason));
  doc.catalog.delete(name);
 }
});
test('internal page links are rejected, but standard URI links are allowed',async()=>{
 const doc=await lib.PDFDocument.create(),page=doc.addPage([300,400]);
 const S=lib.PDFName.of;
 const link=doc.context.obj({
  Type:S('Annot'),Subtype:S('Link'),Rect:[0,0,30,30],
  A:doc.context.obj({S:S('GoTo'),D:[0,S('Fit')]})
 });
 page.node.set(S('Annots'),doc.context.obj([doc.context.register(link)]));
 assert.throws(()=>checkComplexStructure(doc,lib,'links.pdf'),/unsupported page links/);
 const safe=doc.context.obj({
  Type:S('Annot'),Subtype:S('Link'),Rect:[0,0,30,30],
  A:doc.context.obj({S:S('URI'),URI:lib.PDFString.of('https://example.com')})
 });
 page.node.set(S('Annots'),doc.context.obj([doc.context.register(safe)]));
 assert.doesNotThrow(()=>checkComplexStructure(doc,lib,'links.pdf'));
});
test('ordinary PDFs still merge with original geometry and page ordering',async()=>{
 const one=await lib.PDFDocument.create(),two=await lib.PDFDocument.create();
 one.addPage([321,512]);two.addPage([543,670]);
 const bytes1=new Uint8Array(await one.save()),bytes2=new Uint8Array(await two.save());
 const source=[
  {file:mockFile('ordinary-a.pdf',bytes1,1),pageCount:1},
  {file:mockFile('ordinary-b.pdf',bytes2,2),pageCount:1}
 ];
 const merged=await verifiedMerge(source,lib,{isMobile:true});
 const parsed=await lib.PDFDocument.load(await merged.blob.arrayBuffer());
 assert.deepEqual(parsed.getPages().map(p=>p.getWidth()),[321,543]);
});
test('only merger styles and controls are scoped; global core is unchanged',()=>{
 const css=readFileSync(new URL('../assets/css/pdf-merger.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../assets/js/pdf-merger.js',import.meta.url),'utf8');
 assert.ok(css.includes('.pdf-merger-thumbnail[hidden]'));
 assert.ok(css.includes('.pdf-merger-jump[hidden]'));
 assert.ok(js.includes('sharedShare.replaceWith(safeShare)'));
 assert.match(js,/Previous verified PDF: this download uses the earlier file arrangement/);
 assert.match(js,/id:'pdf-merger-actions'/);
});
