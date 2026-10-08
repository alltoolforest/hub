import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formulaRisk,csvExportCheck,CsvHistory} from '../assets/js/csv-cleaning.js';
import {viewIndices} from '../assets/js/csv-operations.js';

const source=readFileSync(new URL('../assets/js/editor.js',import.meta.url),'utf8');

test('arithmetic disguised as international phone number is rejected',()=>{
 for(const value of ['+1-2-3-4','+1234567-8','-4+3','+1*2','=HYPERLINK("https://bad.example")','@SUM(A1)']){
   assert.equal(formulaRisk(value),true,value);
 }
 assert.deepEqual(csvExportCheck([['+1-2-3-4','=2+2']]),[[1,1],[1,2]]);
});
test('legitimate signed numerics and clearly grouped international phones remain unchanged',()=>{
 for(const value of ['-125.50','+99.5','-.25','+1e2','+919876543210','+91 9876543210','+1 (415) 555-2671']){
   assert.equal(formulaRisk(value),false,value);
 }
});
test('numeric sorting understands signs, decimals, stable ties and descending',()=>{
 const rows=[['-2'],['-10'],['-1'],['2'],['10'],['-1']];
 assert.deepEqual(viewIndices(rows,{sortColumn:0}),[1,0,2,5,3,4]);
 assert.deepEqual(viewIndices(rows,{sortColumn:0,descending:true}),[4,3,2,5,0,1]);
 const decimals=[['-0.2'],['.5'],['-1.5'],['0'],['1.02']];
 assert.deepEqual(viewIndices(decimals,{sortColumn:0}),[2,0,3,1,4]);
});
test('text, mixed types, headers and originals stay intact',()=>{
 const rows=[['value'],['file10'],['file2'],['file1']];
 const copy=rows.map(r=>r.slice());
 assert.deepEqual(viewIndices(rows,{sortColumn:0,header:true}),[3,2,1]);
 assert.deepEqual(rows,copy);
});

function loadDelegatedEditHandlers(rows){
 const start=source.indexOf('if(csvClean){\n // Delegation avoids two listeners');
 const end=source.indexOf("\n\n$('#sheet-select')",start);
 assert.ok(start>=0 && end>start,'delegated event block should be present');
 const listeners={};
 const grid={addEventListener(name,cb){listeners[name]=cb}};
 const sheets=[{rows}];const csvHistory=new CsvHistory();
 let dirty=0;
 new Function('grid','csvClean','csvHistory','sheets','activeSheet','markCsvDirty','csvSelectedRow',
    source.slice(start,end))(grid,true,csvHistory,sheets,0,()=>dirty++,null);
 const cell={
   dataset:{row:'0',col:'0'},textContent:rows[0][0],
   closest(){return this},matches(){return true}
 };
 return {listeners,cell,sheets,csvHistory,getDirty:()=>dirty};
}
test('focus and blur never consume undo history',()=>{
 const v=loadDelegatedEditHandlers([['original']]);
 for(let i=0;i<35;i++){
   v.listeners.focusin({target:v.cell});
   v.listeners.focusout({target:v.cell});
 }
 assert.equal(v.csvHistory.undoStack.length,0);
 assert.equal(v.getDirty(),0);
});
test('real edits record a single snapshot per editing session and redo works',()=>{
 const v=loadDelegatedEditHandlers([['original']]);
 v.listeners.focusin({target:v.cell});
 v.listeners.input({target:v.cell}); // no change
 assert.equal(v.csvHistory.undoStack.length,0);
 v.cell.textContent='edited';
 v.listeners.input({target:v.cell});
 assert.equal(v.csvHistory.undoStack.length,1);
 assert.equal(v.sheets[0].rows[0][0],'edited');
 v.cell.textContent='edited again';
 v.listeners.input({target:v.cell});
 assert.equal(v.csvHistory.undoStack.length,1);
 v.listeners.focusout({target:v.cell});
 v.listeners.focusin({target:v.cell});
 v.cell.textContent='new session';
 v.listeners.input({target:v.cell});
 assert.equal(v.csvHistory.undoStack.length,2);
 assert.deepEqual(v.csvHistory.undo(v.sheets[0].rows),[['edited again']]);
 assert.equal(v.getDirty(),3);
});

function importProbe(importOutcome){
 const start=source.indexOf("if(ext==='csv'&&csvImport){");
 const end=source.indexOf("\n clearOutputs();filename=file.name;",start);
 assert.ok(start>=0 && end>start,'early CSV transaction block must be present');
 const state={
  csvImport:{importCsvFile:async()=>{if(importOutcome instanceof Error)throw importOutcome;return importOutcome;},
             formatImportSummary:()=> 'import diagnostics'},
  parser:null,load:async()=>({parse(){}}),read:()=> 'auto',
  sheets:[{name:'Sheet1',rows:[['old','keep me']]}],filename:'old.csv',
  kind:'csv',activeSheet:0,csvHistory:new CsvHistory(),csvDirty:true,
  csvPreparedExportVersion:1,csvChangeVersion:3,csvEditStatus:{textContent:'unsaved'},
  csvPage:2,csvView:{search:'old'},csvSelectedRow:2,
  csvResetViewControls(){},renderSheets(){this.renderCount++},renderCount:0,
  clearOutputs(){this.clearCount++},clearCount:0,
  csvReport:{hidden:true,textContent:'',closest:()=>null},
  csvHasHeader:true,lastCsvFile:{name:'old.csv'}
 };
 // Evaluate the unmodified production CSV early-import branch against an isolated
 // state object. Failed import must perform zero destructive mutations.
 const run=new Function('state', 'with(state){ return async function(file){ const ext="csv"; '+source.slice(start,end)+'; }; }')(state);
 return {state,run};
}
test('malformed CSV import leaves existing edited CSV and output untouched',async()=>{
 const {state,run}=importProbe(Error('Malformed quoted field'));
 await assert.rejects(run({name:'bad.csv'}),/Malformed quoted field/);
 assert.equal(state.filename,'old.csv');
 assert.deepEqual(state.sheets[0].rows,[['old','keep me']]);
 assert.equal(state.csvDirty,true);
 assert.equal(state.clearCount,0);
});
test('over-limit CSV import preserves prior workspace',async()=>{
 const {state,run}=importProbe({rows:Array.from({length:2001},()=>['x']),diagnostics:{}});
 await assert.rejects(run({name:'too-large.csv'}),/at most 2,000 rows/);
 assert.deepEqual(state.sheets[0].rows,[['old','keep me']]);
 assert.equal(state.clearCount,0);
});
test('validated CSV replacement commits the new data',async()=>{
 const {state,run}=importProbe({rows:[['new','data']],diagnostics:{headerSelected:false,warnings:[]}});
 await run({name:'good.csv'});
 assert.equal(state.filename,'good.csv');
 assert.deepEqual(state.sheets[0].rows,[['new','data']]);
 assert.equal(state.csvDirty,false);
 assert.equal(state.clearCount,1);
});
