import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inflateSync} from 'node:zlib';

globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
const {PDFDocument}=await import(base+'core/pdf-lib.js');
const {createInsertTransaction}=await import(base+'editing/edit-transaction.js');
const {exportEditedPdf}=await import(base+'export/exporter.js');
const {nativeDraft,validateNativeDraft}=await import(base+'workspace/native-draft.js');

test('native inserted-text colour is written to PDF and retained in workspace drafts',async()=>{
  const source=await PDFDocument.create();source.addPage([400,300]);
  const bytes=new Uint8Array(await source.save({useObjectStreams:false}));
  const tx=createInsertTransaction({pageIndex:0,text:'Blue added text',x:24,y:240,fontSize:14,textColor:'#1769aa',maxWidth:320});
  const result=await exportEditedPdf(bytes,[tx],{validate:false});
  const exported=await PDFDocument.load(result.bytes),contents=exported.getPage(0).node.Contents();
  const stream=inflateSync(exported.context.lookup(contents.get(0)).getContents()).toString('latin1');
  assert.match(stream,/0\.09019607843137255\s+0\.4117647058823529\s+0\.6666666666666666\s+rg/);
  const saved=nativeDraft([tx],'source-digest',0,1);
  assert.equal(validateNativeDraft(saved,'source-digest',1).transactions[0].textColor,'#1769aa');
  const unsafe=createInsertTransaction({pageIndex:0,text:'fallback',x:24,y:200,textColor:'not-a-colour'});
  assert.equal(unsafe.textColor,'#000000');
});
