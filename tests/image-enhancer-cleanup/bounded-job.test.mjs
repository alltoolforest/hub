import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedCleanupJob} from './bounded-job.mjs';
const source=()=>({width:1,height:1,data:new Uint8ClampedArray([50,60,70,255])});
const evidence={scratch:'absent',noise:'absent',compression:'absent',blur:'absent',lowResolution:'absent',lighting:'absent',fading:'absent',portrait:'absent',alpha:false,text:false};
const allowed={approved:true};
test('clean job snapshots original and evidence; repeated results cannot mutate cache',async()=>{
 const image=source(),e={...evidence},job=createBoundedCleanupJob({source:image,evidence:e,maxPixels:1});image.data.fill(0);e.noise='present';
 const a=await job.run();assert.equal(a.status,'unchanged');assert.equal(a.image.data[0],50);a.image.data.fill(0);
 assert.equal((await job.run()).image.data[0],50);
});
test('failed cleanup is bounded across concurrent and repeated attempts and releases',async()=>{
 let loads=0,releases=0;
 const registry={guard:{...allowed,load(){throw Error('Guard must not run');}},cleanup:{...allowed,async load(){loads++;return {async run(){throw Error('Inference failure');},async dispose(){releases++;}};}}};
 const job=createBoundedCleanupJob({source:source(),evidence:{...evidence,noise:'present'},registry,maxPixels:1});
 const results=await Promise.all([job.run(),job.run(),job.run()]);results.push(await job.run());
 for(const r of results){assert.equal(r.status,'fallback');assert.equal(r.image.data[0],50);}
 assert.equal(loads,1);assert.equal(releases,1);
});
test('cancelled job stays cancelled without loading on repeated calls',async()=>{
 const controller=new AbortController();controller.abort();
 const job=createBoundedCleanupJob({source:source(),evidence,signal:controller.signal,maxPixels:1});
 assert.equal((await job.run()).status,'cancelled');assert.equal((await job.run()).status,'cancelled');
});
