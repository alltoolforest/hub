import assert from 'node:assert/strict';
import {prepareTableCellTransactions} from '../src/export/table-cell-safety.js';

const bytes=new Uint8Array([37,80,68,70]);
const insert={id:'insert-1',kind:'INSERT_TEXT',pageIndex:0,x:120,y:500,replacementUnicode:'Safe text'};
const replace={id:'replace-1',kind:'REPLACE_TEXT',pageIndex:0,block:{bounds:{x:100,y:490,width:80,height:14}}};

let code='';
try{
  await prepareTableCellTransactions(bytes,[insert],{
    loadRuntime:async()=>{throw new Error('renderer unavailable');},
  });
}catch(error){code=error?.code||'';}
assert.equal(code,'TABLE_CELL_ANALYSIS_FAILED','Runtime analysis failure must fail closed.');

const fakePdf={numPages:1,destroy:async()=>{}};
const fakeTask={promise:Promise.resolve(fakePdf),destroy:async()=>{}};
const fakeRuntime={getDocument:()=>fakeTask};
code='';
try{
  await prepareTableCellTransactions(bytes,[replace],{
    loadRuntime:async()=>fakeRuntime,
    readPageShapes:async()=>{throw new Error('operator list failed');},
  });
}catch(error){code=error?.code||'';}
assert.equal(code,'TABLE_CELL_ANALYSIS_FAILED','Page-shape analysis failure must fail closed.');

const untouched=await prepareTableCellTransactions(bytes,[{id:'noop',kind:'ANNOTATION',pageIndex:0}],{
  loadRuntime:async()=>{throw new Error('must not run');},
});
assert.equal(untouched[0].id,'noop','Non-candidate transactions must bypass table analysis safely.');

console.log('PASS 3/3');
console.log('✓ PDF runtime failure refuses candidate edit');
console.log('✓ page geometry failure refuses candidate edit');
console.log('✓ unrelated transactions bypass table analysis');
