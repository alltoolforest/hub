import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {transformEmbeddedImages} from '../assets/js/pdf-compressor-v2/embedded-image-transform.mjs';
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

function rgbPixels(width,height,seed=0){
 const bytes=new Uint8Array(width*height*3);
 for(let i=0;i<bytes.length;i++)bytes[i]=(i*37+seed*17+(i>>7))&255;
 return bytes;
}
async function reusedMaskedImages({unique=true}={}){
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const context=doc.context;
 const stream=(data,options)=>context.register(context.stream(
   new Uint8Array(deflateSync(data)),{Type:'XObject',Subtype:'Image',
   BitsPerComponent:8,Filter:'FlateDecode',...options}));
 const alpha=stream(Uint8Array.from({length:96*96},(_,i)=>80+(i%150)),
   {Width:96,Height:96,ColorSpace:'DeviceGray'});
 const shared=stream(rgbPixels(96,96),{Width:96,Height:96,
   ColorSpace:'DeviceRGB',SMask:alpha});
 const uniqueRefs=[];
 for(let i=0;i<36;i++){
  const page=doc.addPage([440+i%4,620+i%3]);
  const xobjects={Shared:shared};
  if(unique&&i%4===0){
   const image=stream(rgbPixels(48,48,i+1),{Width:48,Height:48,ColorSpace:'DeviceRGB'});
   uniqueRefs.push(image);xobjects.Detail=image;
  }
  page.node.set(N('Resources'),context.obj({XObject:xobjects}));
  page.pushOperators(PDF.pushGraphicsState(),PDF.scale(180,180),
    PDF.drawObject('Shared'),PDF.popGraphicsState());
  if(i%2===0)page.drawText('ATF mixed fixture page '+(i+1),{x:20,y:450});
  if(xobjects.Detail)page.pushOperators(PDF.pushGraphicsState(),
    PDF.scale(50,50),PDF.drawObject('Detail'),PDF.popGraphicsState());
 }
 return {bytes:new Uint8Array(await doc.save({useObjectStreams:false})),
   uniqueCount:uniqueRefs.length};
}
test('36-page mixed scan-like document preserves shared XObject identities and transparency',async()=>{
 const {bytes,uniqueCount}=await reusedMaskedImages();
 const snapshot=bytes.slice(),doc=await PDF.PDFDocument.load(bytes);
 const report=await inspectPDFInput(bytes,{PDF,readPages:createIndependentInputReader(pdfjs)});
 assert.equal(report.valid,true);
 assert.equal(report.pageCount,36);
 assert.equal(report.classification,'mixed');
 assert.equal(report.images.length,2+uniqueCount);
 assert.equal(uniqueCount,9);
 assert.equal(report.images.filter(image=>image.softMask).length,1);
 assert.ok(report.pages.every(p=>p.imagePaints>=1));
 assert.equal(doc.getPageCount(),report.pageCount);
 assert.deepEqual(bytes,snapshot,'input inspection cannot mutate original images or page streams');
});
test('shared transparency/mask source takes preserve-as-is route without lossy re-encoding',async()=>{
 const {bytes}=await reusedMaskedImages({unique:false});
 const inspectInput=data=>inspectPDFInput(data,{PDF,readPages:createIndependentInputReader(pdfjs)});
 let verifiedOutput=false;
 const result=await transformEmbeddedImages(bytes,{
  PDF,mode:'maximum',inspectInput,encodeJpeg:async()=>{throw Error('mask must not be encoded');},
  verifyOutput:async()=>{verifiedOutput=true;return true;}
 });
 assert.equal(result.status,'original-retained');
 assert.equal(result.replacements,0);
 assert.deepEqual(result.bytes,bytes);
 assert.equal(verifiedOutput,false,'unchanged source needs no altered-image verifier');
});
