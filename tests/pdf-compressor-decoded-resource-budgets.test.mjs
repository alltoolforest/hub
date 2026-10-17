import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import {inspectPDFInput,INPUT_LIMITS} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
async function streamDocument(data,dict={}){
 const doc=await PDF.PDFDocument.create();doc.addPage();
 const stream=PDF.PDFRawStream.of(doc.context.obj(dict),data);
 doc.catalog.set(PDF.PDFName.of('Resource'),doc.context.register(stream));
 return {doc,stream,bytes:await doc.save({useObjectStreams:false})};
}
test('Flate expansion is rejected before independent decoding',async()=>{
 const {bytes}=await streamDocument(new Uint8Array(deflateSync(new Uint8Array(33000000))),{Filter:'FlateDecode'});
 let called=false;await assert.rejects(inspectPDFInput(bytes,{PDF,readPages:async()=>{called=true;}}),e=>e.code==='decoded-stream-limit');assert.equal(called,false);
});
test('private decoder rejects oversized allocation',async()=>{
 const {stream}=await streamDocument(new Uint8Array(deflateSync(new Uint8Array(34000000))),{Filter:'FlateDecode'});
 assert.throws(()=>PDF.decodePDFRawStream(stream).decode(),/compressor-decoded-stream-limit/);
});
test('scalar limits apply before inspection and fingerprint materialization',async()=>{
 const doc=await PDF.PDFDocument.create();doc.addPage();doc.setTitle('x'.repeat(1000001));
 const bytes=await doc.save({useObjectStreams:false});let called=false;
 await assert.rejects(inspectPDFInput(bytes,{PDF,readPages:async()=>{called=true;}}),e=>e.code==='scalar-resource-limit');assert.equal(called,false);
 await assert.rejects(losslessFingerprint(bytes,{PDF}),e=>e.code==='scalar-resource-limit');
});
test('predictor row size is bounded before independent decoding',async()=>{
 const {bytes}=await streamDocument(new Uint8Array(deflateSync(new Uint8Array(1))),{Filter:'FlateDecode',DecodeParms:{Predictor:12,Columns:100000000,Colors:3,BitsPerComponent:8}});
 let called=false;await assert.rejects(inspectPDFInput(bytes,{PDF,readPages:async()=>{called=true;}}),e=>e.code==='decoded-stream-limit');assert.equal(called,false);
});
test('object stream count and parsed-context expansion are bounded',async()=>{
 const {doc,stream}=await streamDocument(new Uint8Array([48]),{Type:'ObjStm',N:50001,First:0});
 assert.throws(()=>new PDF.PDFObjectStreamParser(stream),/compressor-object-stream-limit/);
 stream.dict.set(PDF.PDFName.of('N'),PDF.PDFNumber.of(0));
 doc.context.compressorDecodedBytes=128000000;
 assert.throws(()=>new PDF.PDFObjectStreamParser(stream),/compressor-decoded-stream-limit/);
});
test('parsed stream mutation cannot mutate source bytes',async()=>{
 const {bytes}=await streamDocument(new Uint8Array([1,2,3,4]));const original=bytes.slice();
 const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
 for(const [,value] of doc.context.enumerateIndirectObjects())if(value instanceof PDF.PDFRawStream)value.contents.fill(99);
 assert.deepEqual(bytes,original);
});
test('100 MB standard envelope has separate bounded resource budgets',()=>{
 assert.equal(INPUT_LIMITS.maxBytes,100000000);assert.equal(INPUT_LIMITS.maxOperators,2000000);
 assert.equal(INPUT_LIMITS.maxDecodedStreamBytes,32000000);assert.equal(INPUT_LIMITS.maxTotalDecodedBytes,512000000);
});
