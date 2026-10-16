import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {inflateStreamBounded} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';

// Synthetic only: never store real medical PDF bytes in source or CI.
const text=s=>new TextEncoder().encode(s);
const source=text('q\nBT /F1 12 Tf (PDFsharp style incomplete Adler) Tj ET\nQ\n');
const complete=new Uint8Array(deflateSync(source,{level:9}));
const noAdler=complete.subarray(0,complete.length-4);

test('PDFsharp-style complete DEFLATE body with only missing Adler32 is accepted after strict reconstruction',async()=>{
 assert.deepEqual(await inflateStreamBounded(complete,1000),source);
 assert.deepEqual(await inflateStreamBounded(noAdler,1000),source);
 assert.deepEqual(noAdler,complete.subarray(0,-4),'the caller does not mutate the original stream');
});
test('the complete stream must be independently revalidated, not just read until failure',async()=>{
 const corrupted=complete.slice();corrupted[corrupted.length-1]^=1;
 await assert.rejects(inflateStreamBounded(corrupted,1000));
 const cutBody=complete.subarray(0,complete.length-6);
 await assert.rejects(inflateStreamBounded(cutBody,1000));
 const wrongHeader=complete.subarray(0,complete.length-4).slice();
 wrongHeader[0]^=1;
 await assert.rejects(inflateStreamBounded(wrongHeader,1000));
 await assert.rejects(inflateStreamBounded(noAdler,source.length-1),
   error=>error.code==='decoded-stream-limit');
});
test('realistic PDF body with checksum-only missing Flate trailer passes input inspection, without source mutation',async()=>{
 const fixture=(await buildFixture('digital')).bytes;
 const doc=await PDF.PDFDocument.load(fixture,{updateMetadata:false});
 // Detached stream is intentionally part of complete-object inventory.
 const added=doc.context.register(doc.context.stream(noAdler,{Filter:'FlateDecode'}));
 assert.ok(added);
 const bytes=new Uint8Array(await doc.save({useObjectStreams:false})),copy=bytes.slice();
 const pages=async()=>({pages:doc.getPages().map(page=>({
   view: [0,0,page.getWidth(),page.getHeight()],rotation:0,
   textItems:1,imagePaints:0,annotations:0,links:0
 }))});
 const report=await inspectPDFInput(bytes,{PDF,readPages:pages});
 assert.equal(report.valid,true);
 assert.deepEqual(bytes,copy,'compatibility decoding must not rewrite source bytes');
});
