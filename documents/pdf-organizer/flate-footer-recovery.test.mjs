import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {assertExpandedStreamBudget,buildCandidate} from './engine.js';
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const N=P.PDFName.of;
const commands=Buffer.from('q\n0.15 0.55 0.25 rg\n72 300 320 180 re f\nQ\n');
async function sourceWithCompressedPage(transform=(b)=>b,{pageCount=2}={}){
 const d=await P.PDFDocument.create({updateMetadata:false});
 for(let i=0;i<pageCount;i++)d.addPage([595,842]);
 const original=deflateSync(commands,{level:6});
 const encoded=Uint8Array.from(transform(Buffer.from(original)));
 const stream=d.context.register(d.context.stream(encoded,{Filter:'FlateDecode'}));
 d.getPage(0).node.set(N('Contents'),stream);
 return {id:1,bytes:await d.save({useObjectStreams:false}),encoded,original};
}
const entries=(n)=>Array.from({length:n},(_,i)=>({src:1,page:i,rot:0,blank:false}));

test('normal PDF Flate zlib stream passes unchanged',async()=>{
 const src=await sourceWithCompressedPage();
 const doc=await P.PDFDocument.load(src.bytes);
 const scan=await assertExpandedStreamBudget(doc,P);
 assert.equal(scan.recoveredStreams,0);
 const out=await buildCandidate([src],entries(2),P);
 assert.equal((await P.PDFDocument.load(out)).getPageCount(),2);
});

for(const absentFooterBytes of [1,2,3,4]){
 test('recover complete DEFLATE payload missing '+absentFooterBytes+' Adler checksum bytes',{timeout:20000},async()=>{
  const src=await sourceWithCompressedPage(b=>b.subarray(0,-absentFooterBytes));
  const doc=await P.PDFDocument.load(src.bytes);
  const scan=await assertExpandedStreamBudget(doc,P);
  assert.equal(scan.recoveredStreams,1);
  const exported=await buildCandidate([src],entries(2),P);
  const outDoc=await P.PDFDocument.load(exported,{updateMetadata:false,throwOnInvalidObject:true});
  assert.equal(outDoc.getPageCount(),2);
  const stream=outDoc.context.lookup(outDoc.getPage(0).node.get(N('Contents')));
  assert.deepEqual(Buffer.from(stream.getContents()),Buffer.from(src.encoded),'original compressed bytes must survive');
  console.log(JSON.stringify({audit:'recover-incomplete-flate-footer',missing:absentFooterBytes,outputBytes:exported.byteLength}));
 });
}

test('reject zlib checksum mismatch even when raw DEFLATE is readable',async()=>{
 const src=await sourceWithCompressedPage(b=>{b[b.length-1]^=0xff;return b;});
 const doc=await P.PDFDocument.load(src.bytes);
 await assert.rejects(assertExpandedStreamBudget(doc,P),/checksum is invalid/i);
 await assert.rejects(buildCandidate([src],entries(2),P),/checksum is invalid/i);
});

test('reject actual truncated DEFLATE body (not just missing checksum)',async()=>{
 const src=await sourceWithCompressedPage(b=>b.subarray(0,-6));
 const doc=await P.PDFDocument.load(src.bytes);
 await assert.rejects(assertExpandedStreamBudget(doc,P),/damaged compressed stream|zlib header/i);
 await assert.rejects(buildCandidate([src],entries(2),P),/damaged compressed stream|zlib header/i);
});

test('reject high-expansion compression bomb even with incomplete checksum',async()=>{
 const huge=Buffer.from('q\nQ\n'.repeat(40*1024*1024/4));
 const src=await sourceWithCompressedPage(()=>deflateSync(huge,{level:9}).subarray(0,-3));
 const doc=await P.PDFDocument.load(src.bytes);
 await assert.rejects(assertExpandedStreamBudget(doc,P),/budget exceeded|unsafe compression ratio/i);
 await assert.rejects(buildCandidate([src],entries(2),P),/budget exceeded|unsafe compression ratio/i);
});

test('source footer recovery does not allow oversized single stream',async()=>{
 const oversized=Buffer.alloc(2*1024*1024,65);
 const src=await sourceWithCompressedPage(()=>deflateSync(oversized).subarray(0,-2));
 const doc=await P.PDFDocument.load(src.bytes);
 await assert.rejects(assertExpandedStreamBudget(doc,P,{perStreamLimit:1024*1024}),/budget exceeded/i);
});
