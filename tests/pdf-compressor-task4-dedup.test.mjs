import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {deduplicateOpaqueImages} from '../assets/js/pdf-compressor-v2/lossless-image-dedup.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const N=PDF.PDFName.of;
async function duplicated(extra){
  const {bytes}=await buildFixture('scanned');
  const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
  const images=doc.context.enumerateIndirectObjects().filter(([,v])=>
    v instanceof PDF.PDFRawStream&&String(v.dict.get(N('Subtype')))==='/Image');
  const first=images[0][1];
  if(extra)for(const [,image] of images)image.dict.set(N(extra),PDF.PDFNumber.of(0));
  doc.context.assign(images[1][0],PDF.PDFRawStream.of(first.dict.clone(doc.context),first.contents.slice()));
  return new Uint8Array(await doc.save({useObjectStreams:true}));
}
test('identical opaque raster streams share one object without changing decoded content or resource names',async()=>{
  const bytes=await duplicated(),before=bytes.slice();
  const result=await deduplicateOpaqueImages(bytes,{PDF});
  assert.equal(result.deduplicated,1);assert.ok(result.bytes.length<bytes.length);
  assert.deepEqual(bytes,before);
  assert.equal(await losslessFingerprint(bytes,{PDF}),await losslessFingerprint(result.bytes,{PDF}));
  const doc=await PDF.PDFDocument.load(result.bytes,{updateMetadata:false});
  const imageCount=doc.context.enumerateIndirectObjects().filter(([,v])=>v instanceof PDF.PDFRawStream&&String(v.dict.get(N('Subtype')))==='/Image').length;
  assert.equal(imageCount,1);assert.equal(doc.getPageCount(),2);
});
test('structured and custom image dictionaries are not deduplicated',async()=>{
  for(const key of ['StructParent','SMask','DecodeParms']){
    const bytes=await duplicated(key),result=await deduplicateOpaqueImages(bytes,{PDF});
    assert.equal(result.deduplicated,0,key);assert.deepEqual(result.bytes,bytes);
  }
});
test('detached material content cannot be silently discarded',async()=>{
  const {bytes}=await buildFixture('digital'),doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
  const ref=doc.context.register(doc.context.obj({Type:'Filespec',F:PDF.PDFString.of('detached-private-data.txt')}));
  const orphan=new Uint8Array(await doc.save({useObjectStreams:true}));
  doc.context.delete(ref);
  const missing=new Uint8Array(await doc.save({useObjectStreams:true}));
  assert.notEqual(await losslessFingerprint(orphan,{PDF}),await losslessFingerprint(missing,{PDF}));
  const staged=await deduplicateOpaqueImages(orphan,{PDF,serializeClassic:true});
  assert.equal(await losslessFingerprint(orphan,{PDF}),await losslessFingerprint(staged.bytes,{PDF}));
});
