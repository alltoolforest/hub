import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSmallestVerifiedPDF,V3StrategyError}
  from '../assets/js/pdf-compressor-v3/strategy-selector.mjs';
const source=new Uint8Array(2000).fill(37);
const candidate=(size,destructive)=>async()=>({status:'compressed',
  bytes:new Uint8Array(size).fill(37),destructive});
const verifyResult=async()=>true;
const allowed=async()=>({allowed:true});
const run=options=>selectSmallestVerifiedPDF(source,{
  inspectRestrictions:allowed,verifyResult,
  nonFlatten:candidate(1500,false),raster:candidate(400,true),...options});
const hasCode=code=>error=>error instanceof V3StrategyError&&error.code===code;
test('without consent runs nonflatten only and preserves page programs',async()=>{
 let rasterRuns=0;
 const result=await run({raster:async()=>{rasterRuns++;return candidate(400,true)();}});
 assert.equal(result.selectedStrategy,'nonflatten');
 assert.equal(result.destructive,false);assert.equal(result.outputBytes,1500);
 assert.equal(rasterRuns,0);
});
test('with explicit consent chooses smallest verified candidate even if destructive',async()=>{
 const result=await run({allowDestructiveFlattening:true});
 assert.equal(result.selectedStrategy,'raster');assert.equal(result.outputBytes,400);
 assert.equal(result.savedBytes,1600);assert.equal(result.destructive,true);
 assert.equal(result.stages.length,2);
});
test('independent validator may reject an aggressive candidate without releasing it',async()=>{
 const result=await run({allowDestructiveFlattening:true,
  verifyResult:async({strategy})=>strategy==='nonflatten'});
 assert.equal(result.selectedStrategy,'nonflatten');
 assert.equal(result.stages[1].status,'failed-closed');
});
test('rejects missing safety dependencies and source security restrictions',async()=>{
 await assert.rejects(selectSmallestVerifiedPDF(source),hasCode('security-inspection-required'));
 await assert.rejects(run({inspectRestrictions:async()=>({allowed:false,code:'signed-pdf'})}),
  hasCode('signed-pdf'));
 await assert.rejects(run({verifyResult:undefined}),hasCode('independent-verification-required'));
});
test('does not misreport reductions when candidates expand or both fail',async()=>{
 const result=await run({nonFlatten:candidate(2100,false)});
 assert.equal(result.status,'no-smaller-verified-output');
 assert.equal(result.bytes,null);
 await assert.rejects(run({nonFlatten:candidate(1300,true)}),hasCode('flatten-consent-required'));
});
test('cancellation aborts all strategy attempts',async()=>{
 await assert.rejects(run({signal:AbortSignal.abort()}),hasCode('cancelled'));
});
