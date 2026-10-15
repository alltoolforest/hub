import test from 'node:test';
import assert from 'node:assert/strict';
import {compressToTarget,profileAttempts,validateTargetSize} from '../assets/js/pdf-compressor-v2/target-size-compression.mjs';
const source=new Uint8Array(500).fill(11);
const verified=(size,mode)=>({bytes:new Uint8Array(size).fill(7),mode,
  inputBytes:500,outputBytes:size,savedBytes:500-size,status:'compressed',
  integrity:{version:1,mode,inputBytes:500,outputBytes:size,savedBytes:500-size,
    independentTextVerified:true,sourceDigest:'source-digest',outputDigest:'verified-output-digest'},
  settings:{imageTransformationApplied:true,jpegQuality:mode==='maximum'?.42:.68}});
function engine(outSizes,calls){
  return async(_,{mode})=>{calls.push(mode);return verified(outSizes[mode],mode);};
}
test('target cap tries only approved stronger profiles, stops on success and preserves receipts',async()=>{
 const calls=[];
 const early=await compressToTarget(source,{mode:'strong',targetBytes:450,
   runVerified:engine({balanced:420,strong:310},calls)});
 assert.deepEqual(calls,['balanced']);
 assert.equal(early.mode,'strong');
 assert.equal(early.target.effectiveMode,'balanced');
 assert.equal(early.settings.effectiveMode,'balanced');
 assert.equal(early.integrity.mode,'strong');
 assert.equal(early.integrity.sourceDigest,'source-digest');
 assert.equal(early.target.reached,true);
 assert.equal(early.bytes.length,420);
 const next=[];
 const tight=await compressToTarget(source,{mode:'maximum',targetBytes:300,
   runVerified:engine({strong:420,maximum:260},next)});
 assert.deepEqual(next,['strong','maximum']);
 assert.equal(tight.target.reached,true);
 assert.equal(tight.bytes.length,260);
 assert.equal(tight.target.effectiveMode,'maximum');
 assert.deepEqual(tight.target.attempts.map(x=>x.outputBytes),[420,260]);
});
test('unreachable requested size returns best independently verified output without fabricated promise',async()=>{
 const calls=[];
 const r=await compressToTarget(source,{mode:'maximum',targetBytes:100,
   runVerified:engine({strong:370,maximum:395},calls)});
 assert.deepEqual(calls,['maximum','strong']);
 assert.equal(r.target.reached,false);
 assert.equal(r.bytes.length,370);
 assert.equal(r.target.effectiveMode,'strong');
 assert.equal(r.integrity.outputBytes,370);
});
test('aggressive Maximum target starts with the fully verified Maximum engine and skips Strong if reached',async()=>{
 const calls=[];
 const r=await compressToTarget(source,{mode:'maximum',targetBytes:150,
   runVerified:engine({strong:210,maximum:120},calls)});
 assert.deepEqual(calls,['maximum']);
 assert.deepEqual(r.target.attempts.map(a=>a.profile),['maximum']);
 assert.equal(r.target.reached,true);
 assert.equal(r.bytes.length,120);
 assert.equal(r.integrity.independentTextVerified,true);
 assert.equal(r.integrity.outputBytes,r.outputBytes);
 assert.equal(r.target.effectiveMode,'maximum');
});
test('moderate Maximum targets still prefer Strong first to preserve image detail',async()=>{
 const calls=[];
 const r=await compressToTarget(source,{mode:'maximum',targetBytes:225,
   runVerified:engine({strong:210,maximum:120},calls)});
 assert.deepEqual(calls,['strong']);
 assert.equal(r.target.effectiveMode,'strong');
 assert.equal(r.bytes.length,210);
});
test('aggressive Maximum failure still compares Strong and returns the smallest verified candidate',async()=>{
 const calls=[];
 const r=await compressToTarget(source,{mode:'maximum',targetBytes:100,
   runVerified:engine({maximum:395,strong:370},calls)});
 assert.deepEqual(calls,['maximum','strong']);
 assert.equal(r.target.reached,false);
 assert.equal(r.target.effectiveMode,'strong');
 assert.equal(r.bytes.length,370);
});
test('stage diagnostics include time spent in every verified target-size attempt',async()=>{
 const perPass={inspectionMs:120,imageMs:4000,losslessMs:2500,finalVerificationMs:1300};
 const result=await compressToTarget(source,{mode:'maximum',targetBytes:100,
  runVerified:async(_, {mode})=>({...verified(mode==='maximum'?400:350,mode),stageTimings:perPass})});
 assert.deepEqual(result.stageTimings,{inspectionMs:240,imageMs:8000,losslessMs:5000,finalVerificationMs:2600});
 assert.equal(result.target.attempts.length,2);
 assert.equal(result.target.reached,false);
});
test('unchanged original may be returned if no profile makes a smaller verified result',async()=>{
 const calls=[];
 const r=await compressToTarget(source,{mode:'balanced',targetBytes:100,runVerified:async (_, {mode})=>{
   calls.push(mode);
   return {...verified(500,mode),status:'original-retained'};
 }});
 assert.deepEqual(calls,['balanced']);
 assert.equal(r.target.reached,false);
 assert.equal(r.bytes.length,500);
});
test('reject invalid, non-lossy or unverified target operations',async()=>{
 for(const target of [NaN,Infinity,0,-3,1.5,100000001,'20000',undefined]){
  assert.throws(()=>validateTargetSize(target,{sourceBytes:500,mode:'strong'}),e=>e.code==='invalid-target-size');
 }
 assert.throws(()=>validateTargetSize(200,{sourceBytes:500,mode:'lossless'}),e=>e.code==='target-requires-lossy-mode');
 for(const invalid of [{...verified(310,'strong'),integrity:{...verified(310,'strong').integrity,independentTextVerified:false}},
   {...verified(310,'strong'),bytes:new Uint8Array(600)},
   {...verified(310,'maximum')}])
   await assert.rejects(compressToTarget(source,{mode:'strong',targetBytes:100,runVerified:async()=>invalid}),
     e=>e.code==='invalid-verified-target-candidate');
 assert.deepEqual(profileAttempts.strong,['balanced','strong']);
});
test('cancellation interrupts profile retries without releasing an unverified output',async()=>{
 const controller=new AbortController(),calls=[];
 await assert.rejects(compressToTarget(source,{mode:'strong',targetBytes:100,
   signal:controller.signal,runVerified:async(_, {mode})=>{
     calls.push(mode);controller.abort();return verified(400,mode);
   }}),e=>e.code==='cancelled');
 assert.deepEqual(calls,['balanced']);
});
