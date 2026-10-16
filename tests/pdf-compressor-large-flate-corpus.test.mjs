import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const N=PDF.PDFName.of;
async function makeLargeFlatePDF({pages=7,malformed=false}={}){
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const width=2000,height=1500,channels=3,bytes=width*height*channels;
 for(let i=0;i<pages;i++){
  const page=doc.addPage([400,560]);
  page.drawText('Synthetic independent image stream '+i,{x:25,y:520,size:12});
  const raw=new Uint8Array(bytes); raw.fill((i*17)%256);
  const packed=new Uint8Array(deflateSync(raw,{level:3}));
  if(malformed&&i===pages-1)packed[packed.length-1]^=7;
  const dict=doc.context.obj({Type:'XObject',Subtype:'Image',Width:width,Height:height,
    BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'FlateDecode'});
  const imageRef=doc.context.register(PDF.PDFRawStream.of(dict,packed));
  const resource=page.node.Resources()??doc.context.obj({});
  resource.set(N('XObject'),doc.context.obj({Im1:imageRef}));
  page.node.set(N('Resources'),resource);
  const draw=doc.context.flateStream('q 385 0 0 490 6 6 cm /Im1 Do Q');
  page.node.addContentStream(doc.context.register(draw));
 }
 return new Uint8Array(await doc.save({useObjectStreams:false}));
}
const fakeReader=async()=>({pages:Array.from({length:7},()=>({
 view:[0,0,400,560],rotation:0,textItems:1,imagePaints:1,annotations:0,links:0
}))});
test('large decoded Flate image work validates incrementally, preserves exact source and ignores cumulative pixel count as RAM',async()=>{
 const bytes=await makeLargeFlatePDF(),copy=bytes.slice();
 const report=await inspectPDFInput(bytes,{PDF,readPages:fakeReader,limits:{
   maxBytes:100000000,maxPages:500,maxOperators:2000000,maxInvariantEntries:2000000,
   maxTotalDecodedBytes:10000000,maxDecodedStreamBytes:32000000,maxObjects:50000,
   maxGraphEntries:250000,maxDepth:100,maxImages:1000,
   maxImagePixels:8000000,maxTotalImagePixels:32000000
 }});
 assert.equal(report.valid,true);
 assert.equal(report.pageCount,7);
 assert.equal(report.images.length,7);
 assert.deepEqual(bytes,copy,'inspection must not mutate source');
 const fp=await losslessFingerprint(bytes,{PDF,maxStreamBytes:32000000,maxTotalDecodedBytes:10000000});
 assert.match(fp,/^[a-f0-9]{64}$/);
});
test('streamed large Flate images still reject damaged zlib checksums',async()=>{
 const bytes=await makeLargeFlatePDF({malformed:true});
 await assert.rejects(inspectPDFInput(bytes,{PDF,readPages:fakeReader,limits:{
   maxBytes:100000000,maxPages:500,maxOperators:2000000,maxInvariantEntries:2000000,
   maxTotalDecodedBytes:10000000,maxDecodedStreamBytes:32000000,maxObjects:50000,
   maxGraphEntries:250000,maxDepth:100,maxImages:1000,maxImagePixels:8000000,
   maxTotalImagePixels:32000000
 }}),e=>e.code==='invalid-image-stream');
});
