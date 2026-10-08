import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_SIZE,pageWindow} from '../assets/js/csv-table-page.js';
test('bounded pages for maximum supported CSV',()=>{
 assert.equal(PAGE_SIZE,50);
 const first=pageWindow(2000,false,0),last=pageWindow(2000,false,39);
 assert.deepEqual([first.from,first.to,last.from,last.to],[0,50,1950,2000]);
});
test('header excluded from editable data pages but retained in model',()=>{
 const first=pageWindow(2000,true,0),last=pageWindow(2000,true,39);
 assert.equal(first.from,1);assert.equal(first.to,51);
 assert.equal(last.to,2000);assert.equal(first.count,1999);
});
test('out-of-range page clamps without indexing missing rows',()=>{
 assert.equal(pageWindow(80,false,-10).page,0);
 assert.equal(pageWindow(80,false,900).page,1);
 assert.equal(pageWindow(0,false,1).to,0);
});
test('no row duplication or omission across pages',()=>{
 for(const header of [false,true]){
  const seen=[];
  const total=2000,parts=pageWindow(total,header,0).pages;
  for(let p=0;p<parts;p++){
    const w=pageWindow(total,header,p);
    for(let i=w.from;i<w.to;i++)seen.push(i);
  }
  assert.equal(seen.length,total-(header?1:0));
  assert.equal(new Set(seen).size,seen.length);
 }
});
