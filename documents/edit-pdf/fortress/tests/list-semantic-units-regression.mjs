import assert from 'node:assert/strict';
import {isListMarkerRun,findOwnedListMarker,findListContinuationRuns,resolveListSemanticUnit,listRunKey} from '../src/export/list-semantic-units.js';

const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const run=(text,x,y,{size=11,advance=8,index=0}={})=>({text,x,y,fontSize:size,advance,operatorIndex:index,streamIndex:0});

test('recognizes symbol numbered and letter markers',()=>{
  for(const value of ['•','▪','1.','12)','A.','b)'])assert.equal(isListMarkerRun(run(value,50,600)),true,value);
  assert.equal(isListMarkerRun(run('Role',50,600)),false);
});

test('wrapped bullet owns marker on first baseline',()=>{
  const runs=[run('•',60,600,{index:1}),run('Handling client queries',82,600,{index:2}),run('regarding credit cards',82,586,{index:3}),run('•',60,572,{index:4}),run('Next bullet',82,572,{index:5})];
  const result=resolveListSemanticUnit({runs,claimed:new Set([listRunKey(runs[1])]),baseline:600,left:82,size:11});
  assert.equal(result.ok,true);assert.equal(result.marker.operatorIndex,1);assert.deepEqual(result.continuationRuns.map(r=>r.operatorIndex),[3]);
});

test('next marker stops continuation ownership',()=>{
  const runs=[run('•',60,600,{index:1}),run('First',82,600,{index:2}),run('continued',82,586,{index:3}),run('•',60,572,{index:4}),run('Second',82,572,{index:5}),run('continued second',82,558,{index:6})];
  const continuation=findListContinuationRuns({runs,claimed:new Set([listRunKey(runs[1])]),baseline:600,left:82,size:11});
  assert.deepEqual(continuation.map(r=>r.operatorIndex),[3]);
});

test('numbered list marker is associated without stealing previous row',()=>{
  const runs=[run('1.',55,600,{index:1}),run('Alpha',82,600,{index:2}),run('2.',55,580,{index:3}),run('Beta',82,580,{index:4})];
  const result=findOwnedListMarker({runs,claimed:new Set([listRunKey(runs[4])]),baseline:580,left:82,size:11});
  assert.equal(result.ok,true);assert.equal(result.marker.operatorIndex,3);
});

test('claimed continuation is not duplicated',()=>{
  const runs=[run('•',60,600,{index:1}),run('First',82,600,{index:2}),run('continued',82,586,{index:3})];
  const claimed=new Set([listRunKey(runs[1]),listRunKey(runs[2])]);
  const result=resolveListSemanticUnit({runs,claimed,baseline:600,left:82,size:11});
  assert.equal(result.ok,true);assert.equal(result.continuationRuns.length,0);
});

test('large vertical gap prevents paragraph theft',()=>{
  const runs=[run('•',60,600,{index:1}),run('Bullet',82,600,{index:2}),run('Unrelated paragraph',82,550,{index:3})];
  const result=resolveListSemanticUnit({runs,claimed:new Set([listRunKey(runs[1])]),baseline:600,left:82,size:11});
  assert.equal(result.ok,true);assert.equal(result.continuationRuns.length,0);
});

test('two equally plausible markers fail closed',()=>{
  const runs=[run('•',58,600,{index:1,advance:6}),run('▪',59,600,{index:2,advance:6}),run('Text',82,600,{index:3})];
  const result=findOwnedListMarker({runs,claimed:new Set([listRunKey(runs[2])]),baseline:600,left:82,size:11});
  assert.equal(result.ok,false);assert.equal(result.reason,'LIST_MARKER_OWNERSHIP_AMBIGUOUS');
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
