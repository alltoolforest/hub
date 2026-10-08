import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {inspectCsv} from '../assets/js/csv-import.js';

const require=createRequire(import.meta.url);
const Papa=require('../assets/vendor/csv.js');
const editor=readFileSync(new URL('../assets/js/editor.js',import.meta.url),'utf8');

test('terminal LF, CRLF and CR add no artificial CSV record',()=>{
 for(const newline of ['\n','\r\n','\r']){
  const source=['name,amount','Alice,25','Bob,30'].join(newline)+newline;
  const parsed=inspectCsv(Papa,source);
  assert.deepEqual(parsed.rows,[['name','amount'],['Alice','25'],['Bob','30']]);
  assert.equal(parsed.diagnostics.rows,3);
  assert.equal(parsed.diagnostics.irregularRows,0);
 }
});
test('intentional empty records survive; only the terminal artifact is removed',()=>{
 assert.deepEqual(inspectCsv(Papa,'a,b\n\n').rows,[['a','b'],['']]);
 assert.deepEqual(inspectCsv(Papa,'a,b\n,\n').rows,[['a','b'],['','']]);
 assert.deepEqual(inspectCsv(Papa,'a,b\n1,2\n\n').rows,[['a','b'],['1','2'],['']]);
 assert.deepEqual(inspectCsv(Papa,'a,b\n1,2').rows,[['a','b'],['1','2']]);
});
test('quoted line breaks, semicolon dialect, tabs and empty file stay intact',()=>{
 assert.deepEqual(inspectCsv(Papa,'name,note\n"Al","line one\nline two"\n').rows,
   [['name','note'],['Al','line one\nline two']]);
 assert.deepEqual(inspectCsv(Papa,'a;b\n1;2\n',{delimiter:';'}).rows,[['a','b'],['1','2']]);
 assert.deepEqual(inspectCsv(Papa,'a\tb\n1\t2\n',{delimiter:'\\t'}).rows,[['a','b'],['1','2']]);
 assert.ok(inspectCsv(Papa,'').diagnostics.warnings.includes('The CSV file is empty.'));
});
test('2,000 actual records with trailing newline remain within the import cap',()=>{
 const input=Array.from({length:2000},(_,i)=>String(i)+',value'+i).join('\n')+'\n';
 const parsed=inspectCsv(Papa,input);
 assert.equal(parsed.rows.length,2000);
 assert.equal(parsed.diagnostics.rows,2000);
 assert.equal(parsed.rows.at(-1)[0],'1999');
 assert.equal(Papa.parse(Papa.unparse(parsed.rows),{skipEmptyLines:false}).data.length,2000);
});
function getDownloadHandler(){
 const anchor="$('#downloads').addEventListener('click',event=>{";
 const i=editor.indexOf(anchor),end=editor.indexOf('\n  });',i);
 assert.ok(i>=0&&end>i,'CSV-only download handler should exist');
 const body=editor.slice(i+anchor.length,end);
 return new Function('state','event','with(state){ '+body+' }');
}
test('starting a download leaves unsaved protection active',()=>{
 const state={csvDirty:true,csvChangeVersion:7,csvPreparedExportVersion:7,
   csvEditStatus:{textContent:'Unsaved changes'}};
 const event={target:{closest:()=>({download:'edited.csv'})},preventDefault(){throw Error('unexpected block')}};
 getDownloadHandler()(state,event);
 assert.equal(state.csvDirty,true);
 assert.match(state.csvEditStatus.textContent,/unsaved-change protection remains active/);
});
test('stale export links remain blocked without clearing unsaved protection',()=>{
 let blocked=false;
 const state={csvDirty:true,csvChangeVersion:8,csvPreparedExportVersion:7,
   csvEditStatus:{textContent:'Unsaved changes'}};
 const event={target:{closest:()=>({download:'old.csv'})},preventDefault(){blocked=true}};
 getDownloadHandler()(state,event);
 assert.equal(blocked,true);
 assert.equal(state.csvDirty,true);
 assert.match(state.csvEditStatus.textContent,/Generate a fresh file/);
});
