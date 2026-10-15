import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectPDFInput,INPUT_LIMITS} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const N=PDF.PDFName.of;
let fixture;
async function complexDocument(){
 if(fixture)return fixture;
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 for(let i=0;i<120;i++){
  const page=doc.addPage([450+i%4,640+i%6]);
  page.drawText('ATF complex valid PDF page '+String(i+1),{x:30,y:520});
 }
 // Additional valid, unreachable indirect objects exercise full-object
 // inventory rather than merely the visible page tree.
 for(let i=0;i<320;i++)
  doc.context.register(doc.context.obj({Type:'CompatFixture',
   Sequence:i,Value:PDF.PDFString.of('fixture '+i)}));
 const bytes=new Uint8Array(await doc.save({useObjectStreams:false}));
 const count=(await PDF.PDFDocument.load(bytes,{updateMetadata:false})).context.enumerateIndirectObjects().length;
 assert.ok(count>420,'fixture must exercise hundreds of indirect objects');
 fixture={bytes,count};return fixture;
}
test('120-page PDF with hundreds of objects remains independently inspectable',async()=>{
 const {bytes,count}=await complexDocument();
 const before=bytes.slice();
 const report=await inspectPDFInput(bytes,{PDF,
  readPages:createIndependentInputReader(pdfjs)});
 assert.equal(report.valid,true);
 assert.equal(report.pageCount,120);
 assert.equal(report.pages.length,120);
 assert.equal(report.images.length,0);
 assert.equal(report.classification,'digital');
 assert.equal(report.geometry[119].mediaBox.width,453);
 assert.deepEqual(bytes,before,'inspection must not rewrite any source objects');
 assert.ok(count<INPUT_LIMITS.maxObjects);
});
test('resource limits reject complex PDFs explicitly without weakening verification',async()=>{
 const {bytes,count}=await complexDocument();
 await assert.rejects(inspectPDFInput(bytes,{PDF,
  readPages:async()=>{throw Error('page limit should fail before reader');},
  limits:{...INPUT_LIMITS,maxPages:100}}),e=>e.code==='page-limit');
 await assert.rejects(inspectPDFInput(bytes,{PDF,
  readPages:async()=>{throw Error('object limit should fail before reader');},
  limits:{...INPUT_LIMITS,maxObjects:count-1}}),e=>e.code==='object-limit');
 await assert.rejects(inspectPDFInput(bytes,{PDF,
  readPages:createIndependentInputReader(pdfjs),signal:AbortSignal.abort()}),
  e=>e.code==='cancelled');
});
