import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {canvasRenderPlan} from '../src/rendering/canvas-budget.js';
import {computeOcrRenderPlan} from '../../ocr/render-budget.js';
const require=createRequire(import.meta.url);
let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
for(const [w,h,dpr] of [[612,792,1],[612,792,3],[14400,14400,2],[1,1e8,2],[3000,20000,2]]){
  await test(`native canvas budget ${w}x${h}`,()=>{const p=canvasRenderPlan(w,h,dpr);assert.ok(p.pixelWidth*p.pixelHeight<=4_000_000);assert.ok(Math.max(p.pixelWidth,p.pixelHeight)<=4096);assert.equal(p.scaleX,p.pixelWidth/w);});
}
for(const [w,h] of [[612,792],[14400,14400],[1,1e8],[8000,20000]]){
  await test(`OCR hard budget ${w}x${h}`,()=>{const p=computeOcrRenderPlan(w,h);assert.ok(p.pixels<=p.limits.maxPixels);assert.ok(Math.max(p.pixelWidth,p.pixelHeight)<=p.limits.maxLongSide);});
}
await test('invalid canvas dimensions refused',()=>{assert.throws(()=>canvasRenderPlan(Infinity,20));assert.throws(()=>computeOcrRenderPlan(20,NaN));});
for(const failure of ['none','parse','read']){
  await test(`validation releases loading task on ${failure}`,async()=>{
    let destroyed=0;
    const ctx=vm.createContext({Uint8Array});
    const loader=new vm.SyntheticModule(['loadPdfjs'],function(){this.setExport('loadPdfjs',async()=>({getDocument:()=>({promise:failure==='parse'?Promise.reject(new Error('parse')):Promise.resolve({}),destroy:async()=>{destroyed++;}})}));},{context:ctx});
    const mod=new vm.SourceTextModule(await readFile(new URL('../src/rendering/with-document.js',import.meta.url),'utf8'),{context:ctx});
    await mod.link(()=>loader);await mod.evaluate();
    const call=()=>mod.namespace.withPdfDocument(new Uint8Array([1]),async()=>{if(failure==='read')throw new Error('read');return 7;});
    if(failure==='none')assert.equal(await call(),7);else await assert.rejects(call);
    assert.equal(destroyed,1);
  });
}
// Real parser/exporter and editor events, with only canvas painting stubbed.
const {JSDOM}=require('../../../../hybrid-build/node_modules/jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});
for(const key of ['document','window','Option','HTMLElement'])globalThis[key]=dom.window[key];
globalThis.innerHeight=900;
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
globalThis.PDFLib=require('../../../../assets/vendor/pdf-lib.js');
const {PDFDocument,StandardFonts}=await import('../src/core/pdf-lib.js');
const {PdfRenderer}=await import('../src/rendering/renderer.js');
PdfRenderer.prototype.render=async function(i,canvas,{scale=1}={}){const p=await this.getPage(i);const v=p.getViewport({scale});return {viewport:v,matrix:[...v.transform],cssWidth:v.width,cssHeight:v.height};};
const {createHybridPdfEditor}=await import('../../ocr/hybrid-editor.js');
const {extractPageText}=await import('../src/export/extraction-validator.js');
const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);
for(let i=0;i<2;i++)doc.addPage([612,792]).drawText('Original sample text',{x:60,y:700,size:12,font});
const bytes=new Uint8Array(await doc.save({useObjectStreams:false}));
let message='',exports=0;
const app=document.querySelector('#app');
const engine=createHybridPdfEditor({container:app,onStatus:s=>message=s,onExport:()=>exports++});
await engine.open(bytes);
const byLabel=label=>app.querySelector(`[aria-label="${label}"]`);
const topButton=label=>[...app.querySelectorAll('.hybrid-toolbar button')].find(b=>b.textContent===label);
await test('native source opens with two pages',()=>assert.equal(engine.getState().pageCount,2));
byLabel('Edit text: Original sample text').click();
let input=byLabel('Edit PDF text');input.value='Updated sample text';
await test('save refuses unfinished edit without dropping text',async()=>{assert.equal(await engine.save(),null);assert.match(message,/Press Done/);assert.equal(input.value,'Updated sample text');assert.equal(exports,0);});
await test('page navigation preserves unfinished text',async()=>{topButton('Next').click();await new Promise(r=>setTimeout(r,10));assert.equal(engine.getState().pageIndex,0);assert.equal(input.isConnected,true);});
await test('zoom preserves unfinished text',async()=>{byLabel('Zoom in').click();await new Promise(r=>setTimeout(r,10));assert.equal(input.isConnected,true);assert.equal(input.value,'Updated sample text');});
await test('undo and redo preserve unfinished text',async()=>{await engine.undo();await engine.redo();assert.equal(input.isConnected,true);assert.equal(input.value,'Updated sample text');});
async function settled(check){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Editor did not settle: '+message);}
app.querySelector('.pdf-done').click();
await settled(()=>!engine.getState().hasPendingEdit&&/Edit applied/.test(message));
await test('committed edit exports and reopens with exact text',async()=>{const result=await engine.save();assert.ok(result?.bytes);const text=await extractPageText(result.bytes,0);assert.ok(text.includes('Updated sample text'));assert.ok(!text.includes('Original sample text'));assert.equal(exports,1);});
await test('undo removes committed transaction',async()=>{await engine.undo();assert.equal(engine.getState().transactions.length,0);});
await test('redo restores committed transaction',async()=>{await engine.redo();assert.equal(engine.getState().transactions.length,1);});
await test('navigation resumes after Done',async()=>{topButton('Next').click();await settled(()=>engine.getState().pageIndex===1&&engine.getState().analysis?.pageIndex===1);assert.equal(engine.getState().pageIndex,1);});
await engine.destroy();
await test('oversized file rejected before reading its bytes',async()=>{let read=false;const e=createHybridPdfEditor({container:app});await assert.rejects(()=>e.open({size:61*1024*1024,arrayBuffer(){read=true;}}),/60 MB/);assert.equal(read,false);await e.destroy();});
await test('excess pages rejected before classification',async()=>{
  const many=await PDFDocument.create();for(let i=0;i<251;i++)many.addPage([10,10]);
  const manyBytes=new Uint8Array(await many.save());
  let classified=false;const e=createHybridPdfEditor({container:app,onStatus:s=>{if(/Checking page/.test(s))classified=true;}});
  try{await assert.rejects(()=>e.open(manyBytes),/250-page/);assert.equal(classified,false);}finally{await e.destroy();}
});
const {TesseractOcrProvider}=await import('../../ocr/tesseract-provider.js');
await test('OCR script failure can be retried',async()=>{
  const provider=new TesseractOcrProvider();
  const first=provider.ensureWorker();const rejected=assert.rejects(first,/downloaded/);
  document.querySelector('script[data-alltoolforest-ocr]').onerror();await rejected;
  assert.equal(document.querySelector('script[data-alltoolforest-ocr]'),null);
  const second=provider.ensureWorker();
  const script=document.querySelector('script[data-alltoolforest-ocr]');assert.ok(script);
  globalThis.Tesseract={createWorker:async()=>({terminate:async()=>{}})};
  script.onload();assert.ok(await second);await provider.terminate();
});
await test('closing during OCR startup releases the late worker',async()=>{
  let finish,terminated=0;
  globalThis.Tesseract={createWorker:()=>new Promise(resolve=>finish=resolve)};
  const provider=new TesseractOcrProvider();const pending=provider.ensureWorker();const rejected=assert.rejects(pending,/closed/);
  await new Promise(r=>setTimeout(r,0));await provider.terminate();finish({terminate:async()=>terminated++});await rejected;
  assert.equal(terminated,1);assert.equal(provider.worker,null);
});
dom.window.close();
console.log(`PASS ${passed}/${passed} browser stability checks (DOM simulation, not physical-device certification)`);
