import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {buildCandidate,assertResourceAdmission,inspectSecurity} from './engine.js';

// Organizer-only memory/complex integrity regression fixtures; no user PDFs,
// no app-wide changes. All PDF content is deliberately synthetic.
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const item=(page,extra={})=>({src:1,page,rot:0,blank:false,...extra});
async function document(n=3,edit=()=>{}) {
 const doc=await P.PDFDocument.create({updateMetadata:false});
 for(let i=0;i<n;i++)doc.addPage([400+i%3*19,600+i%3*13]).drawText('SAFE_DOC_PAGE_'+i);
 await edit(doc);
 return {id:1,bytes:await doc.save({useObjectStreams:false})};
}
function flateContent(doc,expandedMiB){
 // Valid compressed PDF page drawing commands; a 40 MiB decoded-content
 // stream fits in a few kilobytes of input and can exhaust browser workers.
 const raw=Buffer.from('q\nQ\n'.repeat(expandedMiB*1024*1024/4));
 const compressed=deflateSync(raw,{level:9});
 const stream=doc.context.stream(Uint8Array.from(compressed),{Filter:'FlateDecode'});
 doc.getPage(0).node.set(P.PDFName.of('Contents'),doc.context.register(stream));
 return {encoded:compressed.length,decoded:raw.length};
}

test('compression control: 2 MiB decoded stream passes bounded admission and export',async()=>{
 let sz;const src=await document(1,d=>{sz=flateContent(d,2);});
 assert(sz.encoded<20*1024);
 const out=await buildCandidate([src],[item(0)],P);
 assert.equal((await P.PDFDocument.load(out)).getPageCount(),1);
});

test('P0: 40 MiB Flate content bomb rejected before PDF.js render/export',async()=>{
 let sz;const src=await document(1,d=>{sz=flateContent(d,40);});
 assert(sz.encoded<128*1024);
 await assert.rejects(buildCandidate([src],[item(0)],P),/expanded|decompress|budget|stream|resource|large/i);
});

test('resource check: opaque huge image dimensions are rejected',async()=>{
 const src=await document(1,d=>{
   const ref=d.context.register(d.context.stream(new Uint8Array([0]),{
     Type:'XObject',Subtype:'Image',Width:500000,Height:500000,
     BitsPerComponent:8,ColorSpace:'DeviceRGB'}));
   d.getPage(0).node.set(P.PDFName.of('Resources'),d.context.obj({XObject:{ImageA:ref}}));
 });
 await assert.rejects(buildCandidate([src],[item(0)],P),/image/i);
});

test('complex: interactive form survives same-source non-lossy reorder',async()=>{
 const src=await document(3,d=>{
  const field=d.getForm().createTextField('customer_code');
  field.setText('Synthetic VALUE 235');field.addToPage(d.getPage(1));
 });
 const out=await buildCandidate([src],[item(2),item(0),item(1)],P);
 const pdf=await P.PDFDocument.load(out);
 assert.equal(pdf.getPageCount(),3);
 assert.equal(pdf.getForm().getTextField('customer_code').getText(),'Synthetic VALUE 235');
});

test('complex: a form cannot silently lose its widgets through copy/duplicate',async()=>{
 const src=await document(2,d=>{
   const f=d.getForm().createTextField('keep');
   f.setText('must-not-disappear');f.addToPage(d.getPage(1));
 });
 await assert.rejects(buildCandidate([src],[item(0),item(1),item(1)],P),/structure|cannot|unsupported/i);
});

test('complex: bookmark, annotations and unsafe metadata copying fails closed',async()=>{
 const src=await document(3,d=>{
   d.catalog.set(P.PDFName.of('Outlines'),d.context.obj({Type:'Outlines',Count:0}));
 });
 await assert.rejects(buildCandidate([src],[item(0),item(0)],P),/structure|cannot|unsupported/i);
});

test('complex: document-level attachments forbid page deletion',async()=>{
 const src=await document(2,d=>{
   d.catalog.set(P.PDFName.of('AF'),d.context.obj([]));
 });
 await assert.rejects(buildCandidate([src],[item(0)],P),/attachment/i);
 const out=await buildCandidate([src],[item(1),item(0)],P);
 assert.equal((await P.PDFDocument.load(out)).getPageCount(),2);
});

test('complex: custom page labels forbid reordering, not no-op export',async()=>{
 const src=await document(3,d=>{
   d.catalog.set(P.PDFName.of('PageLabels'),d.context.obj({Nums:[0,{S:'D'}]}));
 });
 await assert.rejects(buildCandidate([src],[item(1),item(0),item(2)],P),/page labels/i);
 const out=await buildCandidate([src],[item(0),item(1),item(2)],P);
 assert.equal((await P.PDFDocument.load(out)).getPageCount(),3);
});

test('complex: preserve page sizes, rotations and original source bytes',async()=>{
 const src=await document(8,d=>{
   d.getPage(4).setRotation(P.degrees(90));
   d.getPage(6).setCropBox(13,21,330,490);
 });
 const original=Buffer.from(src.bytes);
 const order=[7,4,0,3,6,1,2,5].map(page=>item(page));
 const out=await buildCandidate([src],order,P);
 const pdf=await P.PDFDocument.load(out);
 assert.deepEqual(pdf.getPages().map(p=>p.getWidth()),order.map(it=>400+it.page%3*19));
 assert.equal(pdf.getPage(1).getRotation().angle,90);
 assert.deepEqual(Buffer.from(src.bytes),original);
});

test('stress: 480-page text report reverse-export remains responsive and coherent',async()=>{
 const src=await document(480);
 const items=Array.from({length:480},(_,i)=>item(479-i));
 const start=performance.now();
 const out=await buildCandidate([src],items,P);
 const pdf=await P.PDFDocument.load(out);
 assert.equal(pdf.getPageCount(),480);
 assert.equal(pdf.getPage(0).getWidth(),400+479%3*19);
 console.log(JSON.stringify({audit:'480-page-reverse',inputBytes:src.bytes.length,outputBytes:out.length,ms:Math.round(performance.now()-start)}));
});

test('stress: oversized source decompression cannot evade guard by being embedded in image XObject',async()=>{
 const src=await document(1,d=>{
   const raw=Buffer.alloc(40*1024*1024,65);
   const compressed=deflateSync(raw,{level:9});
   const image=d.context.register(d.context.stream(Uint8Array.from(compressed),{
     Type:'XObject',Subtype:'Image',Filter:'FlateDecode',Width:1024,Height:1024,
     BitsPerComponent:8,ColorSpace:'DeviceGray'}));
   d.getPage(0).node.set(P.PDFName.of('Resources'),d.context.obj({XObject:{Stress: image}}));
 });
 await assert.rejects(buildCandidate([src],[item(0)],P),/expanded|decompress|budget|stream|resource|large/i);
});
