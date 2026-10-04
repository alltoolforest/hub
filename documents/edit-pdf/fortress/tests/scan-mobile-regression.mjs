// Real canvas painting and PDF export; page rendering and OCR are deterministic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {groupOcrWords} from '../../ocr/layout-model.js';
const require=createRequire(import.meta.url);
const {createCanvas,GlobalFonts,DOMMatrix,ImageData,Path2D}=require('../../../../hybrid-build/node_modules/@napi-rs/canvas');
const {JSDOM}=require('../../../../hybrid-build/node_modules/jsdom');
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
globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
globalThis.PDFLib=require('../../../../assets/vendor/pdf-lib.js');
const {PDFDocument}=await import('../src/core/pdf-lib.js');
const {TesseractOcrProvider}=await import('../../ocr/tesseract-provider.js');

const original=createCanvas(600,200),ctx=original.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,200);ctx.fillStyle='#182023';ctx.font='32px Arial';ctx.fillText('sample',40,80);ctx.fillText('unchanged',250,80);
const pdf=await PDFDocument.create();const image=await pdf.embedPng(original.toBuffer('image/png'));
for(let i=0;i<2;i++)pdf.addPage([600,200]).drawImage(image,{x:0,y:0,width:600,height:200});
const originalBytes=await pdf.save();
const moduleUrl=new URL('../../ocr/scan-editor.js',import.meta.url);
const mod=new vm.SourceTextModule(await readFile(moduleUrl,'utf8'));
await mod.link(async specifier=>{
  const namespace=specifier.includes('rendering/pdfjs.js')?{loadPdfjs:async()=>({getDocument:()=>({destroy:async()=>{},promise:Promise.resolve({numPages:2,getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:200*scale}),getAnnotations:async()=>[],render:({canvasContext,viewport})=>{canvasContext.drawImage(original,0,0,viewport.width,viewport.height);return {promise:Promise.resolve()};}})})})})}:await import(new URL(specifier,moduleUrl));
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);});
});
await mod.evaluate();const {createScannedPdfEditor}=mod.namespace;

TesseractOcrProvider.prototype.recognize=async function(canvas){const scale=canvas.width/600;const words=[{text:'sample',confidence:99,bbox:{x0:40*scale,y0:55*scale,x1:157*scale,y1:87*scale}}];return {words,layout:groupOcrWords(words)};};
TesseractOcrProvider.prototype.terminate=async()=>{};

let exported=null;const warnings=[],errors=[];
const app=document.querySelector('#app');const editor=createScannedPdfEditor({container:app,onWarning:w=>warnings.push(w),onError:e=>errors.push(e),onExport:e=>exported=e});
await editor.open(new Uint8Array(originalBytes));
const button=text=>[...app.querySelectorAll('button')].find(b=>b.textContent===text);
const basePixels=()=>raster(app.querySelector('.ocr-canvas')).toBuffer('image/png');
const before=basePixels();
function position(x,y){
  const c=app.querySelector('.ocr-canvas');c.getBoundingClientRect=()=>({left:20,top:10,width:300,height:100});
  button('Add text').click();
  assert.equal(editor.getState().hasPendingEdit,true);
  c.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:20+x/2,clientY:10+y/2}));
  assert.equal(app.querySelector('textarea').getAttribute('aria-label'),'New text');
}
position(40,110);
app.querySelector('textarea').value='Mobile note';
button('Apply change').click();
assert.equal(warnings.length,0);assert.equal(editor.getState().editCount,1);
const added=app.querySelector('.ocr-added-text');assert.ok(added);assert.ok(Math.abs(parseFloat(added.style.left)-40/600*100)<.01);
assert.deepEqual(basePixels(),before,'adding text must leave original scan pixels intact');
await editor.save();assert.equal(exported.edits,1);assert.equal((await PDFDocument.load(exported.bytes)).getPageCount(),2);
if(process.env.OCR_ARTIFACT_DIR){await writeFile(`${process.env.OCR_ARTIFACT_DIR}/scan-mobile-source.pdf`,originalBytes);await writeFile(`${process.env.OCR_ARTIFACT_DIR}/scan-mobile-added.pdf`,exported.bytes);}
added.click();app.querySelector('textarea').value='Updated note';button('Apply change').click();assert.match(app.querySelector('.ocr-added-text').getAttribute('aria-label'),/Updated note/);
console.log('PASS insertion before OCR, mobile coordinate scaling, re-edit, transparent scan preservation and two-page export');
position(590,195);app.querySelector('textarea').value='This cannot fit';button('Apply change').click();assert.equal(editor.getState().hasPendingEdit,true);assert.match(app.querySelector('.ocr-status').textContent,/beyond the page/);
button('Cancel').click();warnings.length=0;
button('Add text').click();await editor.save();assert.match(warnings.pop().message,/Apply or cancel/);button('Add text').click();
console.log('PASS out-of-page insertion and unfinished placement are refused without losing state');
await editor.runOcr();const picker=app.querySelector('.ocr-text-picker');assert.equal(picker.hidden,false);assert.match(app.querySelector('.ocr-status').textContent,/1 OCR words/);
picker.value='0';picker.dispatchEvent(new dom.window.Event('change'));assert.equal(app.querySelector('textarea').value,'sample');
app.querySelector('textarea').value='tested';button('Apply change').click();assert.equal(warnings.length,0);assert.equal(editor.getState().hasPendingEdit,false);
assert.match(picker.options[1].textContent,/tested/);
console.log('PASS OCR feedback, accessible word selection, replacement and refreshed picker');
TesseractOcrProvider.prototype.recognize=async()=>{throw new Error('OCR connection unavailable. Try again.');};
await editor.runOcr();assert.match(app.querySelector('.ocr-status').textContent,/connection unavailable/);assert.equal(button('Run OCR').disabled,false);assert.equal(button('Add text').disabled,false);assert.equal(errors.length,1);assert.equal(picker.hidden,false);
TesseractOcrProvider.prototype.recognize=async()=>({words:[],layout:groupOcrWords([])});
await editor.runOcr();assert.match(app.querySelector('.ocr-status').textContent,/No reliable words/);assert.equal(picker.hidden,true);
console.log('PASS OCR failure/retry and empty results remain visible beside the page');
app.querySelector('.ocr-added-text').click();button('Delete text').click();assert.equal(app.querySelector('.ocr-added-text'),null);
await editor.save();assert.ok(exported.bytes);assert.equal((await PDFDocument.load(exported.bytes)).getPageCount(),2);
await editor.destroy();console.log('PASS added text deletion and final PDF serialization');
