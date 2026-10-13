import test from 'node:test';
import assert from 'node:assert/strict';
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
 const source=new Uint8Array(2*1024*1024);for(let i=0;i<source.length;i++)source[i]=(i*37)%251;
 const encoded=new Uint8Array(deflateSync(source));
 assert.deepEqual(await inflateStreamBounded(encoded,source.length),source);
 await assert.rejects(inflateStreamBounded(encoded,source.length-1),e=>e.code==='decoded-stream-limit');
 await assert.rejects(inflateStreamBounded(encoded.subarray(0,encoded.length-3),source.length));
 const damaged=encoded.slice();damaged[damaged.length-1]^=1;
 await assert.rejects(inflateStreamBounded(damaged,source.length));
});
