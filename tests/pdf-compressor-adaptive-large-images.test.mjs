import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import {streamFlateImage} from '../assets/js/pdf-compressor-v2/streaming-flate-image.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
import {assessImage} from '../assets/js/pdf-compressor-v2/image-policy.mjs';
import {planCompression} from '../assets/js/pdf-compressor-v2/mode-policy.mjs';

test('streamed Flate downsampling preserves RGB/gray sample values and exact length',async()=>{
  const gray=new Uint8Array(8*8).fill(63),compressed=new Uint8Array(deflateSync(gray));
  const rgb=await streamFlateImage(compressed,{width:8,height:8,channels:1,targetWidth:2,targetHeight:2});
  assert.deepEqual([...rgb],new Array(12).fill(63));
  assert.equal((await streamFlateImage(compressed,{width:8,height:8,channels:1})).decodedBytes,64);
  await assert.rejects(streamFlateImage(compressed,{width:9,height:8,channels:1}),/flate-image-size-mismatch/);
});
test('high-resolution image inventory over 32 MP is inspected without full-resolution allocation',async()=>{
  const width=3500,height=3500,raw=new Uint8Array(width*height*3);
  // Three distinct registered XObjects; their total decoded area exceeds
  // the old 32 MP cap while each stream exceeds the old 32 MB inflate cap.
  const compressed=new Uint8Array(deflateSync(raw)),doc=await PDF.PDFDocument.create();
  const page=doc.addPage([600,800]),N=PDF.PDFName.of,images={};
  for(let i=0;i<3;i++){
    const stream=doc.context.stream(compressed,{Type:'XObject',Subtype:'Image',Width:width,
      Height:height,BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'FlateDecode'});
    images['Img'+i]=doc.context.register(stream);
  }
  page.node.set(N('Resources'),doc.context.obj({XObject:images}));
  for(let i=0;i<3;i++)page.pushOperators(PDF.drawObject('Img'+i));
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false}));
  const before=bytes.slice();
  const report=await inspectPDFInput(bytes,{PDF,readPages:async()=>({pages:[{
    view:[0,0,600,800],rotation:0,textItems:0,imagePaints:3,annotations:0,links:0}]})});
  assert.equal(report.valid,true);
  assert.equal(report.images.length,3);
  assert.ok(report.images.reduce((sum,img)=>sum+img.width*img.height,0)>32000000);
  assert.deepEqual(bytes,before);
  const descriptor={width,height,colorSpace:'/DeviceRGB',filter:'/FlateDecode',bitsPerComponent:8};
  assert.equal(assessImage(descriptor,'strong').eligible,false);
  assert.equal(assessImage(descriptor,'strong',undefined,{allowAdaptive:true}).adaptive,true);
  assert.equal(planCompression({images:report.images,mode:'strong',classification:'image-only'}).imageCandidates,3);
  assert.equal(typeof await losslessFingerprint(bytes,{PDF}),'string');
});
