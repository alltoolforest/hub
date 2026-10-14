import test from 'node:test';
import assert from 'node:assert/strict';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
// Locally generated 16x16 CMYK JPEG (no user document bytes).
const source=Buffer.from('/9j/7gAOQWRvYmUAZAAAAAAA/9sAQwACAQEBAQECAQEBAgICAgIEAwICAgIFBAQDBAYFBgYGBQYGBgcJCAYHCQcGBggLCAkKCgoKCgYICwwLCgwJCgoK/8AAFAgAEAAQBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD9SKp198V+1lFFFFFFFFFFFFf/2Q==','base64');
async function fixture({appMarker=238,transform=0,colorSpace='DeviceCMYK',
  legacyMetadata=false,conflictingAdobe=false,brokenLegacyLength=false}={}){
 let jpg=Buffer.from(source); // Buffer.slice() would alias and corrupt later fixtures.
 assert.equal(jpg[3],238);jpg[3]=appMarker;jpg[17]=transform;
 if(legacyMetadata){
  const exif=Buffer.from([255,225,0,8,69,120,105,102,0,0]);
  const photoshop=Buffer.from([255,237,0,6,56,66,73,77]);
  const adobe=Buffer.from(jpg.subarray(2,18));
  if(conflictingAdobe)adobe[15]=transform===2?0:2;
  if(brokenLegacyLength)exif[3]=255;
  jpg=Buffer.concat([jpg.subarray(0,18),exif,photoshop,adobe,jpg.subarray(18)]);
 }
 const doc=await PDF.PDFDocument.create(),page=doc.addPage([600,800]);
 const N=PDF.PDFName.of;
 const image=doc.context.register(doc.context.stream(new Uint8Array(jpg),{Type:'XObject',Subtype:'Image',
  Width:16,Height:16,BitsPerComponent:8,ColorSpace:colorSpace,Filter:'DCTDecode'}));
 page.node.set(N('Resources'),doc.context.obj({XObject:{Image:image}}));
 page.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Image'),PDF.popGraphicsState());
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const pages=async()=>({pages:[{view:[0,0,600,800],rotation:0,textItems:0,imagePaints:1,annotations:0,links:0}]});
test('valid Adobe APP14 CMYK and YCCK source headers remain inspectable',async()=>{
 for(const transform of [0,2]){
  const bytes=await fixture({transform});const r=await inspectPDFInput(bytes,{PDF,readPages:pages});
  assert.equal(r.valid,true);assert.equal(r.images.length,1);assert.equal(r.images[0].colorSpace,'/DeviceCMYK');
 }
});
test('unknown APP14 semantics or mismatched PDF image colorspace are still rejected',async()=>{
 for(const options of [{transform:9},{appMarker:239},{transform:2,colorSpace:'DeviceRGB'}]){
  await assert.rejects(inspectPDFInput(await fixture(options),{PDF,readPages:pages}),
    e=>e.code==='image-header-unverifiable');
 }
});
test('legacy YCCK with APP1 EXIF, APP13 Photoshop and repeated compatible Adobe markers is inspectable but not decoded',async()=>{
 const bytes=await fixture({transform:2,legacyMetadata:true});
 const result=await inspectPDFInput(bytes,{PDF,readPages:pages});
 assert.equal(result.valid,true);
 assert.equal(result.images.length,1);
 assert.equal(result.images[0].colorSpace,'/DeviceCMYK');
 const doc=await PDF.PDFDocument.load(bytes);
 const raw=doc.context.enumerateIndirectObjects().map(([,value])=>value)
   .find(value=>value instanceof PDF.PDFRawStream&&String(value.dict.get(PDF.PDFName.of('Subtype')))==='/Image');
 // This exception is inspection-only: never auto-transform ambiguous photos.
 const decode=createPDFJpegDecoder(class NoDecodeForUnverifiedMetadata {
   constructor(){throw Error('ambiguous metadata should never reach JPEG decoder');}
 });
 const descriptor={width:16,height:16,bitsPerComponent:8,colorSpace:'/DeviceCMYK',filter:'/DCTDecode'};
 assert.deepEqual(await decode({bytes:raw.contents,descriptor}),{status:'preserve'});
});
test('conflicting repeated Adobe transforms and malformed EXIF segments still fail safely',async()=>{
 for(const option of [{transform:2,legacyMetadata:true,conflictingAdobe:true},
                     {transform:2,legacyMetadata:true,brokenLegacyLength:true}]){
  await assert.rejects(inspectPDFInput(await fixture(option),{PDF,readPages:pages}),
    e=>e.code==='image-header-unverifiable');
 }
});
test.todo('CMYK/YCCK JPEG re-encoding and independently verified file-size reduction on a real-world scan');
