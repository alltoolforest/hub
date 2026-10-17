import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';

const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const N=PDF.PDFName.of;

// These are structurally valid PDFs with synthetic signature *markers*, not
// cryptographically signed files. Separately generated pyHanko signatures
// remain the real-cryptographic negative control in independent-input tests.
async function markedPDF(kind){
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const page=doc.addPage([350,480]);
 page.drawText('Do not modify a signed or certified source', {x:30,y:430});
 const context=doc.context;
 if(kind==='certification-docmdp'||kind==='certification-ur3'){
  const sig=context.register(context.obj({
   Type:'Sig',Filter:'Adobe.PPKLite',SubFilter:'adbe.pkcs7.detached',
   ByteRange:[0,10,20,30],Contents:PDF.PDFHexString.of('0000'),
   Reference:[{Type:'SigRef',TransformMethod:'DocMDP',
      TransformParams:{Type:'TransformParams',P:1,V:'1.2'}}]
  }));
  const key=kind==='certification-docmdp'?'DocMDP':'UR3';
  doc.catalog.set(N('Perms'),context.obj({[key]:sig}));
 }else if(kind==='visible-widget'||kind==='invisible-widget'){
  const rect=kind==='visible-widget'?[20,20,190,70]:[0,0,0,0];
  const widget=context.register(context.obj({
   Type:'Annot',Subtype:'Widget',FT:'Sig',
   T:PDF.PDFString.of('ApprovalSignature'),Rect:rect,P:page.ref
  }));
  page.node.set(N('Annots'),context.obj([widget]));
  doc.catalog.set(N('AcroForm'),context.obj({Fields:[widget],SigFlags:3}));
 }else if(kind==='byte-range-only'){
  context.register(context.obj({Reason:PDF.PDFString.of('approval'),
   ByteRange:[0,10,20,30]}));
 }else if(kind==='orphan-signature'){
  context.register(context.obj({Type:'Sig',
   Contents:PDF.PDFHexString.of('00'),ByteRange:[0,10,20,30]}));
 }else throw Error('unknown marker');
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const cases=['certification-docmdp','certification-ur3',
 'visible-widget','invisible-widget','byte-range-only','orphan-signature'];

test('Task 5 signature/certification markers reject before the independent reader',async()=>{
 for(const kind of cases){
  const source=await markedPDF(kind),snapshot=source.slice();
  // The structural checker must reject even if the later page reader cannot
  // detect the signature or the signature object is unreachable.
  let called=false;
  await assert.rejects(inspectPDFInput(source,{PDF,readPages:async()=>{
   called=true;throw Error('signature should be rejected earlier');
  }}),e=>e.code==='signed-pdf',kind);
  assert.equal(called,false,kind);
  assert.deepEqual(source,snapshot,kind+' cannot mutate the original PDF');
 }
});
test('signature rejection never overwrites a previously accepted source',async()=>{
 const {createInputSession}=await import('../assets/js/pdf-compressor-v2/input-inspector.mjs');
 const original=await PDF.PDFDocument.create({updateMetadata:false});
 original.addPage([350,480]);
 const safe=new Uint8Array(await original.save({useObjectStreams:false}));
 const readPages=async()=>({pages:[{view:[0,0,350,480],rotation:0,
   textItems:0,imagePaints:0,annotations:0,links:0}]});
 const session=createInputSession(bytes=>inspectPDFInput(bytes,{PDF,readPages}));
 await session.replace(safe);
 for(const kind of cases){
  const rejected=await markedPDF(kind);
  await assert.rejects(session.replace(rejected),e=>e.code==='signed-pdf',kind);
  assert.deepEqual(session.sourceBytes(),safe,kind);
  assert.equal(session.report.pageCount,1);
 }
});
