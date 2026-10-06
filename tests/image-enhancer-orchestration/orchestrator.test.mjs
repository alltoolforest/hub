import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planRestoration, restore} from './orchestrator.mjs';
const clean = {scratch:'absent', noise:'absent', compression:'absent', blur:'absent', lowResolution:'absent', lighting:'absent', fading:'absent', portrait:'absent', alpha:false, text:false};
const frame = () => ({width:2,height:1,data:new Uint8ClampedArray([20,30,40,255,50,60,70,128])});
function adapter(run, extras={}) { return {approved:true,preservesAlpha:true,preservesText:true,preservesGrayscale:true,detectorIndependent:true,load:async()=>({run:run ?? (async ({image})=>({image,status:'unchanged',aiExecuted:false})),dispose:async()=>{}}),...extras}; }
const run = opts => restore({source:frame(),evidence:clean,maxPixels:100,...opts});
test('all category routes and mixed damage select necessary stages only',()=>{
 const cases = [['blur',['deblur']],['noise',['cleanup']],['compression',['cleanup']],['lowResolution',['upscale']],['scratch',['repair']],['fading',['tone']],['lighting',['tone']]];
 for (const [key, stages] of cases) assert.deepEqual(planRestoration({...clean,[key]:'present'}).stages,stages);
 assert.deepEqual(planRestoration({...clean,noise:'present',blur:'present',portrait:'present',lighting:'present'}).stages,['cleanup','deblur','portrait','tone']);
 assert.deepEqual(planRestoration({...clean,grayscale:true}).stages,[]);
 assert.deepEqual(planRestoration({...clean,grayscale:true},{colorize:true}).stages,['colorize']);
});
test('uncertainty and severe inputs do not force reconstruction',()=>{
 assert.deepEqual(planRestoration({...clean,blur:'uncertain'}).stages,[]);
 const p=planRestoration({...clean,blur:'present',severe:true,lighting:'present'},{scale:4});
 assert.deepEqual(p.stages,['tone']); assert.ok(p.limitations.includes('severe:source-limited'));
 assert.throws(()=>planRestoration({...clean,blur:'yes'}));
});
test('clean input loads nothing and returns independent unchanged output',async()=>{
 const source=frame(); let loads=0;
 const r=await run({source,registry:{guard:adapter(null,{load:async()=>{loads++;}})}});
 assert.equal(r.status,'unchanged'); assert.equal(loads,0); assert.notEqual(r.image.data,source.data);
});
test('selected stages execute in order, dispose, and exclude unrelated models',async()=>{
 const events=[]; const registry={};
 for(const id of ['cleanup','tone','guard','upscale']) registry[id]=adapter(null,{load:async()=>{events.push('load:'+id);return {run:async({image})=>{image.data[0]++;return {image,status:'processed',aiExecuted:true};},dispose:async()=>events.push('dispose:'+id)};}});
 const r=await run({evidence:{...clean,noise:'present',lighting:'present'},registry});
 assert.equal(r.status,'success');assert.equal(r.aiExecuted,true);
 assert.deepEqual(events,['load:cleanup','dispose:cleanup','load:tone','dispose:tone','load:guard','dispose:guard']);
});
test('unvalidated cleanup/deblur composition returns original before any model loads',async()=>{
 let loads=0;const registry={};
 for(const id of ['cleanup','deblur','portrait','tone','guard']) registry[id]=adapter(null,{load:async()=>{loads++;throw Error('must not load');}});
 for(const key of ['noise','compression']) {
  const source=frame(),expected=frame();
  const result=await run({source,evidence:{...clean,[key]:'present',blur:'present',portrait:'present',lighting:'present'},registry});
  assert.equal(result.status,'fallback');assert.equal(result.aiExecuted,false);
  assert.deepEqual(result.completed,[]);assert.deepEqual(result.image,expected);
  assert.notEqual(result.image.data,source.data);assert.deepEqual(source,expected);
  assert.ok(result.diagnostics.includes('unvalidated-composition:cleanup-deblur'));
 }
 assert.equal(loads,0);
});
test('mutating stage failure cannot overwrite caller or fallback original',async()=>{
 const source=frame(), expected=frame();let disposed=0;
 const r=await run({source,evidence:{...clean,blur:'present'},registry:{guard:adapter(),deblur:adapter(null,{load:async()=>({run:async({image,original})=>{image.data.fill(0);original.data.fill(0);throw Error('failure');},dispose:async()=>disposed++})})}});
 assert.equal(r.status,'fallback');assert.deepEqual(source,expected);assert.deepEqual(r.image,expected);assert.equal(disposed,1);
});
test('missing guard and unsupported detector fallback never load reconstruction',async()=>{
 let loads=0;const deblur=adapter(null,{detectorIndependent:false,load:async()=>{loads++;}});
 for(const registry of [{deblur},{deblur,guard:adapter()}]) {
  const r=await run({evidence:{...clean,blur:'present',portrait:'unavailable'},registry});assert.equal(r.status,'fallback');
 } assert.equal(loads,0);
});
test('alpha mutation and false unchanged status are rejected',async()=>{
 for(const mode of ['alpha','unchanged']){
  const r=await run({evidence:{...clean,alpha:true,blur:'present'},registry:{guard:adapter(),deblur:adapter(async({image})=>{image.data[mode==='alpha'?3:0]=0;return {image,status:mode==='alpha'?'processed':'unchanged',aiExecuted:true};})}});
  assert.equal(r.status,'fallback');assert.deepEqual(r.image,frame());
 }
});
test('cancel during loading disposes returned adapter and never runs it',async()=>{
 const c=new AbortController();let disposed=0,runs=0;
 const r=await run({signal:c.signal,evidence:{...clean,blur:'present'},registry:{guard:adapter(),deblur:adapter(null,{load:async()=>{c.abort();return {run:async()=>runs++,dispose:async()=>disposed++};}})}});
 assert.equal(r.status,'cancelled');assert.equal(disposed,1);assert.equal(runs,0);
});
test('cancel during inference releases resources and rejects late result',async()=>{
 const c=new AbortController();let disposed=0;
 const r=await run({signal:c.signal,evidence:{...clean,blur:'present'},registry:{guard:adapter(),deblur:adapter(null,{load:async()=>({run:async({image})=>{c.abort();image.data.fill(0);return {image,status:'processed',aiExecuted:true};},dispose:async()=>disposed++})})}});
 assert.equal(r.status,'cancelled');assert.equal(disposed,1);assert.deepEqual(r.image,frame());
});
test('progress observer exceptions do not break processing',async()=>{
 const r=await run({evidence:{...clean,blur:'present'},onProgress:()=>{throw Error('observer');},registry:{deblur:adapter(),guard:adapter()}});assert.equal(r.status,'unchanged');
});
test('wrong output size, exhausted budget and stage fallback return original',async()=>{
 for(const kind of ['size','budget','fallback']){
 const r=await run({evidence:{...clean,lowResolution:'present'},controls:{scale:2},registry:{guard:adapter(),upscale:adapter(async({image})=>({image:kind==='budget'?{width:101,height:1,data:new Uint8ClampedArray(404)}:image,status:kind==='fallback'?'fallback':'processed',aiExecuted:false}))}});
 assert.equal(r.status,'fallback');assert.deepEqual(r.image,frame());
 }
});
test('explicit budgets and valid frames are mandatory',async()=>{
 await assert.rejects(run({maxPixels:undefined}));await assert.rejects(run({source:{...frame(),width:-1}}));
});
