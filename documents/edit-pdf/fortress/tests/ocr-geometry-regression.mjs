// Real PDF.js viewport geometry, canvas insertion and PDF export; deterministic input painting.
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


import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadPdfjs} from '../src/rendering/pdfjs.js';
const pdfjs=await loadPdfjs();
const original=createCanvas(600,200),ctx=original.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,200);ctx.fillStyle='#182023';ctx.font='32px Arial';ctx.fillText('original scan',200,160);
const moduleUrl=new URL('../../ocr/scan-editor.js',import.meta.url);
const mod=new vm.SourceTextModule(await readFile(moduleUrl,'utf8'));
await mod.link(async specifier=>{
  const namespace=specifier.includes('rendering/pdfjs.js')?{loadPdfjs:async()=>({getDocument:options=>{
    const task=pdfjs.getDocument(options);
    return {destroy:()=>task.destroy(),promise:task.promise.then(pdf=>({numPages:pdf.numPages,getPage:async n=>{
      const page=await pdf.getPage(n);
      return {getViewport:o=>page.getViewport(o),getAnnotations:async()=>[],render:({canvasContext,viewport})=>{
        canvasContext.save();canvasContext.setTransform(...viewport.transform);canvasContext.translate(0,200);canvasContext.scale(1,-1);canvasContext.drawImage(original,0,0);canvasContext.restore();return {promise:Promise.resolve()};
      }};
    }}))};
  }})}:await import(new URL(specifier,moduleUrl));
  return new vm.SyntheticModule(Object.keys(namespace),function(){for(const [key,value] of Object.entries(namespace))this.setExport(key,value);});
});
await mod.evaluate();const {createScannedPdfEditor}=mod.namespace;
TesseractOcrProvider.prototype.terminate=async()=>{};
const directory=await mkdtemp(join(tmpdir(),'editpdf-geometry-'));
try{
 for(const cropped of [false,true])for(const rotation of [0,90,180,270]){
  const pdf=await PDFDocument.create(),image=await pdf.embedPng(original.toBuffer('image/png'));
  const page=pdf.addPage([600,200]);page.drawImage(image,{x:0,y:0,width:600,height:200});page.setRotation(globalThis.PDFLib.degrees(rotation));
  if(cropped)page.setCropBox(30,20,540,160);
  const bytes=new Uint8Array(await pdf.save()),app=document.querySelector('#app');let result;
  const editor=createScannedPdfEditor({container:app,onError:e=>{throw e;},onWarning:w=>{throw new Error(w.message);},onExport:e=>result=e});await editor.open(bytes);
  const button=text=>[...app.querySelectorAll('button')].find(b=>b.textContent===text);
  const canvas=app.querySelector('.ocr-canvas'),plan=editor.getState().renderPlans[0];
  canvas.getBoundingClientRect=()=>({left:0,top:0,width:canvas.width/plan.scale,height:canvas.height/plan.scale});
  button('Add text').click();canvas.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:20,clientY:30}));
  app.querySelector('textarea').value='Geometry';app.querySelector('[aria-label="New text size in points"]').value='8';button('Apply change').click();
  assert.equal(editor.getState().editCount,1);await editor.save();assert.ok(result?.bytes);
  const name=`${rotation}-${cropped?'crop':'media'}`;await writeFile(join(directory,name+'-source.pdf'),bytes);await writeFile(join(directory,name+'-export.pdf'),result.bytes);
  await editor.destroy();
 }
 // Independent PDF rendering catches placements that serialize successfully but move or rotate.
 const check=spawnSync('python3',['-c',String.raw`
import fitz,numpy as np,sys,pathlib
root=pathlib.Path(sys.argv[1])
for source in sorted(root.glob('*-source.pdf')):
 result=source.with_name(source.name.replace('-source','-export'))
 with fitz.open(source) as s,fitz.open(result) as e:
  a=s[0].get_pixmap();b=e[0].get_pixmap()
  assert (a.width,a.height)==(b.width,b.height)
  aa=np.frombuffer(a.samples,np.uint8).reshape(a.height,a.width,a.n);bb=np.frombuffer(b.samples,np.uint8).reshape(b.height,b.width,b.n)
  changed=np.any(aa!=bb,axis=2);ys,xs=np.where(changed)
  assert len(xs)>0,source.name+' lost added text'
  assert 19<=xs.min()<25 and 29<=ys.min()<36,(source.name,'wrong origin',xs.min(),ys.min())
  assert xs.max()<75 and ys.max()<45,(source.name,'wrong orientation or scale',xs.max(),ys.max())
  mask=np.ones(changed.shape,dtype=bool);mask[28:46,18:76]=False
  assert not np.any(changed[mask]),source.name+' altered pixels outside text'
  print('PASS rotated/cropped scan export',source.stem)
`,directory],{encoding:'utf8'});
 process.stdout.write(check.stdout);assert.equal(check.status,0,check.stderr);
}finally{await rm(directory,{recursive:true,force:true});}
