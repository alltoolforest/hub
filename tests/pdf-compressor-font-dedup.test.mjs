import test from 'node:test';
import assert from 'node:assert/strict';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
import {deduplicateOpaqueImages} from '../assets/js/pdf-compressor-v2/lossless-image-dedup.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const N=PDF.PDFName.of;
async function fixture({custom=false,alter=false,orphan=false}={}){
 const doc=await PDF.PDFDocument.create();doc.addPage();const refs=[];
 for(let n=0;n<3;n++){
  const data=new Uint8Array(10000).fill(alter&&n===1?66:65);
  const stream=doc.context.stream(data,{Length1:data.length,...(custom?{PrivateFlag:n}:{})});
  const ref=doc.context.register(stream);refs.push(ref);
  const descriptor=doc.context.register(doc.context.obj({Type:'FontDescriptor',FontName:'Example'+n,Flags:4,FontBBox:[0,0,500,700],FontFile2:ref}));
  const font=doc.context.register(doc.context.obj({Type:'Font',Subtype:'TrueType',BaseFont:'Example'+n,FirstChar:65,LastChar:65,Widths:[500+n],FontDescriptor:descriptor}));
  if(n<2||!orphan)doc.getPages()[0].node.set(N('FontTest'+n),font);
 }
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const fp=b=>losslessFingerprint(b,{PDF});
test('byte-identical font payloads share storage while descriptors and widths remain distinct',async()=>{
 const source=await fixture(),r=await deduplicateOpaqueImages(source,{PDF,serializeClassic:true});
 assert.equal(r.deduplicated,2);assert.ok(r.bytes.length<source.length/2);assert.equal(await fp(source),await fp(r.bytes));
 const doc=await PDF.PDFDocument.load(r.bytes);const fonts=doc.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDF.PDFDict&&String(o.get(N('Type')))==='/Font');
 assert.equal(fonts.length,3);assert.deepEqual(fonts.map(([,o])=>o.lookup(N('Widths'),PDF.PDFArray).get(0).asNumber()),[500,501,502]);
});
test('different font bytes or custom dictionaries are not conflated',async()=>{
 for(const options of [{alter:true},{custom:true}]){
  const source=await fixture(options),r=await deduplicateOpaqueImages(source,{PDF,serializeClassic:true});
  assert.equal(r.deduplicated,options.alter?1:0);assert.equal(await fp(source),await fp(r.bytes));
 }
});
test('detached font material remains present and protected',async()=>{
 const source=await fixture({orphan:true}),r=await deduplicateOpaqueImages(source,{PDF,serializeClassic:true});
 assert.equal(r.deduplicated,1);assert.equal(await fp(source),await fp(r.bytes));
 const doc=await PDF.PDFDocument.load(r.bytes);const streams=doc.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDF.PDFRawStream);assert.equal(streams.length,2);
 doc.context.delete(streams[1][0]);const corrupt=await doc.save({useObjectStreams:false});
 await assert.rejects(fp(corrupt));
});
test('font bytes and font dictionary mutations remain fingerprint failures',async()=>{
 const source=await fixture(),r=await deduplicateOpaqueImages(source,{PDF,serializeClassic:true});
 for(const kind of ['program','width']){
  const doc=await PDF.PDFDocument.load(r.bytes);
  if(kind==='program'){const [,s]=doc.context.enumerateIndirectObjects().find(([,o])=>o instanceof PDF.PDFRawStream);s.contents[0]^=1;}
  else{const [,f]=doc.context.enumerateIndirectObjects().find(([,o])=>o instanceof PDF.PDFDict&&String(o.get(N('Type')))==='/Font');f.set(N('Widths'),doc.context.obj([999]));}
  assert.notEqual(await fp(source),await fp(new Uint8Array(await doc.save({useObjectStreams:false}))));
 }
});

test('decoded-byte accounting still includes separate identical programs on cache hits',async()=>{
 const source=await fixture();
 await assert.rejects(losslessFingerprint(source,{PDF,maxTotalDecodedBytes:20000}),e=>e.code==='invariant-byte-budget');
});
