import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const require=createRequire(import.meta.url);globalThis.PDFLib=require('../assets/vendor/pdf-lib.js');
const dom=new JSDOM('<div></div>',{url:'https://example.invalid/'});
for(const key of ['document','window','Option','Event'])globalThis[key]=key==='window'?dom.window:dom.window[key];
const {PDFDocument,PDFName,PDFArray,PDFDict,PDFString}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/pdf-lib.js');
const {createPdfObjectTools}=await import('../assets/js/document-editor-v2/pdf-objects.js');
async function fixture(){const doc=await PDFDocument.create(),page=doc.addPage([300,300]);page.node.set(PDFName.of('Annots'),doc.context.obj([doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[10,10,90,30],A:{S:'URI',URI:PDFString.of('https://example.org/original')}}))]));return new Blob([await doc.save()]);}
function links(doc){return doc.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray).asArray().map(ref=>doc.context.lookup(ref).lookup(PDFName.of('A'),PDFDict).lookup(PDFName.of('URI')).decodeText());}
async function tools(file){return createPdfObjectTools(file,{onChange:()=>{},getBaseBytes:()=>file.arrayBuffer(),getEditorState:()=>({reflowMetrics:[],ocrEditedPages:[]})});}
test('PDF object module exports source/new hyperlinks and restores source-bound drafts',async()=>{
 const file=await fixture(),view=await tools(file),state=view.snapshot();
 const item={id:'added-link',kind:'link',pageIndex:0,x:20,y:50,width:80,height:20,url:'https://example.org/new'};
 await view.restore({...state,changes:[item]});const bytes=await view.apply(new Uint8Array(await file.arrayBuffer()));assert.deepEqual(links(await PDFDocument.load(bytes)),['https://example.org/original','https://example.org/new']);
 const fresh=await tools(file);await fresh.restore(view.snapshot());assert.deepEqual(links(await PDFDocument.load(await fresh.apply(new Uint8Array(await file.arrayBuffer())))),['https://example.org/original','https://example.org/new']);
 const before=fresh.snapshot();await assert.rejects(fresh.restore({...before,changes:[{...item,url:'javascript:alert(1)'}]}),/HTTP/);assert.deepEqual(fresh.snapshot(),before);
 await view.dispose();await fresh.dispose();
});
test('PDF original hyperlink update and deletion preserve unrelated annotation fields',async()=>{
 const file=await fixture(),view=await tools(file),panel=view.panel,select=panel.querySelector('select');select.value='source-link:0:0';select.dispatchEvent(new Event('change'));
 const fields=panel.querySelectorAll('input'),base=view.snapshot();assert.equal(fields[5].value,'https://example.org/original');
 const original={id:'source-link:0:0',kind:'link',pageIndex:0,x:10,y:10,width:80,height:20,url:'https://example.org/updated',source:{index:0,rect:[10,10,90,30],url:'https://example.org/original'}};
 await view.restore({...base,changes:[original]});assert.deepEqual(links(await PDFDocument.load(await view.apply(new Uint8Array(await file.arrayBuffer())))),['https://example.org/updated']);
 await view.restore({...base,changes:[{...original,deleted:true}]});assert.deepEqual(links(await PDFDocument.load(await view.apply(new Uint8Array(await file.arrayBuffer())))),[]);await view.dispose();
});

test('objects on unaffected pages coexist with reflow; upward and cascade conflicts are refused',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,300]);doc.addPage([300,300]);const file=new Blob([await doc.save()]),view=await tools(file),before=view.snapshot();
 await view.restore({...before,changes:[{id:'page-two-link',kind:'link',pageIndex:1,x:20,y:50,width:80,height:20,url:'https://example.org/new'}]});
 const bytes=new Uint8Array(await file.arrayBuffer());
 assert.equal((await PDFDocument.load(await view.apply(bytes,{reflowMetrics:[{pageIndex:0,delta:20}],ocrEditedPages:[]}))).getPageCount(),2);
 await assert.rejects(view.apply(bytes,{reflowMetrics:[{pageIndex:1,delta:0,shiftY:12}],ocrEditedPages:[]}),/page 2.*conflict/);
 await assert.rejects(view.apply(bytes,{reflowMetrics:[{pageIndex:0,delta:20,cascadedPageCount:1}],ocrEditedPages:[]}),/page 2.*conflict/);
 const extra=await PDFDocument.load(bytes);extra.addPage([300,300]);await assert.rejects(view.apply(await extra.save(),{reflowMetrics:[],ocrEditedPages:[]}),/Page count changed/);await view.dispose();
});
