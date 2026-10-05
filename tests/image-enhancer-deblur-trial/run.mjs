// Isolated Tasks 4/5 ordering experiment. No production admission or UI changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {hash,canvasOf,frameOf,installCanvasHarness,registryForTrial} from '../image-enhancer-cleanup/adapter.mjs';
import {validateDeblurOutput} from '../../assets/js/image-enhancer-deblur-validation.js';
import {applyArtifactFidelityGuard} from '../../assets/js/image-enhancer-artifact-guard.js';
const [fixtures,intake,nafPath,wdnPath,ortPackage,out,only]=process.argv.slice(2);
if(!out)throw Error('Usage: run.mjs FIXTURES NASA_INTAKE NAF_MODEL WDN_MODEL ORT_PACKAGE OUTPUT');
await mkdir(out,{recursive:true});installCanvasHarness();
const nafBytes=await readFile(nafPath);
assert.equal(hash(nafBytes),'05b455663115b19de4577d7d092bcd52f34b51517a83c1679cf28a31f4078204','NAFNet integrity');
const ort=createRequire(import.meta.url)(resolve(ortPackage));ort.env.wasm.numThreads=1;
const session=await ort.InferenceSession.create(nafBytes,{executionProviders:['wasm']});
// Execute the existing worker module through a serial native-canvas diagnostic
// shim. This tests its exact arithmetic, not browser worker/bitmap semantics.
let reply;globalThis.self={postMessage:value=>{reply=value;}};
globalThis.OffscreenCanvas=function(w,h){const c=createCanvas(w,h);c.transferToImageBitmap=()=>c;return c;};
await import('../../assets/js/image-enhancer-processing-worker.js');
let nextId=1;
async function fusion(original,candidate,analysis,faces){
 reply=undefined;await self.onmessage({data:{id:nextId++,type:'adaptive-deblur-blend',sourceBitmap:canvasOf(original),deblurBitmap:canvasOf(candidate),analysis,faces}});
 assert.ok(reply?.ok,reply?.error);return frameOf(reply.bitmap);
}
async function decode(path){const bytes=await readFile(path),image=await loadImage(bytes);const scale=Math.min(1,128/Math.max(image.width,image.height));const c=createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);return {frame:frameOf(c),sourceHash:hash(bytes)};}
function blur(f,kind){const output={...f,data:f.data.slice()};const taps=[];for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(kind==='motion'?y===0:x*x+y*y<=4)taps.push([x,y]);
 for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)for(let k=0;k<3;k++){let s=0;for(const [dx,dy] of taps)s+=f.data[(Math.max(0,Math.min(f.height-1,y+dy))*f.width+Math.max(0,Math.min(f.width-1,x+dx)))*4+k];output.data[(y*f.width+x)*4+k]=Math.round(s/taps.length);}return output;}
function noise(f){const g={...f,data:f.data.slice()};let seed=941;for(let i=0;i<g.data.length;i++)if(i%4!==3){seed=(Math.imul(seed,1664525)+1013904223)>>>0;g.data[i]+=Math.round((seed/4294967296-.5)*36);}return g;}
function mae(a,b){let s=0;for(let i=0;i<a.data.length;i++)if(i%4!==3)s+=Math.abs(a.data[i]-b.data[i]);return s/(a.width*a.height*3);}
async function infer(f){const w=Math.ceil(f.width/16)*16,h=Math.ceil(f.height/16)*16,input=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<3;k++)input[k*w*h+y*w+x]=f.data[(Math.min(y,f.height-1)*f.width+Math.min(x,f.width-1))*4+k]/255;
 const tensor=new ort.Tensor('float32',input,[1,3,h,w]);let outputs;
 try{outputs=await session.run({[session.inputNames[0]]:tensor});const o=outputs[session.outputNames[0]];assert.deepEqual(o.dims,[1,3,h,w]);let admission;try{validateDeblurOutput(o,w,h);admission='accepted';}catch(error){admission='rejected:'+error.message;}
 const g={...f,data:f.data.slice(),admission};for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++)for(let k=0;k<3;k++){const v=o.data[k*w*h+y*w+x];assert.ok(Number.isFinite(v));g.data[(y*f.width+x)*4+k]=Math.round(Math.max(0,Math.min(1,v))*255);}return g;}
 finally{tensor.dispose();for(const o of Object.values(outputs||{}))o.dispose();}}
