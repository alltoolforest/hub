import test from'node:test';import assert from'node:assert/strict';import{memoryPlan,preflightFile}from'../assets/js/photo-budget.js';
const png=(w,h)=>{const b=new Uint8Array(33);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(16,w);v.setUint32(20,h);return new Blob([b],{type:'image/png'});};
test('32MP allowed with sufficient budget, refused under default',()=>{const p=memoryPlan(6400,5000,{memoryBudgetMiB:512});assert.ok(p.estimatedBytes<=p.budgetBytes);assert.throws(()=>memoryPlan(6400,5000),/memory budget/);});
test('working strips bounded across widths',()=>{for(const w of[1,1200,6400,16384]){const p=memoryPlan(w,1,{memoryBudgetMiB:512});assert.ok(w*(p.rows+20)*32<=24*1024*1024);}});
test('reject malformed/oversized before decode',async()=>{await assert.rejects(preflightFile(new Blob(['x'])));await assert.rejects(preflightFile(png(6401,5000)));assert.deepEqual(await preflightFile(png(6400,5000)),{width:6400,height:5000,mime:'image/png'});});
test('retained blobs count toward budget',()=>{assert.throws(()=>memoryPlan(1000,1000,{memoryBudgetMiB:64,retainedBytes:50*1024*1024}),/memory budget/);});
test('32MP lab setting includes preview and retained PNG memory',()=>{const p=memoryPlan(6400,5000,{memoryBudgetMiB:768,retainedBytes:128000000*2+8000000});assert.ok(p.estimatedBytes<p.budgetBytes);});
