import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRasterCandidate} from '../assets/js/pdf-compressor-v2/image-candidate.mjs';
const descriptor={width:2,height:2,bitsPerComponent:8,filter:'/FlateDecode',
 colorSpace:'/DeviceRGB',streamBytes:80};
const rgba=new Uint8Array([1,2,3,255,4,5,6,255,7,8,9,255,10,11,12,255]);
const fakeJpeg=new Uint8Array([255,216,0,1,255,217]);
test('bounded opaque RGB raster yields candidate, not committed PDF',async()=>{
  const r=await encodeRasterCandidate({descriptor,rgba,encodeJpeg:async v=>{
    assert.equal(v.rgb.length,12);return fakeJpeg;}});
  assert.equal(r.status,'candidate-only');assert.equal(r.requiresIndependentPDFValidation,true);
  assert.equal(r.filter,'/DCTDecode');
});
test('alpha, unsafe profiles, and lack of savings preserve original',async()=>{
  const transparent=rgba.slice();transparent[3]=0;
  assert.equal((await encodeRasterCandidate({descriptor,rgba:transparent})).status,'preserve');
  let calls=0;
  const preserved=await encodeRasterCandidate({descriptor,rgba:transparent,
    encodeJpeg:async()=>{calls++;throw new Error('must not encode alpha');}});
  assert.equal(preserved.reason,'alpha-detected');
  assert.equal(calls,0);
  assert.equal(transparent[3],0);
  assert.equal((await encodeRasterCandidate({descriptor:{...descriptor,colorSpace:'/ICCBased'},rgba})).status,'preserve');
  const r=await encodeRasterCandidate({descriptor:{...descriptor,streamBytes:4},
    rgba,encodeJpeg:async()=>fakeJpeg});
  assert.equal(r.status,'preserve');
});
test('codec errors, malformed buffer, cancel fail closed',async()=>{
  await assert.rejects(encodeRasterCandidate({descriptor,rgba}),
    e=>e.code==='codec-unavailable');
  await assert.rejects(encodeRasterCandidate({descriptor,rgba:new Uint8Array(2)}),
    e=>e.code==='invalid-rgba-buffer');
  await assert.rejects(encodeRasterCandidate({descriptor,rgba,encodeJpeg:async()=>new Uint8Array(4)}),
    e=>e.code==='invalid-jpeg');
  await assert.rejects(encodeRasterCandidate({descriptor,rgba,signal:{aborted:true}}),
    e=>e.code==='cancelled');
});
test('downsampling is bounded, never upscales, and preserves uniform RGB values',async()=>{
  const width=2500,height=4,pixels=new Uint8Array(width*height*4);
  for(let p=0;p<width*height;p++)pixels.set([60,100,180,255],p*4);
  for(const [mode,expected] of [['balanced',2400],['strong',1800]]){
    const candidate=await encodeRasterCandidate({descriptor:{...descriptor,width,height,streamBytes:50000},rgba:pixels,mode,
      encodeJpeg:async({rgb,width:w,height:h})=>{
        assert.equal(w,expected);assert.ok(h<=height);
        for(let p=0;p<rgb.length;p++)assert.equal(rgb[p],[60,100,180][p%3]);return fakeJpeg;
      }});
    assert.equal(candidate.width,expected);
  }
});
