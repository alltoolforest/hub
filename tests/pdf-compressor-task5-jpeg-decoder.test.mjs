import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {JpegImage} from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createPDFJpegDecoder,inspectJpegHeader,preserveJpegMetadata} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
const descriptor={width:32,height:24,bitsPerComponent:8,filter:'/DCTDecode',colorSpace:'/DeviceRGB',streamBytes:2000};
const decode=createPDFJpegDecoder(JpegImage);
async function jpeg(){const canvas=createCanvas(32,24),ctx=canvas.getContext('2d');ctx.fillStyle='#5a8cbc';ctx.fillRect(0,0,32,24);return new Uint8Array(await canvas.encode('jpeg',95));}
test('real JPEG source decodes under PDF dimensions and RGB semantics',async()=>{
  const bytes=await jpeg(),rgba=await decode({bytes,descriptor});
  assert.equal(rgba.length,32*24*4);assert.equal(rgba[3],255);
  assert.ok(Math.abs(rgba[0]-90)<4);assert.ok(Math.abs(rgba[1]-140)<4);assert.ok(Math.abs(rgba[2]-188)<4);
});
test('JPEG preflight rejects forged dimensions before invoking the decoder',async()=>{
  const bytes=await jpeg();let parsed=false;
  const guarded=createPDFJpegDecoder(class {parse(){parsed=true;}});
  await assert.rejects(guarded({bytes,descriptor:{...descriptor,width:31}}),/jpeg-source-dimension-mismatch/);
  assert.equal(parsed,false);
  assert.equal((await guarded({bytes,descriptor:{...descriptor,width:9000,height:9000}})).status,'preserve');
  assert.equal(parsed,false);
});
test('truncated/malformed JPEG headers and cancellation fail safely',async()=>{
  assert.throws(()=>inspectJpegHeader(new Uint8Array([255,216,255,224,255,255])),/truncated-source-jpeg/);
  await assert.rejects(decode({bytes:await jpeg(),descriptor,signal:{aborted:true}}),/cancelled/);
});
test('JPEG application/comment metadata survives and unverified EXIF images remain intact',async()=>{
  const bytes=await jpeg(),comment=new Uint8Array([255,254,0,6,84,69,83,84]);
  const source=new Uint8Array(bytes.length+comment.length);source.set(bytes.subarray(0,2));source.set(comment,2);source.set(bytes.subarray(2),2+comment.length);
  const output=preserveJpegMetadata(source,bytes);
  assert.deepEqual(inspectJpegHeader(output).metadata,inspectJpegHeader(source).metadata);
  const exif=source.slice();exif[3]=225;
  assert.equal((await decode({bytes:exif,descriptor})).status,'preserve');
});
test('gray JPEG application/profile metadata is preserved before RGB conversion',async()=>{
  const bytes=new Uint8Array([255,216,255,226,0,4,1,1,255,192,0,11,8,0,24,0,32,1,1,17,0,255,218,0,8,1,1,0,0,63,0,255,217]);
  let parsed=false;const guarded=createPDFJpegDecoder(class {parse(){parsed=true;}});
  assert.equal((await guarded({bytes,descriptor:{...descriptor,colorSpace:'/DeviceGray'}})).status,'preserve');
  assert.equal(parsed,false);
});
