// Actual application tile and worker arithmetic, using serial native canvas.
// This does not emulate browser transfers, UI routing, or device performance.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {hash,frameOf,installCanvasHarness} from '../image-enhancer-cleanup/adapter.mjs';
import {validateDeblurOutput} from '../../assets/js/image-enhancer-deblur-validation.js';
import {applyArtifactFidelityGuard} from '../../assets/js/image-enhancer-artifact-guard.js';
const [inputPath,modelPath,ortPackage,out]=process.argv.slice(2);
if(!out)throw Error('Usage: tiled_probe.mjs INPUT MODEL ORT_PACKAGE OUTPUT_JSON');
installCanvasHarness();
globalThis.OffscreenCanvas=function(w,h){const c=createCanvas(w,h);c.transferToImageBitmap=()=>c;return c;};
let reply,id=0;globalThis.self={postMessage:r=>{reply=r;}};
await import('../../assets/js/image-enhancer-processing-worker.js');
async function worker(type,payload){reply=null;await self.onmessage({data:{id:++id,type,...payload}});assert.equal(reply?.ok,true,reply?.error);return reply;}
const processor={
 async packTile(image,sx,sy,width,height){const c=createCanvas(width,height);c.getContext('2d').drawImage(image,sx,sy,width,height,0,0,width,height);return new Float32Array((await worker('pack-tile',{bitmap:c,width,height})).buffer);},
 async tensorToBitmap(data,width,height){return (await worker('tensor-to-bitmap',{buffer:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),width,height})).bitmap;}
};
const code=await readFile(new URL('../../assets/js/image-enhancer.js',import.meta.url),'utf8');
const classText=code.slice(code.indexOf('class OnnxDeblurEngine'),code.indexOf('\nfunction clampByte'));
const Engine=new Function('EnhancementEngine','validateDeblurOutput','el','sleepFrame',`return (${classText});`)(class{},validateDeblurOutput,(_,o)=>createCanvas(o.width,o.height),async()=>{});
const bytes=await readFile(modelPath);assert.equal(hash(bytes),'05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204');
const ort=createRequire(import.meta.url)(resolve(ortPackage));ort.env.wasm.numThreads=1;
const engine=new Engine(null,null,processor);engine.ort=ort;
engine.session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
const sourceBytes=await readFile(inputPath),img=await loadImage(sourceBytes),source=createCanvas(img.width,img.height);
source.getContext('2d').drawImage(img,0,0);const original=frameOf(source);
const mae=canvas=>{const f=frameOf(canvas);let sum=0;for(let i=0;i<f.data.length;i++)if(i%4!==3)sum+=Math.abs(f.data[i]-original.data[i]);return sum/(f.width*f.height*3);};
const rows=[];
try{
 for(const core of [192,128]){
  const row={tileCore:core};
  try {
   const result=await engine.processTiled(source,core,undefined,undefined,0);
   row.tiles=result.tileCount;row.rawMaeFromSource=mae(result.canvas);
   const analysis={likelyBlurred:true,blurScore:.8,diagnosis:{confidence:{blur:.9,noise:0}}};
   const fused=(await worker('adaptive-deblur-blend',{sourceBitmap:source,deblurBitmap:result.canvas,analysis,faces:[]})).bitmap;
   row.fusionMaeFromSource=mae(fused);
   const guarded=await applyArtifactFidelityGuard({canvas:fused,sourceImage:source,faces:[],degradation:analysis,mode:'deblur'});
   row.finalMaeFromSource=mae(guarded.canvas);row.guardStages=guarded.stages;row.status='processed';
   await writeFile(out+'.'+core+'.png',guarded.canvas.toBuffer('image/png'));
  } catch(error){row.status='rejected';row.reason=error.message;}
  rows.push(row);
 }
}finally{await engine.dispose();}
const report={kind:'application-tile-arithmetic-native-canvas',inputSha256:hash(sourceBytes),applicationModuleSha256:hash(Buffer.from(code)),width:img.width,height:img.height,rows,
 limitations:['Forced clean image into deblur; no automatic-route claim','Serial native canvas, not browser transfer/device verification','Not a category quality or identity acceptance result']};
await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
