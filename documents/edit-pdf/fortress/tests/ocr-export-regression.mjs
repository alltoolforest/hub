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
if(process.env.OCR_ARTIFACT_DIR){await writeFile(`${process.env.OCR_ARTIFACT_DIR}/ocr-style-source.pdf`,originalBytes);await writeFile(`${process.env.OCR_ARTIFACT_DIR}/ocr-style-export.pdf`,exported.bytes);await writeFile(`${process.env.OCR_ARTIFACT_DIR}/ocr-style-canvas.png`,first);}
await editor.destroy();console.log('PASS OCR replacement, repeated edits, and real two-page PDF export');