const ids=['coffee','astronaut','nasa-081','nasa-084','nasa-088','nasa-097'];const rows=[];
try{
 for(const id of ids){if(only&&!only.startsWith(id+':'))continue;const path=id.startsWith('nasa')?resolve(intake,'images',id+'.jpg'):resolve(fixtures,id+'-reference.png');const {frame:reference,sourceHash}=await decode(path);
 const faces=id==='astronaut'?[{x:40,y:15,width:28,height:34,score:1}]:[];
 for(const condition of ['motion','defocus','mixed']){
  if(only&&only!==`${id}:${condition}`)continue;
  let source=blur(reference,condition==='motion'?'motion':'defocus');if(condition==='mixed')source=noise(source);
  const originalHash=hash(source.data),analysis={likelyBlurred:true,blurScore:.8,diagnosis:{confidence:{blur:.9,noise:condition==='mixed'?1:0}}};
  const row={id,condition,sourceHash,inputHash:originalHash,inputMae:mae(source,reference),paths:[]};
  for(const route of ['deblur','cleanup-deblur']){
   let input=source;const stages=[];
   if(route==='cleanup-deblur'){
    const {registry,stats}=registryForTrial({modelPath:wdnPath,ortPackage,faces,degradation:analysis});const adapter=await registry.cleanup.load({});
    try{input=(await adapter.run({image:source,original:source})).image;}finally{await adapter.dispose();}
    assert.equal(stats.loads,stats.releases);stages.push({name:'cleanup-face-protected',mae:mae(input,reference)});
   }
   const raw=await infer(input);stages.push({name:'raw-deblur',mae:mae(raw,reference),numericalAdmission:raw.admission});
   const fused=await fusion(source,raw,analysis,faces);stages.push({name:'pr117-fusion',mae:mae(fused,reference)});
   const result=await applyArtifactFidelityGuard({canvas:canvasOf(fused),sourceImage:canvasOf(source),faces,degradation:analysis,mode:'deblur'});
   const final=frameOf(result.canvas);stages.push({name:'final-guard',mae:mae(final,reference)});
   assert.equal(hash(source.data),originalHash);assert.equal(final.width,source.width);assert.equal(final.height,source.height);
   row.paths.push({route,stages,guardStages:result.stages,outputHash:hash(final.data)});
   if(only){for(const [label,f] of [['reference',reference],['input',source],['model-input',input],['raw',raw],['fusion',fused]])await writeFile(resolve(out,`${id}-${condition}-${route}-${label}.png`),canvasOf(f).toBuffer('image/png'));}
   if(only||id==='astronaut'&&condition==='mixed')await writeFile(resolve(out,`${id}-${condition}-${route}.png`),canvasOf(final).toBuffer('image/png'));
  }
  rows.push(row);console.log(`${id} ${condition} complete`);
 }
 }
}finally{await session.release();}
const final=p=>p.stages.at(-1).mae;
const summary={comparisons:rows.length,cleanupBetter:rows.filter(r=>final(r.paths[1])<final(r.paths[0])).length,cleanupWorse:rows.filter(r=>final(r.paths[1])>final(r.paths[0])).length,cleanupTie:rows.filter(r=>final(r.paths[1])===final(r.paths[0])).length};
const report={tasks:[4,5],production:false,acceptance:'NOT_EVALUATED',model:'Existing pinned NAFNet GoPro width32 FP16',scope:'Diagnostic comparison of reconstruction, unchanged PR117 fusion and final guard; not complete production finishing or browser execution',limitations:[`${rows.length} synthetic cases on public development sources; no held-out/human quality gate`,'NASA inputs remain private development candidates; no production/marketing usage clearance inferred','Motion is horizontal box blur, defocus disk radius2; not real camera damage','Small preview images, manual portrait box, no automated text/detector verification','WDN evaluated before blur for both isolated and mixed damage; not automatically selected','No weights distributed, no NAFNet conversion-parity claim'],summary,rows};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(summary);
