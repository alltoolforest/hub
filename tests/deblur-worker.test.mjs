import assert from 'node:assert/strict';
import {recoverDeblurFallback} from '../assets/js/image-enhancer-deblur-fallback.js';

// Pixel-only canvas mock exercises worker routing and cleanup, not browser APIs.
class Canvas {
  constructor(w,h){this.w=w;this.h=h;this.data=new Uint8ClampedArray(w*h*4);}
  get width(){return this.w;}set width(v){this.w=v;this.data=new Uint8ClampedArray(this.w*this.h*4);}
  get height(){return this.h;}set height(v){this.h=v;this.data=new Uint8ClampedArray(this.w*this.h*4);}
  getContext(){const canvas=this;return {
    drawImage(image,...args){
      let sx=0,sy=0,sw=image.width,sh=image.height,dx=0,dy=0,dw=sw,dh=sh;
      if(args.length===2)[dx,dy]=args;
      else if(args.length===4)[dx,dy,dw,dh]=args;
      else [sx,sy,sw,sh,dx,dy,dw,dh]=args;
      assert.equal(sw,dw);assert.equal(sh,dh);
      for(let y=0;y<dh;y++)for(let x=0;x<dw;x++)for(let c=0;c<4;c++)canvas.data[((dy+y)*canvas.width+dx+x)*4+c]=image.data[((sy+y)*image.width+sx+x)*4+c];
    },
    getImageData(x,y,w,h){const data=new Uint8ClampedArray(w*h*4);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)for(let c=0;c<4;c++)data[(yy*w+xx)*4+c]=canvas.data[((y+yy)*canvas.width+x+xx)*4+c];return {data};},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4),width:w,height:h};},
    putImageData(image,x,y){for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++)for(let c=0;c<4;c++)canvas.data[((y+yy)*canvas.width+x+xx)*4+c]=image.data[(yy*image.width+xx)*4+c];}
  };}
  transferToImageBitmap(){return {width:this.width,height:this.height,data:this.data,close(){this.closed=true;}};}
}
globalThis.OffscreenCanvas=Canvas;
let replies=[];
globalThis.self={postMessage:m=>replies.push(m)};
await import('../assets/js/image-enhancer-processing-worker.js');
function fixture(w,h){const b={width:w,height:h,data:new Uint8ClampedArray(w*h*4),close(){this.closed=true;}};for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(y*w+x)*4;for(let c=0;c<3;c++)b.data[p+c]=Math.round(110+c*10+35*Math.sin(x*.12)+20*Math.cos(y*.17));b.data[p+3]=255;}return b;}
const w=285,h=271,n=w*h,bitmap=fixture(w,h),src=new Float32Array(n*3);
for(let i=0;i<n;i++)for(let c=0;c<3;c++)src[c*n+i]=bitmap.data[i*4+c]/255;
const expected=recoverDeblurFallback(src,w,h);
await self.onmessage({data:{id:1,type:'fallback-deblur',bitmap}});
const result=replies.at(-1);assert.equal(result.ok,true);assert.equal(bitmap.closed,true);
assert.deepEqual([result.bitmap.width,result.bitmap.height],[w,h]);
for(let i=0;i<n;i++)for(let c=0;c<3;c++)assert.equal(result.bitmap.data[i*4+c],Math.round(expected[c*n+i]*255));
replies=[];const cancelled=fixture(541,519);
const work=self.onmessage({data:{id:2,type:'fallback-deblur',bitmap:cancelled}});
await self.onmessage({data:{id:2,type:'cancel'}});await work;
assert.equal(replies.length,1);assert.equal(replies[0].ok,false);assert.equal(replies[0].name,'AbortError');assert.equal(cancelled.closed,true);
// A subsequent request must not inherit cancelled state.
await self.onmessage({data:{id:3,type:'fallback-deblur',bitmap:fixture(32,33)}});
assert.equal(replies.at(-1).ok,true);
console.log('PASS: actual worker dispatch, tiled pixel output, bitmap cleanup, cancellation and rerun (canvas mocked).');
