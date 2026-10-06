import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {restore} from '../image-enhancer-orchestration/orchestrator.mjs';
import {registryForTrial,installCanvasHarness,frameOf,canvasOf,hash} from './adapter.mjs';
const [fixtures,model,ortPackage,out]=process.argv.slice(2);
if(!out)throw Error('Usage: run.mjs PUBLIC_TRIAL_FIXTURES WDN_MODEL ORT_PACKAGE OUTPUT');
await mkdir(out,{recursive:true});const realOut=await realpath(out),root=await realpath(process.cwd());
if(realOut===root||realOut.startsWith(root+sep))throw Error('Output must stay outside repository');
installCanvasHarness();
const clean={scratch:'absent',noise:'absent',compression:'absent',blur:'absent',lowResolution:'absent',lighting:'absent',fading:'absent',portrait:'absent',alpha:false,text:false};
async function frame(path){const img=await loadImage(await readFile(path)),c=createCanvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);return frameOf(c);}
function mae(a,b){assert.equal(a.width,b.width);assert.equal(a.height,b.height);let n=0,d=0;for(let i=0;i<a.data.length;i++)if(i%4!==3){n++;d+=Math.abs(a.data[i]-b.data[i]);}return d/n;}
const rows=[];
for(const name of ['coffee','astronaut'])for(const condition of ['clean','noise','jpeg']){
 const source=await frame(resolve(fixtures,`${name}-${condition}-input.png`));const reference=await frame(resolve(fixtures,`${name}-reference.png`));const before=hash(source.data);
 const evidence={...clean,...(condition==='noise'?{noise:'present'}:condition==='jpeg'?{compression:'present'}:{}),portrait:name==='astronaut'?'present':'absent'};
 // Diagnostic annotated region only. This is not a face-detector test.
 const faces=name==='astronaut'?[{x:40,y:15,width:28,height:34,score:1}]:[];
 const captures=[];const {registry,stats}=registryForTrial({modelPath:model,ortPackage,faces,degradation:{diagnosis:{confidence:{noise:condition==='noise'?1:0,compression:condition==='jpeg'?1:0}}},capture:(stage,image)=>captures.push({stage,image})});
 const started=performance.now();const result=await restore({source,evidence,registry,maxPixels:16384});
 assert.equal(hash(source.data),before);assert.equal(stats.loads,stats.releases);assert.notEqual(result.status,'fallback');
 if(condition==='clean'){assert.equal(stats.loads,0);assert.equal(hash(result.image.data),before);}
 const path=resolve(out,`${name}-${condition}.png`);await writeFile(path,canvasOf(result.image).toBuffer('image/png'));
 rows.push({name,condition,status:result.status,aiExecuted:result.aiExecuted,inputMae:mae(source,reference),outputMae:mae(result.image,reference),stages:captures.map(c=>({stage:c.stage,mae:mae(c.image,reference)})),stats,elapsedMs:performance.now()-started});
}
const source=await frame(resolve(fixtures,'coffee-noise-input.png'));
const failures=[];
for(const [label,evidence,modelPath] of [['text',{...clean,noise:'present',text:true},model],['alpha',{...clean,noise:'present',alpha:true},model],['detector-unavailable',{...clean,noise:'present',portrait:'unavailable'},model],['grayscale',{...clean,noise:'present',grayscale:true},model],['bad-hash',{...clean,noise:'present'},resolve(fixtures,'coffee-noise-input.png')]]){
 const {registry,stats}=registryForTrial({modelPath,ortPackage});const result=await restore({source,evidence,registry,maxPixels:16384});assert.equal(result.status,'fallback');assert.equal(hash(result.image.data),hash(source.data));assert.equal(stats.loads,0);failures.push({case:label,pass:true});
}
// Exercise cancellation after the actual WASM session has loaded, and after
// actual inference. Both must release it and return the preserved original.
for(const point of ['before-load','after-load','after-inference']){
 const controller=new AbortController();
 if(point==='before-load')controller.abort();
 const {registry,stats}=registryForTrial({modelPath:model,ortPackage,capture:stage=>{if(point==='after-inference'&&stage==='model')controller.abort();}});
 const result=await restore({source,evidence:{...clean,noise:'present'},registry,maxPixels:16384,signal:controller.signal,onProgress:event=>{if(point==='after-load'&&event.stage==='cleanup'&&event.state==='running')controller.abort();}});
 assert.equal(result.status,'cancelled');assert.equal(hash(result.image.data),hash(source.data));
 assert.equal(stats.loads,point==='before-load'?0:1);assert.equal(stats.releases,stats.loads);assert.equal(stats.runs,point==='after-inference'?1:0);
 failures.push({case:`cancel-${point}`,pass:true,stats});
}
// Contradictory evidence must not cause transparency to be silently flattened.
const transparent={...source,data:source.data.slice()};transparent.data[3]=0;
{
 const {registry,stats}=registryForTrial({modelPath:model,ortPackage});
 const result=await restore({source:transparent,evidence:{...clean,noise:'present'},registry,maxPixels:16384});
 assert.equal(result.status,'fallback');assert.equal(hash(result.image.data),hash(transparent.data));assert.equal(stats.runs,0);assert.equal(stats.loads,1);assert.equal(stats.releases,1);
 failures.push({case:'undeclared-alpha',pass:true,stats});
}
{
 const {registry,stats}=registryForTrial({modelPath:model,ortPackage});
 await assert.rejects(restore({source,evidence:{...clean,noise:'present'},registry,maxPixels:1}),/over-budget/);
 assert.equal(stats.loads,0);failures.push({case:'pixel-budget',pass:true});
}
const report={kind:'isolated-guarded-cleanup',production:false,acceptance:'NOT_EVALUATED',backend:'Node ORT1.30 WASM + napi canvas; NOT browser/device',limitations:['Two public development sources, six cases','Portrait box manually annotated, not detector-verified','Text/alpha/grayscale/detector absence deliberately withheld','Diagnostic text=false overrides for raw comparisons; not verified text-safe','Uses existing face and final guards, not full production finishing pipeline','Pixel/error observations do not certify identity or usefulness'],rows,failures};
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
