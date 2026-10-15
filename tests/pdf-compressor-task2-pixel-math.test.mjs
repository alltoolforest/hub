import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRasterCandidate} from '../assets/js/pdf-compressor-v2/image-candidate.mjs';
import {encodeBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';

function referenceAreaAverage(rgba,sourceWidth,sourceHeight,width,height){
 const out=new Uint8Array(width*height*3);
 for(let y=0;y<height;y++){
  const y0=y*sourceHeight/height,y1=(y+1)*sourceHeight/height;
  for(let x=0;x<width;x++){
   const x0=x*sourceWidth/width,x1=(x+1)*sourceWidth/width;
   const sums=[0,0,0];let weight=0;
   for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
    const w=(Math.min(y1,sy+1)-Math.max(y0,sy))*(Math.min(x1,sx+1)-Math.max(x0,sx));
    const p=(sy*sourceWidth+sx)*4;weight+=w;
    for(let c=0;c<3;c++)sums[c]+=rgba[p+c]*w;
   }
   for(let c=0;c<3;c++)out[(y*width+x)*3+c]=Math.round(sums[c]/weight);
  }
 }
 return out;
}
test('optimized image averaging is byte-for-byte identical to pre-optimization algorithm in all strengths',async()=>{
 const width=1600,height=50,rgba=new Uint8Array(width*height*4);
 for(let p=0;p<width*height;p++){
  rgba[p*4]=(p*71+7)%256;
  rgba[p*4+1]=(p*19+255)%256;
  rgba[p*4+2]=(p*113+83)%256;
  rgba[p*4+3]=255;
 }
 const encoded=new Uint8Array([255,216,255,217]);
 for(const mode of ['balanced','strong','maximum']){
  let seen;
  const result=await encodeRasterCandidate({
   descriptor:{width,height,bitsPerComponent:8,filter:'/FlateDecode',
    colorSpace:'/DeviceRGB',streamBytes:1000000},
   rgba,mode,encodeJpeg:async candidate=>{seen=candidate;return encoded.slice();}
  });
  assert.equal(result.status,'candidate-only');
  assert.ok(seen.rgb instanceof Uint8Array);
  assert.deepEqual(seen.rgb,referenceAreaAverage(rgba,width,height,seen.width,seen.height),
   'area averaged RGB must not change when internal allocations are removed');
 }
});
test('allocation-free browser RGBA packing preserves every channel and alpha',async()=>{
 const previous=globalThis.OffscreenCanvas;
 let captured;
 class Canvas {
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){return {
   createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),
   putImageData:data=>{captured=data.data.slice();}
  };}
  async convertToBlob(){return new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'});}
 }
 globalThis.OffscreenCanvas=Canvas;
 try{
  const rgb=new Uint8Array([0,128,255,255,0,12,7,19,40,100,123,255]);
  const jpeg=await encodeBrowserJpeg({rgb,width:2,height:2,quality:0.68});
  assert.deepEqual(jpeg,new Uint8Array([255,216,255,217]));
  assert.deepEqual(captured,new Uint8ClampedArray([
   0,128,255,255,255,0,12,255,7,19,40,255,100,123,255,255
  ]));
 }finally{
  if(previous===undefined)delete globalThis.OffscreenCanvas;
  else globalThis.OffscreenCanvas=previous;
 }
});
