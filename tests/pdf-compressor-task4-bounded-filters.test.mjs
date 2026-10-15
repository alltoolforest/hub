import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLZWBounded,decodeRunLengthBounded} from '../assets/js/pdf-compressor-v2/bounded-legacy-filters.mjs';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {inspectPDFInput,INPUT_LIMITS} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
const pdfjs=await import(process.env.PDFJS_TEST_MODULE??'pdfjs-dist/legacy/build/pdf.mjs');
const reader=createIndependentInputReader(pdfjs);
const N=PDF.PDFName.of;
// Fixture-only code packer for known LZW codewords, including 9->10-bit growth.
function packCodes(codes,{earlyChange=1}={}){
 let next=258,bits=9,previous=false,acc=0,accBits=0;const result=[];
 for(const code of codes){
  acc=acc*2**bits+code;accBits+=bits;
  while(accBits>=8){
   accBits-=8;result.push(Math.floor(acc/2**accBits)&255);acc%=2**accBits;
  }
  if(code===256){next=258;bits=9;previous=false;continue;}
  if(code===257)break;
  if(previous&&next<4096){next++;if(bits<12&&next+earlyChange===(1<<bits))bits++;}
  previous=true;
 }
 if(accBits)result.push((acc*2**(8-accBits))&255);
 return new Uint8Array(result);
}
const text=input=>new TextEncoder().encode(input);
function runLengthLiteral(bytes){
 const result=[];
 for(let i=0;i<bytes.length;i+=128){
  const chunk=bytes.subarray(i,i+128);
  result.push(chunk.length-1,...chunk);
 }
 result.push(128);return new Uint8Array(result);
}
async function injected(filter,encoded){
 const {bytes}=await buildFixture('digital');
 const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
 doc.context.register(doc.context.stream(encoded,{Filter:filter}));
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
test('RunLength streams decode literal and repeated runs without allocating past budget',()=>{
 const encoded=new Uint8Array([2,65,66,67,253,90,128]);
 assert.deepEqual(decodeRunLengthBounded(encoded,100),text('ABCZZZZ'));
 assert.deepEqual(decodeRunLengthBounded(runLengthLiteral(text('A'.repeat(400))),400),text('A'.repeat(400)));
 assert.throws(()=>decodeRunLengthBounded(new Uint8Array([129,255,129,255,128]),200),
   e=>e.code==='decoded-stream-limit');
 for(const malformed of [[0],[129],[1,42,128],[0,42]]){
  assert.throws(()=>decodeRunLengthBounded(new Uint8Array(malformed),100),
    e=>e.code==='invalid-runlength-stream');
 }
 assert.throws(()=>decodeRunLengthBounded(encoded,2),e=>e.code==='decoded-stream-limit');
});
test('LZW PDF streams decode literal and KwKwK dictionary entries for either EarlyChange',()=>{
 for(const earlyChange of [0,1]){
  assert.deepEqual(decodeLZWBounded(packCodes([256,65,66,67,257],{earlyChange}),100,{earlyChange}),text('ABC'));
  // 256 clear, A, a dictionary reference to 'AA' (258), then the
  // special not-yet-added dictionary code (260) spelling 'AAA'.
  assert.deepEqual(decodeLZWBounded(packCodes([256,65,65,258,260,257],{earlyChange}),100,{earlyChange}),text('AAAAAAA'));
  assert.throws(()=>decodeLZWBounded(packCodes([256,65,65,258,260,257],{earlyChange}),6,{earlyChange}),
    e=>e.code==='decoded-stream-limit');
 }
});
test('LZW dynamic width expansion is decoded correctly without full-size allocation',()=>{
 for(const earlyChange of [0,1]){
  const symbols=Array.from({length:800},(_,i)=>65+i%23);
  const source=packCodes([256,...symbols,257],{earlyChange});
  assert.deepEqual(decodeLZWBounded(source,800,{earlyChange}),new Uint8Array(symbols));
  assert.throws(()=>decodeLZWBounded(source,799,{earlyChange}),e=>e.code==='decoded-stream-limit');
 }
});
test('LZW damaged codes, missing terminators and cancellation fail closed',()=>{
 assert.throws(()=>decodeLZWBounded(packCodes([256,260,257]),100),e=>e.code==='invalid-lzw-stream');
 assert.throws(()=>decodeLZWBounded(packCodes([256,65,66]),100),e=>e.code==='invalid-lzw-stream');
 assert.throws(()=>decodeLZWBounded(packCodes([256,65,257]),100,{earlyChange:2}),
  e=>e.code==='invalid-lzw-early-change');
 assert.throws(()=>decodeLZWBounded(packCodes([256,65,257]),100,{signal:AbortSignal.abort()}),
  e=>e.code==='cancelled');
 assert.throws(()=>decodeRunLengthBounded(new Uint8Array([128]),100,{signal:AbortSignal.abort()}),
  e=>e.code==='cancelled');
});
test('complete PDF inspection of both legacy filters preserves valid documents and bounds hostile expansion',async()=>{
 const validLZW=await injected('LZWDecode',packCodes([256,65,66,67,257]));
 const validRLE=await injected('RunLengthDecode',runLengthLiteral(text('ordinary PDF content')));
 for(const bytes of [validLZW,validRLE]){
  const report=await inspectPDFInput(bytes,{PDF,readPages:reader});
  assert.equal(report.valid,true);assert.ok(report.pageCount>0);
 }
 const bomb=await injected('RunLengthDecode',new Uint8Array([129,0,129,0,128]));
 await assert.rejects(inspectPDFInput(bomb,{PDF,readPages:reader,
   limits:{...INPUT_LIMITS,maxDecodedStreamBytes:100}}),e=>e.code==='decoded-stream-limit');
 const truncated=await injected('LZWDecode',new Uint8Array([255,255,255,255]));
 await assert.rejects(inspectPDFInput(truncated,{PDF,readPages:reader}),
   e=>e.code==='invalid-lzw-stream');
});
