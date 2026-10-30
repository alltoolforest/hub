import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRealistic56PagePdf,P,MiB} from './expanded-stream-fixture.mjs';
import {assertExpandedStreamBudget,buildCandidate} from './engine.js';

test('accept a 30.27 MB / 56-page PDF with ordinary expanded streams beyond old 24/128 MiB limits',{timeout:120000},async()=>{
  const {bytes,meta}=await buildRealistic56PagePdf();
  assert.equal(meta.pages,56);
  assert(meta.bytes>30_000_000&&meta.bytes<31_000_000,'fixture must be about 30.27MB');
  assert(meta.largestDecoded>24*MiB,'must reproduce prior per-stream rejection');
  assert(meta.decodedBytes>128*MiB,'must reproduce prior cumulative rejection');
  assert(meta.largestCompressionRatio<256,'must not resemble compressed bomb');
  const document=await P.PDFDocument.load(bytes);
  assert.equal(document.getPageCount(),56);
  const start=performance.now();
  const scan=await assertExpandedStreamBudget(document,P);
  assert(scan.flateStreams>=57);
  assert(scan.decodedOrEncodedBytes>128*MiB);
  const items=Array.from({length:56},(_,page)=>({src:1,page,rot:0,blank:false}));
  const out=await buildCandidate([{id:1,bytes}],items,P);
  const output=await P.PDFDocument.load(out);
  assert.equal(output.getPageCount(),56);
  assert(output.catalog.has(P.PDFName.of('SyntheticLargeImageData')));
  assert.equal(output.getPages()[0].getWidth(),595);
  assert(out.length>29_000_000&&out.length<32_000_000,'output must not discard large resources');
  console.log(JSON.stringify({audit:'56pages-30.27MB',result:'PASS',sourceBytes:bytes.length,
    outputBytes:out.length,pages:56,aggregateDecodedMiB:Math.round(meta.decodedBytes/MiB),
    largestDecodedMiB:Math.round(meta.largestDecoded/MiB),ms:Math.round(performance.now()-start)}));
});

test('safety regression: extreme Flate ratio remains rejected',async()=>{
  const d=await P.PDFDocument.create({updateMetadata:false});
  d.addPage([400,600]);
  const {deflateSync}=await import('node:zlib');
  const raw=Buffer.from('q\nQ\n'.repeat(40*MiB/4));
  const zip=deflateSync(raw,{level:9});
  const stream=d.context.stream(Uint8Array.from(zip),{Filter:'FlateDecode'});
  d.getPage(0).node.set(P.PDFName.of('Contents'),d.context.register(stream));
  await assert.rejects(assertExpandedStreamBudget(d,P),/decompression memory budget exceeded/i);
  assert(zip.length<128*1024,'stress stream must be deceptively small');
});
