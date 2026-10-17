/* Focused Node regression checks for the isolated PDF Splitter V3.1 core. */
const assert=require('node:assert/strict');
const C=require('../documents/pdf-splitter/engine-core.js');
(async()=>{
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS',name)}
await test('parse reversed/open-ended ranges',()=>assert.deepEqual(C.parseRanges('5-1,8-',10).map(x=>x.pages),[[4,3,2,1,0],[7,8,9]]));
await test('deduplicate across ranges',()=>assert.deepEqual(C.parseRanges('1-3,2-4',5).map(x=>x.pages),[[0,1,2],[3]]));
await test('allow duplicate pages',()=>assert.deepEqual(C.parseRanges('1-2,2-3',3,{allowDup:true}).map(x=>x.pages),[[0,1],[1,2]]));
await test('reject empty range groups',()=>assert.throws(()=>C.parseRanges('1,,3',5)));
await test('equal parts',()=>assert.deepEqual(C.planParts(11,3).map(x=>x.length),[4,4,3]));
await test('every N pages',()=>assert.deepEqual(C.planEvery(10,3).map(x=>x.length),[3,3,3,1]));
await test('remove selected pages',()=>assert.deepEqual(C.planRemove(5,new Set([1,3]))[0],[0,2,4]));
await test('bookmark coverage',()=>assert.deepEqual(C.planBookmarks([{page:2,level:1,title:'A'},{page:5,level:1,title:'B'}],8,1).flatMap(x=>x.pages),C.range(0,7)));
await test('rotation',()=>{assert.equal(C.rotate(90,180),270);assert.equal(C.rotate(0,-90),270)});
await test('atomic begin on invalid state',()=>{const j=new C.JobController();assert.throws(()=>j.begin({}));assert.equal(j.id,0);assert.equal(j.cfg,null)});
await test('reset announces state change',()=>{const j=new C.JobController();let n=0;j.on(()=>n++);j.reset();assert.equal(n,1)});
await test('immutable configuration and stale-result suppression',()=>{
const j=new C.JobController();j.go('loading');j.go('validating');j.go('ready');
const original={pages:[1,2]};const id=j.begin(original);original.pages.push(3);assert.deepEqual(j.cfg.pages,[1,2]);j.go('splitting');j.cancel();assert.equal(j.publish(id,()=>{}),false);j.settleCancel();
});
await test('size fitting and cleanup',async()=>{
let released=0;const r=await C.fitChunk(0,10,50,async(s,k)=>({size:k*10,art:k}),()=>released++);
assert.equal(r.count,5);assert.equal(r.size,50);assert.ok(released>0);
});
await test('single oversize page measured once',async()=>{
let attempts=0;const r=await C.fitChunk(0,4,50,async(s,k)=>{attempts++;return {size:k*80,art:k}});
assert.equal(attempts,1);assert.equal(r.count,1);assert.equal(r.oversize,true);
});
await test('cancellation disposes retained candidate',async()=>{
let checks=0;const released=[];
await assert.rejects(C.fitChunk(0,20,100,async(s,k)=>({size:k,art:k}),v=>released.push(v),()=>{if(++checks===3)throw Error('cancelled')}));assert.ok(released.includes(1));
});
console.log(passed+' focused core tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
