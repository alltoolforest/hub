import test from 'node:test';
import assert from 'node:assert/strict';
import {pageWindow} from '../assets/js/csv-table-page.js';
import {viewIndices,removeDuplicateKeys} from '../assets/js/csv-operations.js';
import {transformRows,CsvHistory,csvExportCheck} from '../assets/js/csv-cleaning.js';
import {decodeCsvBytes} from '../assets/js/csv-import.js';

test('maximum CSV pagination never skips or duplicates records',()=>{
 const seen=[];
 for(let p=0;p<40;p++){const w=pageWindow(2000,false,p);for(let i=w.from;i<w.to;i++)seen.push(i);}
 assert.equal(seen.length,2000);assert.equal(new Set(seen).size,2000);
});
test('filter with pagination returns correct underlying row identities',()=>{
 const data=Array.from({length:101},(_,i)=>[String(i),i%2?'odd':'even']);
 const indexes=viewIndices(data,{filterColumn:1,filterText:'odd'});
 assert.equal(indexes.length,50);assert.equal(indexes[0],1);assert.equal(indexes.at(-1),99);
 assert.equal(pageWindow(indexes.length,false,0).to,50);
});
test('clean and deduplicate can be undone without changing original values',()=>{
 const original=[['heading'],[' a '],[' a ']],history=new CsvHistory();
 const trimmed=transformRows(original,'trim',{header:true});history.record(original);
 const dedup=removeDuplicateKeys(trimmed.rows,[0],{header:true});history.record(trimmed.rows);
 assert.equal(dedup.removed,1);
 assert.deepEqual(history.undo(dedup.rows),trimmed.rows);
 assert.equal(original[1][0],' a ');
});
test('number and phone values survive formula scan, formulas are flagged',()=>{
 assert.deepEqual(csvExportCheck([['-125.50','+91 9876543210','=2+2']]),[[1,3]]);
});
test('invalid UTF8 is explicitly rejected',()=>{
 assert.throws(()=>decodeCsvBytes(new Uint8Array([0x80])),/not valid UTF-8/);
});
test('sorted view does not mutate source or export order',()=>{
 const rows=[['2','B'],['1','A']];
 assert.deepEqual(viewIndices(rows,{sortColumn:0}),[1,0]);
 assert.deepEqual(rows,[['2','B'],['1','A']]);
});
