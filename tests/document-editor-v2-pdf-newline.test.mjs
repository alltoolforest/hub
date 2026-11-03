import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
const {PDFDocument}=await import(base+'core/pdf-lib.js');
const {exportEditedPdf}=await import(base+'export/exporter-core.js');
test('paragraph relocation cannot bypass deletion verification using an absent or mismatched paired insertion',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,300]);const bytes=await doc.save({useObjectStreams:false});
 const clear={id:'clear',kind:'REPLACE_TEXT',pageIndex:0,blockId:'body',replacementUnicode:'',expandedInsertId:'draw'};
 const insert={id:'draw',kind:'INSERT_TEXT',pageIndex:0,expandedFromBlockId:'body',replacementUnicode:'Retained declaration',x:20,y:200};
 for(const transactions of [[clear],[clear,{...insert,expandedFromBlockId:'other'}],[clear,{...insert,pageIndex:1}],[clear,{...insert,replacementUnicode:''}],[{...clear,replacementUnicode:'changed'},insert]]){
  await assert.rejects(exportEditedPdf(bytes,transactions),error=>error.code==='INVALID_EXPANDED_PARAGRAPH');
 }
});
