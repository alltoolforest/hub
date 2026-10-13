import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,ImageData,loadImage} from '@napi-rs/canvas';
import {PDF,buildFixture} from './pdf-compressor-task1-fixtures.mjs';
import {transformEmbeddedImages,inflateExact} from '../assets/js/pdf-compressor-v2/embedded-image-transform.mjs';
import {deflateSync} from 'node:zlib';
import {createImageOutputVerifier} from '../assets/js/pdf-compressor-v2/image-output-verifier.mjs';
const encodeJpeg=async({rgb,width,height,quality})=>{
  const canvas=createCanvas(width,height),rgba=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p++){rgba.set(rgb.subarray(p*3,p*3+3),p*4);rgba[p*4+3]=255;}
  canvas.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
  return new Uint8Array(await canvas.encode('jpeg',Math.round(quality*100)));
};
const inspectInput=async bytes=>{await PDF.PDFDocument.load(bytes,{updateMetadata:false});};
test('real JPEG replacements reopen and preserve page content streams and geometry',async()=>{
  const {bytes}=await buildFixture('mixed');let verified=0;
  const result=await transformEmbeddedImages(bytes,{PDF,encodeJpeg,inspectInput,
    verifyOutput:async({original,output,replacements})=>{
      const a=await PDF.PDFDocument.load(original),b=await PDF.PDFDocument.load(output);
      assert.equal(a.getPageCount(),b.getPageCount());
      for(let i=0;i<a.getPageCount();i++){
        assert.deepEqual(a.getPage(i).getSize(),b.getPage(i).getSize());
        const content=doc=>{const obj=doc.getPage(i).node.Contents();
          const streams=obj instanceof PDF.PDFArray?Array.from({length:obj.size()},(_,j)=>doc.context.lookup(obj.get(j))):[obj];
          return streams.map(stream=>Array.from(stream.contents));};
        assert.deepEqual(content(a),content(b));
      }
      for(const r of replacements){const image=await loadImage(Buffer.from(r.candidate.bytes));
        assert.equal(image.width,r.descriptor.width);assert.equal(image.height,r.descriptor.height);}
      verified++;return true;
    }});
  assert.equal(result.status,'compressed');assert.ok(result.savedBytes>0);assert.equal(verified,1);
});
test('missing or failed verifier cannot release an image output',async()=>{
  const {bytes}=await buildFixture('mixed');
  await assert.rejects(transformEmbeddedImages(bytes,{PDF}),/independent-verification-required/);
  await assert.rejects(transformEmbeddedImages(bytes,{PDF,encodeJpeg,inspectInput,verifyOutput:async()=>false}),/image-output-integrity-failed/);
});
test('input rejection and cancellation leave original bytes intact',async()=>{
  const {bytes}=await buildFixture('mixed'),copy=bytes.slice();
  await assert.rejects(transformEmbeddedImages(bytes,{PDF,inspectInput:async()=>{throw Error('signed-input');},verifyOutput:async()=>true}),/signed-input/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(transformEmbeddedImages(bytes,{PDF,inspectInput,verifyOutput:async()=>true,signal:controller.signal}),/cancelled/);
  assert.deepEqual(bytes,copy);
});
test('protected graph verifier rejects same-presence text changes and false JPEG approval',async()=>{
  const {bytes}=await buildFixture('mixed');let request;
  await transformEmbeddedImages(bytes,{PDF,encodeJpeg,inspectInput,verifyOutput:async value=>{request=value;return true;}});
  const readPages=async data=>{const doc=await PDF.PDFDocument.load(data);return doc.getPages().map(p=>p.getSize());};
  const verifyJpeg=async({bytes,width,height})=>{const image=await loadImage(Buffer.from(bytes));return image.width===width&&image.height===height;};
  const verifier=createImageOutputVerifier({PDF,readPages,verifyJpeg});
  assert.equal(await verifier(request),true);
  const changed=await PDF.PDFDocument.load(request.output,{updateMetadata:false});
  changed.setTitle('Unauthorized changed metadata');
  await assert.rejects(verifier({...request,output:new Uint8Array(await changed.save({useObjectStreams:false}))}),/protected-document-structure-changed/);
  const changedText=await PDF.PDFDocument.load(request.output,{updateMetadata:false});
  changedText.getPage(0).drawText('Unexpected injected page text');
  await assert.rejects(verifier({...request,output:new Uint8Array(await changedText.save({useObjectStreams:false}))}),/protected-document-structure-changed/);
  await assert.rejects(createImageOutputVerifier({PDF,readPages,verifyJpeg:async()=>false})(request),/jpeg-quality-verification-failed/);
});
test('oversized decoded payload is rejected and cancellation during verification withholds output',async()=>{
  await assert.rejects(inflateExact(new Uint8Array(deflateSync(new Uint8Array(1_000_000))),3),/image-decoded-size-mismatch/);
  const {bytes}=await buildFixture('mixed'),controller=new AbortController();
  await assert.rejects(transformEmbeddedImages(bytes,{PDF,encodeJpeg,inspectInput,signal:controller.signal,
    verifyOutput:async()=>{controller.abort();return true;}}),/cancelled/);
});
