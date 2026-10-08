import test from 'node:test';
import assert from 'node:assert/strict';
import {viewIndices,addRow,deleteRow,addColumn,deleteColumn,removeDuplicateKeys} from '../assets/js/csv-operations.js';
const sample=[['id','name'],['1','Bob'],['2','Ana'],['3','Bob'],['4','Cam']];
test('search and filter preserve source and original indices',()=>{
 assert.deepEqual(viewIndices(sample,{header:true,search:'Bob'}),[1,3]);
 assert.deepEqual(viewIndices(sample,{header:true,filterColumn:1,filterText:'cam'}),[4]);
 assert.equal(sample.length,5);
});
test('sort changes only view order',()=>{
 assert.deepEqual(viewIndices(sample,{header:true,sortColumn:1}),[2,1,3,4]);
 assert.equal(sample[1][1],'Bob');
});
test('row and column operations are pure',()=>{
 assert.equal(addRow(sample).length,6);
 assert.equal(deleteRow(sample,2,{header:true}).length,4);
 assert.equal(addColumn(sample)[0].length,3);
 assert.equal(deleteColumn(sample,0)[1][0],'Bob');
 assert.deepEqual(sample[2],['2','Ana']);
});
test('header row protected against deletion',()=>assert.throws(()=>deleteRow(sample,0,{header:true}),/Header/));
test('selected-key deduplication removes matching rows only',()=>{
 const out=removeDuplicateKeys(sample,[1],{header:true});
 assert.equal(out.removed,1);
 assert.deepEqual(out.rows.map(row=>row[1]),['name','Bob','Ana','Cam']);
});
test('limits and invalid column selection rejected',()=>{
 assert.throws(()=>addRow(Array.from({length:2000},()=>['x'])),/Maximum/);
 assert.throws(()=>removeDuplicateKeys(sample,[],{header:true}),/Select/);
});
