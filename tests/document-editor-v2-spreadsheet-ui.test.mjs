import test from 'node:test';
import assert from 'node:assert/strict';
import Excel from '../hybrid-build/node_modules/exceljs/excel.js';
import Papa from '../hybrid-build/node_modules/papaparse/papaparse.js';
import JSZip from '../hybrid-build/node_modules/jszip/lib/index.js';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const dom=new JSDOM('<div id="host"></div>',{url:'https://example.invalid/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
window.Papa=Papa;window.ExcelJS=Excel;window.JSZip=JSZip;
globalThis.fetch=async()=>({ok:true,json:async()=>({csv:{script:'csv.js',global:'Papa'},excel:{script:'excel.js',global:'ExcelJS'},zip:{script:'zip.js',global:'JSZip'}})});
const append=document.head.append.bind(document.head);document.head.append=(...nodes)=>{append(...nodes);for(const n of nodes)queueMicrotask(()=>n.onload?.());};
const {open}=await import('../assets/js/document-editor-v2/engines/spreadsheet.js');
async function fixture(){const b=new Excel.Workbook(),s=b.addWorksheet('Input');s.getCell('A1').value=4;s.getCell('B1').value={formula:'A1*2',result:8};s.getCell('A1').font={bold:true};s.mergeCells('D1:E1');s.getCell('D1').value='Merged';b.addWorksheet('Notes').getCell('A1').value='Keep';const bytes=await b.xlsx.writeBuffer();return {arrayBuffer:async()=>bytes};}
const host=document.querySelector('#host');
function edit(address,value){const input=host.querySelector(`[data-cell="${address}"]`);input.value=value;input.dispatchEvent(new window.Event('change'));return input;}
function jump(value){host.querySelector('[aria-label="Go to cell"]').value=value;host.querySelector('form').dispatchEvent(new window.Event('submit',{cancelable:true}));}
test('simple grid navigates beyond column 50, edits blanks and exports styles/formulas/sheets',async()=>{
 const engine=await open(await fixture(),'xlsx');let changes=0;engine.render(host,()=>changes++);const before=engine.snapshot();edit('A1','12');jump('BA60');assert.ok(host.querySelector('[data-cell="BA60"]'));edit('BA60','00123');assert.equal(changes,2);
 const after=engine.snapshot();engine.restore(before);engine.restore(after);const book=new Excel.Workbook();await book.xlsx.load(await (await engine.export()).arrayBuffer());assert.equal(book.getWorksheet('Input').getCell('BA60').value,'00123');assert.equal(book.getWorksheet('Input').getCell('A1').value,12);assert.equal(book.getWorksheet('Input').getCell('A1').font.bold,true);assert.equal(book.getWorksheet('Input').getCell('B1').formula,'A1*2');assert.equal(book.getWorksheet('Notes').getCell('A1').value,'Keep');
});
test('invalid recovery is atomic and merged continuation cannot overwrite master',async()=>{
 const engine=await open(await fixture(),'xlsx');engine.render(host,()=>{});edit('A1','20');const before=engine.snapshot();assert.throws(()=>engine.restore({...before,edits:[['Input!A1','8'],['Gone!A1','bad']]}));assert.deepEqual(engine.snapshot(),before);assert.equal(host.querySelector('[data-cell="E1"]').readOnly,true);edit('E1','overwrite');assert.deepEqual(engine.snapshot(),before);jump('XFE1');assert.match(host.querySelector('form [role=status]').textContent,/A1 to XFD/);
});
test('fresh-engine draft recovery supports undo to original content',async()=>{
 const file=await fixture(),first=await open(file,'xlsx');first.render(host,()=>{});edit('A1','22');const second=await open(file,'xlsx');const original=second.snapshot();second.restore(first.snapshot());second.restore(original);const b=new Excel.Workbook();await b.xlsx.load(await(await second.export()).arrayBuffer());assert.equal(b.getWorksheet('Input').getCell('A1').value,4);
});

test('CSV navigation does not expand exported data and recovery retains originals',async()=>{
 const file={text:async()=> 'Name,Value\r\nItem,00123'},first=await open(file,'csv');first.render(host,()=>{});edit('B2','00456');const state=first.snapshot();const second=await open(file,'csv'),original=second.snapshot();second.restore(state);second.restore(original);second.render(host,()=>{});jump('BA60');const text=await(await second.export()).text();assert.deepEqual(Papa.parse(text).data,[['Name','Value'],['Item','00123']]);
});
