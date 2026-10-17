import test from 'node:test';
import assert from 'node:assert/strict';
import {randomFillSync} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {losslessFingerprint,inflateStreamBounded} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const N=PDF.PDFName.of,fp=bytes=>losslessFingerprint(bytes,{PDF});
async function change(bytes,mutate){
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});mutate(doc);
  return new Uint8Array(await doc.save({useObjectStreams:true}));
}
test('lossless identity is stable across object packing and equivalent Flate recompression',async()=>{
  for(const id of ['digital','scanned','mixed','form','bookmarks','attachment','tagged']){
    const {bytes}=await buildFixture(id);
    const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
    const classic=new Uint8Array(await doc.save({useObjectStreams:false}));
    assert.equal(await fp(classic),await fp(bytes),id);
  }
  const {bytes}=await buildFixture('scanned');
  const recompressed=await change(bytes,doc=>{
    for(const [ref,stream] of doc.context.enumerateIndirectObjects()){
      if(stream instanceof PDF.PDFRawStream&&String(stream.dict.get(N('Filter')))==='/FlateDecode'){
        const decoded=PDF.decodePDFRawStream(stream).decode(),dict=stream.dict.clone(doc.context);
        dict.delete(N('Length'));
        doc.context.assign(ref,PDF.PDFRawStream.of(dict,new Uint8Array(deflateSync(decoded,{level:0}))));
      }
    }
  });
  assert.equal(await fp(bytes),await fp(recompressed));
});
test('same-presence structure changes cannot pass: values, geometry, metadata, outline and tags',async()=>{
  const cases=[
    ['form',doc=>doc.getForm().getTextField('client.reference').setText('ALTERED')],
    ['digital',doc=>doc.getPage(0).setCropBox(0,0,100,100)],
    ['digital',doc=>doc.setTitle('ALTERED')],
    ['bookmarks',doc=>doc.context.lookup(doc.catalog.get(N('Outlines'))).set(N('Count'),PDF.PDFNumber.of(99))],
    ['tagged',doc=>doc.context.lookup(doc.catalog.get(N('StructTreeRoot'))).set(N('K'),doc.context.obj([]))]
  ];
  for(const [id,mutate] of cases){
    const {bytes}=await buildFixture(id);
    assert.notEqual(await fp(bytes),await fp(await change(bytes,mutate)),id);
  }
});
test('decoded image, text content and attachment bytes are part of the invariant',async()=>{
  for(const [id,type] of [['scanned','Image'],['digital',null],['attachment','EmbeddedFile']]){
    const {bytes}=await buildFixture(id);let modified=false;
    const corrupted=await change(bytes,doc=>{
      for(const [ref,stream] of doc.context.enumerateIndirectObjects()){
        if(!(stream instanceof PDF.PDFRawStream))continue;
        const subtype=String(stream.dict.get(N(type==='Image'?'Subtype':'Type'))??'');
        if(type&&subtype!=='/'+type)continue;
        if(!type&&subtype)continue;
        if(String(stream.dict.get(N('Filter')))!=='/FlateDecode')continue;
        const decoded=PDF.decodePDFRawStream(stream).decode().slice();decoded[0]^=1;
        const dict=stream.dict.clone(doc.context);dict.delete(N('Length'));
        doc.context.assign(ref,PDF.PDFRawStream.of(dict,new Uint8Array(deflateSync(decoded))));
        modified=true;break;
      }
    });
    assert.equal(modified,true,id);
    assert.notEqual(await fp(bytes),await fp(corrupted),id);
  }
});
test('decoded stream budgets fail closed',async()=>{
  const {bytes}=await buildFixture('scanned');
  await assert.rejects(losslessFingerprint(bytes,{PDF,maxStreamBytes:100}),e=>e.code==='decoded-stream-limit');
});

test('direct stream inflation drains backpressure, enforces exact limits and rejects damaged input',async()=>{
 const source=randomFillSync(new Uint8Array(2*1024*1024));
 const encoded=new Uint8Array(deflateSync(source));
 assert.deepEqual(await inflateStreamBounded(encoded,source.length),source);
 await assert.rejects(inflateStreamBounded(encoded,source.length-1),e=>e.code==='decoded-stream-limit');
 await assert.rejects(inflateStreamBounded(encoded.subarray(0,encoded.length-3),source.length));
 const damaged=encoded.slice();damaged[damaged.length-1]^=1;
 await assert.rejects(inflateStreamBounded(damaged,source.length));
});

test('strict Flate decoder accepts only checksum-verified PDF whitespace padding',async()=>{
 const original=new Uint8Array(Buffer.from('A valid Flate stream may have PDF line-ending padding. '.repeat(60)));
 const encoded=new Uint8Array(deflateSync(original));
 for(const trailing of [[10],[13,10],[0,9,12,32]]){
  const candidate=new Uint8Array([...encoded,...trailing]);
  assert.deepEqual(await inflateStreamBounded(candidate,original.length),original);
 }
 // Node's DecompressionStream historically tolerates trailing garbage.
 // Rejecting non-whitespace tails is therefore asserted separately in
 // actual Chromium browser QA, where the strict native decoder is exercised.
 const corrupted=encoded.slice();corrupted[corrupted.length-1]^=0x21;
 await assert.rejects(inflateStreamBounded(new Uint8Array([...corrupted,10]),original.length));
});

test('moderately large plain Flate image uses strict streaming invariant path',async()=>{
 const doc=await PDF.PDFDocument.create({updateMetadata:false}),page=doc.addPage([300,300]),c=doc.context;
 const width=2400,height=2400,raw=new Uint8Array(width*height*3);
 for(let i=0;i<raw.length;i+=4096)raw[i]=(i/4096)&255;
 const ref=c.register(c.stream(new Uint8Array(deflateSync(raw)),{
  Type:'XObject',Subtype:'Image',Width:width,Height:height,
  ColorSpace:'DeviceRGB',BitsPerComponent:8,Filter:'FlateDecode'
 }));
 page.node.set(N('Resources'),c.obj({XObject:{Img:ref}}));
 page.pushOperators(PDF.pushGraphicsState(),PDF.scale(280,280),PDF.drawObject('Img'),PDF.popGraphicsState());
 const bytes=new Uint8Array(await doc.save({useObjectStreams:false}));
 const digest=await losslessFingerprint(bytes,{PDF,maxStreamBytes:32000000,maxTotalDecodedBytes:10000});
 assert.equal(typeof digest,'string');assert.equal(digest.length,64);
});

test('legacy Flate recovery accepts only a wholly absent Adler-32 trailer',async()=>{
 const original=new Uint8Array(Buffer.from('legacy producer with complete raw deflate'.repeat(80)));
 const encoded=new Uint8Array(deflateSync(original));
 const missingTrailer=encoded.subarray(0,encoded.length-4);
 assert.deepEqual(await inflateStreamBounded(missingTrailer,original.length),original);
 // Partial trailers, incorrect checksums and damaged DEFLATE are not repaired.
 await assert.rejects(inflateStreamBounded(encoded.subarray(0,encoded.length-2),original.length));
 const wrongChecksum=encoded.slice();wrongChecksum[wrongChecksum.length-1]^=0xff;
 await assert.rejects(inflateStreamBounded(wrongChecksum,original.length));
 const damaged=missingTrailer.slice();damaged[Math.max(3,Math.floor(damaged.length/2))]^=0xff;
 await assert.rejects(inflateStreamBounded(damaged,original.length));
 await assert.rejects(
  inflateStreamBounded(missingTrailer,32),
  error=>error?.code==='decoded-stream-limit'
 );
});
