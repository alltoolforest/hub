// Native-canvas integration harness; this is not Android/iOS browser evidence.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),root=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {createCanvas,loadImage,ImageData}=require(root+'/@napi-rs/canvas');
const sharp=require(root+'/sharp');
const size=Number(process.argv[2]||102),[width,height]=({24:[6000,4000],48:[8000,6000],102:[12000,8500]})[size]||[1152,1536];
const photo=await readFile(process.argv[3] || new URL('../../upload/02-1000133429.jpg',import.meta.url));
const jpeg=await sharp(photo).resize(width,height,{fit:'cover'}).jpeg({quality:92}).toBuffer();
class Canvas {
 constructor(w,h){this.canvas=createCanvas(w,h);}
 get width(){return this.canvas.width;} set width(n){this.canvas.width=n;}
 get height(){return this.canvas.height;} set height(n){this.canvas.height=n;}
 getContext(){const ctx=this.canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(src,...args)=>draw(src.canvas||src,...args);return ctx;}
 async convertToBlob(){return new Blob([await this.canvas.encode('png')],{type:'image/png'});}
}
globalThis.OffscreenCanvas=Canvas;globalThis.ImageData=ImageData;
globalThis.createImageBitmap=async(blob)=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
let result,peak=0,last=-1;
globalThis.self={postMessage(m){if(m.error)throw new Error(m.error);if(m.blob)result=m;else if(m.progress){const percent=Number(m.progress.match(/(\d+)%/)?.[1]||0);if(Math.floor(percent/10)>last){last=Math.floor(percent/10);console.log(m.progress);}}peak=Math.max(peak,process.memoryUsage().rss);}};
await import('../assets/js/enhancer-v2/image-enhancer-photo-worker.js');
const t=performance.now();
await self.onmessage({data:{file:new Blob([jpeg],{type:'image/jpeg'}),decodeOptions:{reduced:false},options:{strength:'balanced',sharpness:'auto',content:'auto',sourceMime:'image/jpeg',faceProtection:'standard',faces:[]}}});
assert.ok(result?.blob);assert.equal(result.width,width);assert.equal(result.height,height);
const bytes=Buffer.from(await result.blob.arrayBuffer());
const decoded=await sharp(bytes).stats();const meta=await sharp(bytes).metadata();assert.equal(meta.width,width);assert.equal(meta.height,height);assert.equal(decoded.channels.length,4);assert.equal(decoded.channels[3].min,255);
if(size===2){
 const candidate=await sharp(bytes).raw().toBuffer();result=null;
 await import('../../main-release/assets/js/enhancer-v2/image-enhancer-photo-worker.js');
 const bitmap=await createImageBitmap(new Blob([jpeg]));
 await self.onmessage({data:{bitmap,options:{strength:'balanced',sharpness:'auto',content:'auto',sourceMime:'image/jpeg',faceProtection:'standard',faces:[]}}});
 assert.ok(result?.blob);const baseline=await sharp(Buffer.from(await result.blob.arrayBuffer())).raw().toBuffer();assert.deepEqual(candidate,baseline);console.log('PASS exact enhancement-pixel parity versus accepted main worker');
}
const report={fixture:'upsampled supplied photograph, stress test only',harness:'Node native canvas (not browser)',width,height,inputBytes:jpeg.length,outputBytes:bytes.length,seconds:Math.round((performance.now()-t)/1000),peakObservedRssMiB:Math.round(peak/1048576),status:'PASS native-size decode / accepted enhancement / streamed PNG / independent full decode'};
await writeFile(new URL('./worker-stress-'+size+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(report);
