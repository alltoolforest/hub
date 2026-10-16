import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {randomFillSync} from 'node:crypto';
import {inflateStreamBounded,losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
const bytes=s=>new TextEncoder().encode(s);
const N=PDF.PDFName.of;
const encoded=s=>new Uint8Array(deflateSync(s));
const checksumless=s=>encoded(s).subarray(0,encoded(s).length-4);

test('strictly recover only complete raw DEFLATE with absent four-byte Adler checksum',async()=>{
 const samples=[bytes('A synthetic PDF Flate stream '.repeat(200)),
   randomFillSync(new Uint8Array(300000))];
 for(const source of samples){
  const wrapped=encoded(source),missing=wrapped.subarray(0,wrapped.length-4);
  const snapshot=missing.slice();
  assert.deepEqual(await inflateStreamBounded(missing,source.length),source);
  assert.deepEqual(missing,snapshot,'raw source stream is immutable');
  assert.deepEqual(await inflateStreamBounded(wrapped,source.length),source);
  await assert.rejects(inflateStreamBounded(missing,source.length-1),
    e=>e.code==='decoded-stream-limit');
 }
});
test('reject true compressed-data truncation, incomplete/incorrect checksums and invalid zlib headers',async()=>{
 const source=bytes('Durable integrity cannot skip compressed data. '.repeat(300));
 const wrapped=encoded(source),missing=wrapped.subarray(0,wrapped.length-4);
 for(const bad of [
   wrapped.subarray(0,wrapped.length-5),
   wrapped.subarray(0,wrapped.length-6),
   wrapped.subarray(0,wrapped.length-7),
   wrapped.subarray(0,wrapped.length-8),
   wrapped.subarray(0,wrapped.length-9),
   new Uint8Array([...missing,0]),
   new Uint8Array([...missing,0,0]),
   new Uint8Array([...missing,0,0,0]),
   (()=>{const b=wrapped.slice();b[b.length-1]^=1;return b;})(),
   (()=>{const b=missing.slice();b[0]^=1;return b;})(),
   (()=>{const b=missing.slice();b[1]^=32;return b;})()
 ])await assert.rejects(inflateStreamBounded(bad,source.length));
});
test('standalone synthetic PDF with checksumless auxiliary Flate stream still passes read-only inspection and fingerprint',async()=>{
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const page=doc.addPage([300,300]);
 page.drawText('Unmodified selectable test text',{x:20,y:200});
 const data=bytes('Test-only embedded auxiliary stream. '.repeat(100));
 const incomplete=checksumless(data);
 doc.context.register(doc.context.stream(incomplete,{Filter:'FlateDecode'}));
 const source=new Uint8Array(await doc.save({useObjectStreams:false}));
 const sourceCopy=source.slice();
 const report=await inspectPDFInput(source,{PDF,readPages:async()=>({
   pages:[{view:[0,0,300,300],rotation:0,textItems:1,imagePaints:0,annotations:0,links:0}]
 })});
 assert.equal(report.valid,true);
 assert.equal(report.pageCount,1);
 assert.equal(report.hasTextLayer,true);
 const digest=await losslessFingerprint(source,{PDF});
 assert.match(digest,/^[a-f\d]{64}$/);
 assert.deepEqual(source,sourceCopy);
});
