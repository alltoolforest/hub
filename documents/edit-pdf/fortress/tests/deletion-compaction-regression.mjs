import assert from 'node:assert/strict';
import {isSemanticDeletion,deletedVisualLineCount,planDeletionCompaction} from '../src/export/deletion-compaction-plan.js';

const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const tx=(lines,replacement='')=>({kind:'REPLACE_TEXT',originalUnicode:'bullet text',replacementUnicode:replacement,block:{lines:Array.from({length:lines},(_,i)=>({text:`line ${i+1}`,y:600-i*14}))}});

test('one-line deletion releases one pitch',()=>{
  const result=planDeletionCompaction(tx(1),{pitch:14,maxSafeShift:14,fontSize:11});
  assert.equal(result.ok,true);assert.equal(result.lineCount,1);assert.equal(result.shiftY,14);
});

test('wrapped three-line bullet releases three pitches',()=>{
  const result=planDeletionCompaction(tx(3),{pitch:14,maxSafeShift:42,fontSize:11});
  assert.equal(result.ok,true);assert.equal(result.lineCount,3);assert.equal(result.shiftY,42);
});

test('insufficient measured released space fails closed',()=>{
  const result=planDeletionCompaction(tx(3),{pitch:14,maxSafeShift:24,fontSize:11});
  assert.equal(result.ok,false);assert.equal(result.reason,'COMPACTION_RELEASE_GEOMETRY_MISMATCH');
});

test('non-deletion is ignored',()=>{
  const value=tx(2,'replacement');
  assert.equal(isSemanticDeletion(value),false);assert.equal(deletedVisualLineCount(value),0);
});

test('empty visual metadata still counts as one deleted row',()=>{
  const value={kind:'REPLACE_TEXT',originalUnicode:'x',replacementUnicode:'',block:{lines:[]}};
  assert.equal(deletedVisualLineCount(value),1);
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
