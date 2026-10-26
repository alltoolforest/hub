// Scanned OCR search uses deterministic recognition and real canvas/PDF edits.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {groupOcrWords} from '../../ocr/layout-model.js';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage,DOMMatrix,ImageData,Path2D}=require('../../../../../hybrid-build/node_modules/@napi-rs/canvas');
const {JSDOM}=require('../../../../../hybrid-build/node_modules/jsdom');
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
const pageCanvas=createCanvas(600,200),ctx=pageCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,200);ctx.fillStyle='#182023';ctx.font='32px Arial';ctx.fillText('sample sample',40,80);
const source=await PDFDocument.create(),image=await source.embedPng(pageCanvas.toBuffer('image/png'));source.addPage([600,200]).drawImage(image,{x:0,y:0,width:600,height:200});
const sourceBytes=await source.save(),moduleUrl=new URL('../../ocr/scan-editor.js',import.meta.url),mod=new vm.SourceTextModule(await readFile(moduleUrl,'utf8'));
await mod.link(async specifier=>{
  const namespace=specifier.includes('rendering/pdfjs.js')?{loadPdfjs:async()=>({getDocument:({data})=>({destroy:async()=>{},promise:PDFDocument.load(data).then(doc=>({numPages:1,getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:200*scale}),getAnnotations:async()=>[],render:({canvasContext,viewport})=>{canvasContext.drawImage(pageCanvas,0,0,viewport.width,viewport.height);return {promise:Promise.resolve()};}})}))})})}:await import(new URL(specifier,moduleUrl));
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);});
});
await mod.evaluate();
TesseractOcrProvider.prototype.recognize=async canvas=>{const s=canvas.width/600,words=[
  {text:'sample',confidence:99,bbox:{x0:40*s,y0:55*s,x1:157*s,y1:87*s}},
  {text:'sample',confidence:99,bbox:{x0:260*s,y0:55*s,x1:377*s,y1:87*s}},
];return {words,layout:groupOcrWords(words)};};
TesseractOcrProvider.prototype.terminate=async()=>{};
const {createScannedPdfEditor}=mod.namespace,app=document.querySelector('#app');
const editor=createScannedPdfEditor({container:app,onError:error=>{throw error;}});
await editor.open(new Uint8Array(sourceBytes));await editor.runOcr();
const find=app.querySelector('[aria-label="Find OCR text on this page"]'),replace=app.querySelector('[aria-label="Replace OCR text with"]');
find.value='sam';find.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
const button=label=>[...app.querySelectorAll('.ocr-search button')].find(item=>item.textContent===label);
assert.match(app.querySelector('.ocr-search [role=status]').textContent,/2 OCR matches/);
button('Next').click();assert.ok(app.querySelector('.ocr-word.ocr-search-current'));
find.value='sample';find.dispatchEvent(new dom.window.Event('input',{bubbles:true}));replace.value='book';button('Replace all').click();
assert.equal(app.querySelectorAll('.ocr-word').length,2);
assert.deepEqual([...app.querySelectorAll('.ocr-word')].map(item=>item.textContent),['book','book']);
assert.match(app.querySelector('.ocr-search [role=status]').textContent,/2 OCR replacements applied.*0 matches remain/);
find.value='book';find.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
app.querySelector('[aria-label="Match whole OCR word"]').checked=true;app.querySelector('[aria-label="Match whole OCR word"]').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
assert.match(app.querySelector('.ocr-search [role=status]').textContent,/2 OCR matches/);
replace.value='folio';button('Replace all').click();
assert.deepEqual([...app.querySelectorAll('.ocr-word')].map(item=>item.textContent),['folio','folio']);
assert.match(app.querySelector('.ocr-search [role=status]').textContent,/2 OCR replacements applied.*0 matches remain/);
await editor.destroy();dom.window.close();
console.log('PASS OCR page search, navigation highlight, replace-all, whole-word filtering and patch updates');
