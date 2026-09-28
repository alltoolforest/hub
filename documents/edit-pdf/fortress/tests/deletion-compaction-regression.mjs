import assert from 'node:assert/strict';
import {isSemanticDeletion,deletedVisualLineCount,planDeletionCompaction,expandDeletionCompactionTransactions} from '../src/export/deletion-compaction-plan.js';

const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const tx=(lines,replacement='')=>({id:'delete-1',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'bullet text',replacementUnicode:replacement,block:{id:'block-1',bounds:{x:100,y:550,width:300,height:60},fontSize:11,lines:Array.from({length:lines},(_,i)=>({text:`line ${i+1}`,y:600-i*14,minX:100,maxX:360,fontSize:11}))}});

test('one-line deletion releases one pitch',()=>{
  const result=planDeletionCompaction(tx(1),{pitch:14,maxSafeShift:14,fontSize:11});
  assert.equal(result.ok,true);assert.equal(result.lineCount,1);assert.equal(result.shiftY,14);
});

test('wrapped three-line bullet reports three visual lines',()=>{
  assert.equal(deletedVisualLineCount(tx(3)),3);
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

test('multi-line deletion expands into one compaction transaction per visual line',()=>{
  const expanded=expandDeletionCompactionTransactions([tx(3)]);
  assert.equal(expanded.length,3);
  assert.deepEqual(expanded.map(item=>item.compactionLineIndex),[0,1,2]);
  assert.deepEqual(expanded.map(item=>item.block.lines.length),[1,1,1]);
  assert.deepEqual(expanded.map(item=>item.block.lines[0].y),[600,586,572]);
  assert.ok(expanded.every(item=>item.compactionOnly&&item.compactionOf==='delete-1'));
});

test('ordinary transactions remain object-identical in the expanded list',()=>{
  const ordinary={id:'insert',kind:'INSERT_TEXT'};
  const expanded=expandDeletionCompactionTransactions([ordinary]);
  assert.equal(expanded[0],ordinary);
});

console.log(`PASS ${cases.length}/${cases.length}`);for(const name of cases)console.log(`✓ ${name}`);
