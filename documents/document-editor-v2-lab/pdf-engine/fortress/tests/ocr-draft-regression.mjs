// Real canvas painting and PDF export; page rendering and OCR are deterministic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {groupOcrWords} from '../../ocr/layout-model.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,GlobalFonts,DOMMatrix,ImageData,Path2D}=require('../../../../../hybrid-build/node_modules/@napi-rs/canvas');
const {JSDOM}=require('../../../../../hybrid-build/node_modules/jsdom');
for(const [alias,file] of [['Arial','DejaVuSans'],['Georgia','DejaVuSerif'],['Consolas','DejaVuSansMono']]){
  GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}.ttf`,alias);
  GlobalFonts.registerFromPath(`/usr/share/fonts/truetype/dejavu/${file}-Bold.ttf`,alias);
}
const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test',pretendToBeVisual:true});
Object.assign(globalThis,{document:dom.window.document,window:dom.window,DOMMatrix,ImageData,Path2D});
const backing=new WeakMap();
function raster(el){let c=backing.get(el);if(!c){c=createCanvas(el.width,el.height);backing.set(el,c);}if(c.width!==el.width)c.width=el.width;if(c.height!==el.height)c.height=el.height;return c;}
const proto=dom.window.HTMLCanvasElement.prototype;
proto.getContext=function(){const ctx=raster(this).getContext('2d');if(!ctx._drawImage){ctx._drawImage=ctx.drawImage.bind(ctx);ctx.drawImage=(src,...args)=>ctx._drawImage(src instanceof dom.window.HTMLCanvasElement?raster(src):src,...args);}return ctx;};
proto.toBlob=function(cb,type){cb(new Blob([raster(this).toBuffer(type||'image/png')],{type:type||'image/png'}));};
globalThis.createImageBitmap=async blob=>loadImage(Buffer.from(await blob.arrayBuffer()));
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
globalThis.PDFLib=require('../../../../../assets/vendor/pdf-lib.js');
const {PDFDocument}=await import('../src/core/pdf-lib.js');
const {TesseractOcrProvider}=await import('../../ocr/tesseract-provider.js');

const original=createCanvas(600,200),ctx=original.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,200);ctx.fillStyle='#182023';ctx.font='32px Arial';ctx.fillText('sample',40,80);ctx.fillText('unchanged',250,80);
const pdf=await PDFDocument.create();const image=await pdf.embedPng(original.toBuffer('image/png'));
for(let i=0;i<2;i++)pdf.addPage([600,200]).drawImage(image,{x:0,y:0,width:600,height:200});
const originalBytes=await pdf.save();
const moduleUrl=new URL('../../ocr/scan-editor.js',import.meta.url);
const mod=new vm.SourceTextModule(await readFile(moduleUrl,'utf8'));
await mod.link(async specifier=>{
  const namespace=specifier.includes('rendering/pdfjs.js')?{
    loadPdfjs:async()=>({getDocument:({data})=>({
      destroy:async()=>{},
      promise:PDFDocument.load(data).then(doc=>({
        numPages:doc.getPageCount(),
        getPage:async()=>({
          getViewport:({scale})=>({width:600*scale,height:200*scale}),
          getAnnotations:async()=>[],
          render:({canvasContext,viewport})=>{canvasContext.drawImage(original,0,0,viewport.width,viewport.height);return {promise:Promise.resolve()};}
        })
      }))
    })})
  }:await import(new URL(specifier,moduleUrl));
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);});
});
await mod.evaluate();const {createScannedPdfEditor}=mod.namespace;

TesseractOcrProvider.prototype.recognize=async function(canvas){const scale=canvas.width/600;const words=[{text:'sample',confidence:99,bbox:{x0:40*scale,y0:55*scale,x1:157*scale,y1:87*scale}}];return {words,layout:groupOcrWords(words)};};
TesseractOcrProvider.prototype.terminate=async()=>{};
let exported=null;const warnings=[];
const app=document.querySelector('#app');const editor=createScannedPdfEditor({container:app,onWarning:w=>warnings.push(w),onError:e=>{throw e;},onExport:e=>exported=e});
await editor.open(new Uint8Array(originalBytes));await editor.runOcr();
const button=text=>[...app.querySelectorAll('button')].find(b=>b.textContent===text);
function replace(from,to){button(from).click();app.querySelector('textarea').value=to;button('Apply change').click();assert.equal(warnings.length,0,JSON.stringify(warnings));assert.equal(editor.getState().hasPendingEdit,false);}
replace('sample','tested');
const first=raster(app.querySelector('.ocr-canvas')).toBuffer('image/png');
replace('tested','sample');replace('sample','tested');
assert.deepEqual(raster(app.querySelector('.ocr-canvas')).toBuffer('image/png'),first,'re-edit must keep original style reference');
await editor.save();assert.equal(exported.edits,3);assert.equal((await PDFDocument.load(exported.bytes)).getPageCount(),2);

const draft=structuredClone(await editor.snapshot());
assert.equal(draft.pages[0].editedBlob.type,'image/png');
await editor.destroy();
const recovered=createScannedPdfEditor({container:app,onError:error=>{throw error;},onExport:result=>exported=result});
await recovered.open(new Uint8Array(originalBytes));
await recovered.restore(draft);
assert.deepEqual(raster(app.querySelector('.ocr-canvas')).toBuffer('image/png'),first,'recovery must preserve edited pixels exactly');
assert.ok([...app.querySelectorAll('button')].some(button=>button.textContent==='tested'),'recognized words survive recovery');
await recovered.save();assert.equal((await PDFDocument.load(exported.bytes)).getPageCount(),2);
await assert.rejects(()=>recovered.restore({...draft,source:'wrong-source'}),/does not match/);
const corrupt=structuredClone(draft);corrupt.pages[0].editedBlob=new Blob(['not PNG']);
await assert.rejects(()=>recovered.restore(corrupt),/PNG/);
assert.deepEqual(raster(app.querySelector('.ocr-canvas')).toBuffer('image/png'),first,'invalid draft must leave pixels intact');
button('tested').click();
await assert.rejects(()=>recovered.snapshot(),/Finish/);
button('Cancel').click();
const empty={...draft,pages:[]};await recovered.restore(empty);
assert.equal(recovered.getState().editCount,0);
await recovered.destroy();
const hybridUrl=new URL('../../ocr/hybrid-editor.js',import.meta.url);
const hybridModule=new vm.SourceTextModule(await readFile(hybridUrl,'utf8'));
await hybridModule.link(async specifier=>{
  const namespace=specifier.includes('scan-editor.js')?{createScannedPdfEditor}:specifier==='./classifier.js'?{
    createPdfPageClassifier:async bytes=>({pageCount:(await PDFDocument.load(bytes)).getPageCount(),classifyAll:async()=>[0,1].map(()=>({kind:'scanned',confidence:1})),destroy:async()=>{}})
  }:await import(new URL(specifier,hybridUrl));
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);});
});
await hybridModule.evaluate();
const {createHybridPdfEditor}=hybridModule.namespace;
const hybrid=createHybridPdfEditor({container:app});await hybrid.open(new Uint8Array(originalBytes));
button('Run OCR').click();
for(let attempt=0;attempt<100&&!button('sample');attempt++)await new Promise(resolve=>setTimeout(resolve,10));
replace('sample','tested');
const hybridPixels=raster(app.querySelector('.ocr-canvas')).toBuffer('image/png');
const hybridDraft=structuredClone(await hybrid.snapshot());await hybrid.destroy();
const hybridRecovered=createHybridPdfEditor({container:app});
await hybridRecovered.open(new Uint8Array(originalBytes),hybridDraft);
assert.deepEqual(raster(app.querySelector('.ocr-canvas')).toBuffer('image/png'),hybridPixels);
assert.ok(button('tested'));
const searchable=app.querySelector('input[type=checkbox]');searchable.checked=true;searchable.dispatchEvent(new dom.window.Event('change'));
const result=await hybridRecovered.save();assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),2);
const {extractPageText}=await import('../src/export/extraction-validator.js');
assert.match(await extractPageText(result.bytes,0),/tested/);
assert.ok(button('tested'),'saving must retain the editable OCR word state');
replace('tested','sample');
const secondResult=await hybridRecovered.save();
const secondText=await extractPageText(secondResult.bytes,0);
assert.match(secondText,/sample/);assert.ok(!secondText.includes('tested'),'re-edit must remove the previous hidden OCR text');
const savedAgain=structuredClone(await hybridRecovered.snapshot());
assert.equal(savedAgain.ocrPages[0].draft.searchable,true);
const off=app.querySelector('input[type=checkbox]');off.checked=false;off.dispatchEvent(new dom.window.Event('change'));
const visibleOnly=await hybridRecovered.save();assert.equal((await extractPageText(visibleOnly.bytes,0)).trim(),'','turning searchable off must remove the generated hidden layer');
await hybridRecovered.destroy();dom.window.close();
console.log('PASS hybrid OCR session snapshot restores original page bytes, OCR pixels and recognized text, then exports both pages');
console.log('PASS scan draft structured-clone recovery, exact pixels, words, export, invalid-source/data rollback, pending edit guard and reset');
