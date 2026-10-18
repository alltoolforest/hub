import assert from 'node:assert/strict';
import {assessVisualGeometry,compareVisualGeometry} from '../src/export/visual-geometry-validator.js';
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const r=(text,left,top,right,bottom,baseline=(top+bottom)/2)=>({text,left,top,right,bottom,baseline,angle:0});

test('clean stacked text has no visual failures',()=>{
  const result=assessVisualGeometry([r('Alpha',10,10,80,22,20),r('Beta',10,30,70,42,40)],{width:200,height:200});
  assert.equal(result.outOfBounds.length,0);assert.equal(result.collisions.length,0);assert.equal(result.duplicates.length,0);
});

test('text outside page bounds is detected',()=>{
  const result=assessVisualGeometry([r('Overflow',180,10,230,22,20)],{width:200,height:200});
  assert.equal(result.outOfBounds.length,1);
});

test('same text drawn twice in same box is a duplicate',()=>{
  const result=assessVisualGeometry([r('Same',10,10,80,24,21),r('Same',10.2,10.1,80.2,24.1,21.1)],{width:200,height:200});
  assert.equal(result.duplicates.length,1);
});

test('different lines materially overlapping are collisions',()=>{
  const result=assessVisualGeometry([r('Upper',10,10,100,22,20),r('Lower',20,16,90,28,26)],{width:200,height:200});
  assert.equal(result.collisions.length,1);
});

test('normal same-baseline text fragments are not collisions',()=>{
  const result=assessVisualGeometry([r('Hello',10,10,55,22,20),r('world',50,10,95,22,20.2)],{width:200,height:200});
  assert.equal(result.collisions.length,0);
});

test('pre-existing collision count is tolerated when output does not worsen',()=>{
  const baseline=assessVisualGeometry([r('Upper',10,10,100,22,20),r('Lower',20,16,90,28,26)],{width:200,height:200});
  const output=assessVisualGeometry([r('Upper',12,12,102,24,22),r('Lower',22,18,92,30,28)],{width:200,height:200});
  assert.equal(compareVisualGeometry(output,baseline).ok,true);
});

test('new collision relative to clean baseline fails',()=>{
  const baseline=assessVisualGeometry([r('Upper',10,10,100,22,20),r('Lower',10,32,90,44,42)],{width:200,height:200});
  const output=assessVisualGeometry([r('Upper',10,10,100,22,20),r('Lower',20,16,90,28,26)],{width:200,height:200});
  const compared=compareVisualGeometry(output,baseline);assert.equal(compared.ok,false);assert.equal(compared.failures[0].code,'VISUAL_TEXT_COLLISION');
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
