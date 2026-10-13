import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {inspectPDFInput,createInputSession,INPUT_LIMITS} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createIndependentInputReader,readPageTextContent} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
// Test-only independent parser, separately installed and pinned for this gate.
const pdfjs=await import(process.env.PDFJS_TEST_MODULE??'pdfjs-dist/legacy/build/pdf.mjs');
const options={PDF,readPages:createIndependentInputReader(pdfjs)};
const N=PDF.PDFName.of;
async function modify(id,change){
  const {bytes}=await buildFixture(id);
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
  change(doc);return new Uint8Array(await doc.save({useObjectStreams:true}));
}
const rejects=(bytes,code,extra={})=>assert.rejects(inspectPDFInput(bytes,{...options,...extra}),e=>e.code===code);
test('text extraction uses reader protocol without requiring ReadableStream async iteration',async()=>{
  let cancelled=0,released=0,index=0;
  const page={streamTextContent:()=>({getReader:()=>({
    read:async()=>index++===0?{done:false,value:{items:[{str:'verified text'}],styles:{},lang:'en'}}:{done:true},
    cancel:async()=>{cancelled++;},releaseLock:()=>{released++;}
  })})};
  const result=await readPageTextContent(page);
  assert.equal(result.items[0].str,'verified text');assert.equal(result.lang,'en');
  assert.equal(cancelled,1);assert.equal(released,1);
});

test('accurate read-only page and document classification across baseline corpus',async()=>{
  for(const [id,classification] of [['digital','digital'],['scanned','image-only'],['image-heavy','image-only'],
    ['mixed','mixed'],['form','digital'],['bookmarks','digital'],['attachment','digital'],['tagged','digital']]){
    const {bytes}=await buildFixture(id),snapshot=bytes.slice();
    const report=await inspectPDFInput(bytes,options);
    assert.equal(report.classification,classification,id);
    assert.equal(report.processingApproved,false);
    assert.ok(report.pageCount>0);
    assert.deepEqual(bytes,snapshot);
    assert.equal(Object.isFrozen(report),true);
    if(id==='form')assert.equal(report.structures.forms,true);
    if(id==='bookmarks')assert.equal(report.structures.bookmarks,true);
    if(id==='attachment')assert.equal(report.structures.attachments,true);
    if(id==='tagged')assert.equal(report.structures.tags,true);
    if(id==='mixed')assert.equal(report.possibleOCR,true);
  }
});
test('annotations, links, crop and rotated page geometry are inspected independently',async()=>{
  const bytes=await modify('digital',doc=>{
    const page=doc.getPage(0),c=doc.context;
    page.setCropBox(10,20,200,300);page.setRotation(PDF.degrees(90));
    page.node.set(N('Annots'),c.obj([c.register(c.obj({Type:'Annot',Subtype:'Link',
      Rect:[20,30,80,70],A:{Type:'Action',S:'URI',URI:PDF.PDFString.of('https://example.com/')}}))]));
  });
  const r=await inspectPDFInput(bytes,options);
  assert.equal(r.structures.annotations,true);assert.equal(r.structures.links,true);
  assert.equal(r.geometry[0].rotation,90);
  assert.deepEqual(r.pages[0].view,[10,20,210,320]);
});
test('signature dictionaries and signature fields are caught without catalog Perms',async()=>{
  for(const marker of [{Type:'Sig',ByteRange:[0,1,2,3]}, {FT:'Sig',T:PDF.PDFString.of('signature')}]){
    const bytes=await modify('digital',doc=>{doc.context.register(doc.context.obj(marker));});
    await rejects(bytes,'signed-pdf');
  }
  await rejects((await buildFixture('signed-marker')).bytes,'signed-pdf');
});
test('malformed/incomplete PDFs and missing references fail before compression',async()=>{
  await rejects((await buildFixture('invalid')).bytes,'incomplete-pdf');
  const good=(await buildFixture('digital')).bytes;
  await rejects(good.subarray(0,good.length-30),'incomplete-pdf');
  const missing=await modify('digital',doc=>doc.catalog.set(N('Outlines'),PDF.PDFRef.of(999999)));
  await rejects(missing,'broken-reference');
});
test('unsafe actions, XFA and resource limits produce specific errors',async()=>{
  await rejects(await modify('digital',doc=>doc.catalog.set(N('OpenAction'),doc.context.obj({S:'JavaScript',JS:PDF.PDFString.of('alert(1)')}))),'unsupported-actions');
  await rejects(await modify('form',doc=>doc.context.lookup(doc.catalog.get(N('AcroForm'))).set(N('XFA'),PDF.PDFString.of('unverified'))),'unsupported-xfa');
  const good=(await buildFixture('digital')).bytes;
  await rejects(good,'file-limit',{limits:{...INPUT_LIMITS,maxBytes:10}});
  await rejects(good,'object-limit',{limits:{...INPUT_LIMITS,maxObjects:1}});
  await rejects(good,'page-limit',{limits:{...INPUT_LIMITS,maxPages:1}});
  await rejects(good,'structure-limit',{limits:{...INPUT_LIMITS,maxGraphEntries:2}});
  await rejects(good,'cancelled',{signal:AbortSignal.abort()});
});
test('reader disagreement fails closed',async()=>{
  const bytes=(await buildFixture('digital')).bytes;
  await rejects(bytes,'reader-disagreement',{readPages:async()=>({pages:[]})});
  await rejects(bytes,'independent-inspection-failed',{readPages:async()=>{throw Error('bad content');}});
});
test('oversized decoded image dimensions are rejected before the independent reader',async()=>{
  const bytes=await modify('scanned',doc=>{
    for(const [,object] of doc.context.enumerateIndirectObjects()){
      if(object instanceof PDF.PDFRawStream&&String(object.dict.get(N('Subtype')))==='/Image'){
        object.dict.set(N('Width'),PDF.PDFNumber.of(100000));
        object.dict.set(N('Height'),PDF.PDFNumber.of(100000));
      }
    }
  });
  let called=false;
  await rejects(bytes,'image-pixel-limit',{readPages:async()=>{called=true;throw Error('must not decode');}});
  assert.equal(called,false);
});
test('failed replacement keeps the previous valid bytes and report; exposed bytes are copies',async()=>{
  const session=createInputSession((bytes)=>inspectPDFInput(bytes,options));
  const bytes=(await buildFixture('digital')).bytes;
  await session.replace(bytes);const report=session.report;
  await assert.rejects(session.replace((await buildFixture('invalid')).bytes));
  assert.equal(session.report,report);assert.deepEqual(session.sourceBytes(),bytes);
  const exposed=session.sourceBytes();exposed[0]=0;
  assert.equal(session.sourceBytes()[0],bytes[0]);
  session.clear();assert.equal(session.report,null);assert.equal(session.sourceBytes(),null);
});
test('late input success cannot overwrite a later selection or restore a cleared session',async()=>{
  let finish;
  const session=createInputSession(async bytes=>{
    if(bytes[0]===1)await new Promise(resolve=>{finish=resolve;});
    return Object.freeze({id:bytes[0]});
  });
  const pending=session.replace(new Uint8Array([1]));
  await session.replace(new Uint8Array([2]));finish();
  assert.equal((await pending).status,'stale-input-discarded');assert.equal(session.report.id,2);
  const later=session.replace(new Uint8Array([1]));session.clear();finish();
  assert.equal((await later).status,'stale-input-discarded');assert.equal(session.report,null);
});
