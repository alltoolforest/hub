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

test('added hyperlink follows verified upward slice once across repeated export and recovery',async()=>{
 const file=await fixture(),view=await tools(file),before=view.snapshot(),item={id:'flow-link',kind:'link',pageIndex:0,x:40,y:80,width:60,height:20,url:'https://example.org/flow'};
 await view.restore({...before,changes:[item]});const state={reflowMetrics:[{pageIndex:0,mode:'SAME_PAGE_UPWARD_COMPACTION',delta:0,shiftY:12,cutY:220,footerGuardTop:40,bandLeft:30,bandRight:250}]};
 for(let i=0;i<2;i++){const doc=await PDFDocument.load(await view.apply(new Uint8Array(await file.arrayBuffer()),state)),annots=doc.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray),rect=doc.context.lookup(annots.get(1)).lookup(PDFName.of('Rect'),PDFArray).asArray().map(v=>v.asNumber());assert.deepEqual(rect,[40,92,100,112]);assert.equal(view.snapshot().changes[0].y,80);}
 const fresh=await tools(file);await fresh.restore(view.snapshot());assert.deepEqual(await fresh.apply(new Uint8Array(await file.arrayBuffer()),state),await view.apply(new Uint8Array(await file.arrayBuffer()),state));
 await view.restore({...before,changes:[{...item,y:210}]});await assert.rejects(view.apply(new Uint8Array(await file.arrayBuffer()),state),/conflict/);await fresh.dispose();await view.dispose();
});
test('append-only cascade retains object edits on earlier pages and refuses affected destinations',async()=>{
 const doc=await PDFDocument.create();doc.addPage([300,300]);doc.addPage([300,300]);const file=new Blob([await doc.save()]),view=await tools(file),before=view.snapshot(),item={id:'earlier',kind:'link',pageIndex:0,x:40,y:80,width:60,height:20,url:'https://example.org/earlier'};await view.restore({...before,changes:[item]});doc.addPage([300,300]);const bytes=await doc.save(),state={reflowMetrics:[{pageIndex:1,delta:30,appendedPageCount:1,overflowPageCount:1}]};const result=await PDFDocument.load(await view.apply(bytes,state));assert.equal(result.getPageCount(),3);assert.deepEqual(links(result),[item.url]);await view.restore({...before,changes:[{...item,pageIndex:1}]});await assert.rejects(view.apply(bytes,state),/conflict/);await view.dispose();
});

test('real native upward compaction exports matching added-object and text movement',async()=>{
 const {applyUpwardCompaction}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/upward-compaction-v3.js');
 const doc=await PDFDocument.create(),page=doc.addPage([300,300]);for(const [text,y]of [['Header fixed',260],['Following first line',160],['Following second line',140],['Following third line',120]])page.drawText(text,{x:40,y,size:12});
 const bytes=await doc.save(),file=new Blob([bytes]),view=await tools(file),before=view.snapshot();
 const transaction={id:'delete-line',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'Deleted line',replacementUnicode:'',block:{text:'Deleted line',bounds:{x:40,y:177,width:110,height:13},fontSize:12,lines:[{y:180,fontSize:12}]}};
 const flowed=await applyUpwardCompaction({bytes,reflowMetrics:[]},[transaction]);assert.equal(flowed.upwardCompactionCount,1);const metric=flowed.reflowMetrics[0];
 const item={id:'real-flow-link',kind:'link',pageIndex:0,x:50,y:125,width:50,height:10,url:'https://example.org/real'};await view.restore({...before,changes:[item]});
 const output=await PDFDocument.load(await view.apply(flowed.bytes,{reflowMetrics:flowed.reflowMetrics}));const annots=output.getPage(0).node.lookup(PDFName.of('Annots'),PDFArray),rect=output.context.lookup(annots.get(0)).lookup(PDFName.of('Rect'),PDFArray).asArray().map(v=>v.asNumber());assert.equal(rect[1],item.y+metric.shiftY);assert.equal(output.getPageCount(),1);assert.equal(view.snapshot().changes[0].y,125);await view.dispose();
});

test('upward object mapping preserves fixed lanes, rejects slice boundaries and never mutates drafts',async()=>{
 const {assertObjectLayout}=await import('../assets/js/document-editor-v2/pdf-object-layout.js');const metric={pageIndex:0,mode:'SAME_PAGE_UPWARD_COMPACTION',delta:0,shiftY:12,cutY:220,footerGuardTop:40,bandLeft:30,bandRight:250},state={reflowMetrics:[metric]},item={id:'object',kind:'image',pageIndex:0,x:40,y:80,width:60,height:20};
 for(const rect of [{x:0,width:20},{y:10},{y:240},{x:260,width:20}]){const source={...item,...rect};assert.deepEqual(assertObjectLayout([source],state,1,1),[source]);}
 for(const rect of [{x:20},{y:30},{y:215},{y:225},{x:230},{source:{index:0}}])assert.throws(()=>assertObjectLayout([{...item,...rect}],state,1,1),/conflict/);
 assert.equal(assertObjectLayout([item],{reflowMetrics:[metric,metric]},1,1)[0].y,104);assert.equal(item.y,80);
 assert.throws(()=>assertObjectLayout([item],{reflowMetrics:[{...metric,bandRight:NaN}]},1,1),/conflict/);
});
