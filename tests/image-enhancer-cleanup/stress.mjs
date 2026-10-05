import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {registryForTrial,installCanvasHarness,frameOf,canvasOf,hash} from './adapter.mjs';
import {createBoundedCleanupJob} from './bounded-job.mjs';
const [fixtures,modelPath,ortPackage,reportPath]=process.argv.slice(2);
if(!reportPath)throw Error('Usage: stress.mjs FIXTURES MODEL ORT_PACKAGE REPORT_JSON');
installCanvasHarness();
const clean={scratch:'absent',noise:'absent',compression:'absent',blur:'absent',lowResolution:'absent',lighting:'absent',fading:'absent',portrait:'absent',alpha:false,text:false};
async function decode(bytes){const i=await loadImage(bytes),c=createCanvas(i.width,i.height);c.getContext('2d').drawImage(i,0,0);return frameOf(c);}
const load=path=>readFile(path).then(decode);
const jpeg=async(f,q)=>decode(canvasOf(f).toBuffer('image/jpeg',q));
function mae(a,b){let sum=0;for(let i=0;i<a.data.length;i++)if(i%4!==3)sum+=Math.abs(a.data[i]-b.data[i]);return sum/(a.width*a.height*3);}
function colorNoise(f){const out={...f,data:f.data.slice()};let seed=123456789;for(let i=0;i<out.data.length;i++)if(i%4!==3){seed=(Math.imul(seed,1664525)+1013904223)>>>0;out.data[i]+=Math.round((seed/4294967296-.5)*64);}return out;}
const rows=[];
for(const name of ['coffee','astronaut']){
 const reference=await load(resolve(fixtures,`${name}-reference.png`));
 const heavy=await jpeg(reference,15);let repeated=reference;for(const q of [35,20,15])repeated=await jpeg(repeated,q);
 const mixed=await load(resolve(fixtures,`${name}-mixed-input.png`));
 for(const [condition,source] of [['color-noise',colorNoise(reference)],['heavy-jpeg',heavy],['repeated-jpeg',repeated],['mixed-cleanup-only',mixed]]){
  const before=hash(source.data),evidence={...clean,noise:condition.includes('noise')||condition.includes('mixed')?'present':'absent',compression:condition.includes('jpeg')||condition.includes('mixed')?'present':'absent',portrait:name==='astronaut'?'present':'absent'};
  // Mixed case deliberately isolates cleanup. It is not a complete mixed route.
  const {registry,stats}=registryForTrial({modelPath,ortPackage,faces:name==='astronaut'?[{x:40,y:15,width:28,height:34,score:1}]:[],degradation:{diagnosis:{confidence:{noise:evidence.noise==='present'?1:0,compression:evidence.compression==='present'?1:0}}}});
  const job=createBoundedCleanupJob({source,evidence,registry,maxPixels:16384});
  const [first,concurrent]=await Promise.all([job.run(),job.run()]);
  assert.equal(hash(first.image.data),hash(concurrent.image.data));assert.equal(stats.runs,1);assert.equal(stats.loads,1);assert.equal(stats.releases,1);assert.equal(hash(source.data),before);
  assert.ok(['success','limited','unchanged'].includes(first.status));
  const outputHash=hash(first.image.data),outputMae=mae(first.image,reference);
  first.image.data.fill(0);first.completed.push('caller-mutation');
  const repeatedCall=await job.run();assert.equal(hash(repeatedCall.image.data),outputHash);assert.equal(stats.runs,1);assert.ok(!repeatedCall.completed.includes('caller-mutation'));
  rows.push({name,condition,status:repeatedCall.status,inputHash:before,outputHash,inputMae:mae(source,reference),outputMae,stats,boundedRepeatPass:true});
 }
}
// Preserve honest fallback for a real mixed request: no Task 5 adapter is added.
const source=await load(resolve(fixtures,'coffee-mixed-input.png'));
const {registry,stats}=registryForTrial({modelPath,ortPackage});
const job=createBoundedCleanupJob({source,evidence:{...clean,noise:'present',blur:'present'},registry,maxPixels:16384});
const result=await job.run();assert.equal(result.status,'fallback');assert.equal(hash(result.image.data),hash(source.data));assert.ok(result.diagnostics.includes('unavailable:deblur'));assert.equal(stats.loads,stats.releases);
const report={task:4,production:false,acceptance:'NOT_EVALUATED',cases:rows,checks:{mixedRouteHonestFallback:true},limitations:['Two development sources; no held-out acceptance','Synthetic color noise and JPEG qualities 15 / 35-20-15','Mixed case isolates cleanup; complete mixed route falls back without deblur','Manual face box and diagnostic text=false; no detector or text-safety certification','Bound applies within one job; re-upload/new job not recognized','Node WASM/native canvas; no physical device or human quality acceptance']};
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
