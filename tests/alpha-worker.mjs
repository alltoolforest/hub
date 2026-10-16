// Real numeric worker + native canvas; no browser support claim.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {createCanvas,ImageData}=require(root+'/@napi-rs/canvas'),sharp=require(root+'/sharp');
class Canvas{constructor(w,h){this.canvas=createCanvas(w,h);}get width(){return this.canvas.width;}set width(v){this.canvas.width=v;}get height(){return this.canvas.height;}set height(v){this.canvas.height=v;}getContext(){const c=this.canvas.getContext('2d'),draw=c.drawImage.bind(c);c.drawImage=(s,...a)=>draw(s.canvas||s,...a);return c;}async convertToBlob(){return new Blob([await this.canvas.encode('png')],{type:'image/png'});}close(){}}
globalThis.OffscreenCanvas=Canvas;globalThis.ImageData=ImageData;
const w=129,h=387,src=new Canvas(w,h),rgba=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;rgba[i]=x*2%256;rgba[i+1]=y%256;rgba[i+2]=110;rgba[i+3]=[0,64,128,192,255][Math.floor(x/26)%5];}
src.getContext().putImageData(new ImageData(rgba,w,h),0,0);
let result;globalThis.self={postMessage(m){if(m.error)throw Error(m.error);if(m.blob)result=m;}};
await import('../assets/js/enhancer-v2/image-enhancer-photo-worker.js');
const input={bitmap:src,options:{strength:'balanced',sharpness:'auto',content:'auto',sourceMime:'image/png',faceProtection:'standard',faces:[]}};
await self.onmessage({data:input});assert.ok(result?.blob);const candidate=await sharp(Buffer.from(await result.blob.arrayBuffer())).raw().toBuffer();
for(let i=3;i<rgba.length;i+=4)assert.equal(candidate[i],rgba[i]);
result=null;await import('../../main-release/assets/js/enhancer-v2/image-enhancer-photo-worker.js');await self.onmessage({data:input});const baseline=await sharp(Buffer.from(await result.blob.arrayBuffer())).raw().toBuffer();
// Premultiplication round trips can round RGB at partial alpha; alpha must be exact.
let max=0;for(let i=0;i<candidate.length;i++)max=Math.max(max,Math.abs(candidate[i]-baseline[i]));
assert.ok(max<=2,`Unexpected pixel discrepancy ${max}`);console.log('PASS transparent/partial-alpha strip boundaries; exact alpha; maximum RGBA delta vs baseline:',max);
