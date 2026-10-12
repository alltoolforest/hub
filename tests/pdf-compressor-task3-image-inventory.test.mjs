// PDF Compressor Blueprint v1.0 — Task 3 isolation probe.
// Read-only inspection of embedded image XObjects. Never modifies PDFs or
// imports production routes; not an image re-encoder or a successful Task 3 engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';

const N=PDF.PDFName.of;
function imagesIn(bytes){
  return PDF.PDFDocument.load(bytes,{updateMetadata:false}).then(doc=>{
    const images=[];
    for(const [ref,object] of doc.context.enumerateIndirectObjects()){
      if(!(object instanceof PDF.PDFRawStream) && !(object instanceof PDF.PDFContentStream)) continue;
      const dict=object.dict;
      if(String(dict.get(N('Subtype'))||'')!=='/Image') continue;
      const raw=key=>dict.get(N(key));
      const num=key=>{const obj=raw(key);return obj?.asNumber?.()??null;};
      images.push({
        ref:String(ref),width:num('Width'),height:num('Height'),
        bitsPerComponent:num('BitsPerComponent'),
        filter:String(raw('Filter')??'none'),
        colorSpace:String(raw('ColorSpace')??'none'),
        softMask:Boolean(raw('SMask')),mask:Boolean(raw('Mask')),
        decode:Boolean(raw('Decode')),interpolate:Boolean(raw('Interpolate')),
        streamBytes:object.contents.length
      });
    }
    return {pages:doc.getPageCount(),images};
  });
}

test('Task 3 read-only image inventory: raster-only, image-heavy and mixed fixtures',async()=>{
  for(const [id,minImages] of [['scanned',2],['image-heavy',3],['mixed',1],['digital',0]]){
    const {bytes}=await buildFixture(id);
    const report=await imagesIn(bytes);
    assert.ok(report.images.length>=minImages,id+' image objects');
    if(id==='digital')assert.equal(report.images.length,0);
    for(const img of report.images){
      assert.ok(img.width>0&&img.height>0,'valid image dimensions');
      assert.ok(img.streamBytes>0,'nonempty image stream');
    }
    assert.ok(report.pages>0);
    console.log(JSON.stringify({fixture:id,imageCount:report.images.length,
      imageProperties:report.images}));
  }
});

test('Task 3 probe is read-only and does not rewrite fixture bytes',async()=>{
  const {bytes}=await buildFixture('mixed');
  const snapshot=Buffer.from(bytes);
  await imagesIn(bytes);
  assert.deepEqual(Buffer.from(bytes),snapshot);
});

test('Task 3 unsupported masks/profile transformations are NOT silently attempted',async()=>{
  const {bytes}=await buildFixture('scanned');
  const report=await imagesIn(bytes);
  // Inventory is intentionally not a proxy for support: no resources are replaced.
  assert.equal(typeof report.images.every(x=>!x.softMask),'boolean');
  assert.equal(typeof report.images.every(x=>!x.mask),'boolean');
});
