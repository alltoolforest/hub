import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectV3Source,V3SecurityError} from '../assets/js/pdf-compressor-v3/security-preflight.mjs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const N=PDF.PDFName.of,code=(v)=>e=>e instanceof V3SecurityError&&e.code===v;
const create=async mutate=>{
 const doc=await PDF.PDFDocument.create();
 doc.addPage([600,800]).drawText('A valid synthetic document');
 await mutate?.(doc);
 return new Uint8Array(await doc.save({useObjectStreams:true}));
};
test('parses unsigned ordinary PDF with independent PDF-lib and exact page geometry',async()=>{
 const bytes=await create();
 const report=await inspectV3Source(bytes,{PDF});
 assert.equal(report.allowed,true);assert.equal(report.pages,1);
 assert.ok(report.objects>0);assert.ok(report.destructiveLosses.includes('selectable text'));
});
test('signed PDF signature field and byte-range are rejected before flattening',async()=>{
 for(const dict of [
  {Type:N('Sig'),Filter:N('Adobe.PPKLite')},
  {FT:N('Sig'),T:PDF.PDFString.of('Signed')},
  {ByteRange:[0,10,30,40]}
 ]){
  const bytes=await create(doc=>{
   const ref=doc.context.register(doc.context.obj(dict));
   doc.catalog.set(N('TestSignature'),ref);
  });
  await assert.rejects(inspectV3Source(bytes,{PDF}),code('signed-or-certified-pdf'));
 }
});
test('active JavaScript and Launch actions are rejected even in nested dictionaries',async()=>{
 for(const action of ['JavaScript','Launch']){
  const bytes=await create(doc=>{
   doc.catalog.set(N('TestNested'),doc.context.obj({
    Child:{S:N(action),JS:PDF.PDFString.of('x')}
   }));
  });
  await assert.rejects(inspectV3Source(bytes,{PDF}),code('active-content-pdf'));
 }
});
test('malformed files, over-budget inputs and abort reject without any output',async()=>{
 await assert.rejects(inspectV3Source(new Uint8Array(100).fill(3),{PDF}),
  code('unreadable-or-encrypted-pdf'));
 const data=await create();
 await assert.rejects(inspectV3Source(data,{PDF,maxBytes:100}),code('input-too-large'));
 await assert.rejects(inspectV3Source(data,{PDF,signal:AbortSignal.abort()}),code('cancelled'));
});
test('ordinary AcroForm structures remain inspectable with explicit loss warnings',async()=>{
 const bytes=await create(doc=>{
  const form=doc.getForm(),page=doc.getPages()[0];
  form.createTextField('reference').addToPage(page,{x:20,y:200,width:100,height:30});
 });
 const report=await inspectV3Source(bytes,{PDF});
 assert.equal(report.allowed,true);assert.equal(report.hasForms,true);
});
