// PDF Merger Task 3 only — browser-local, bounded first-page thumbnail rendering.
// No modifications to PDF.js vendor code or other AllToolForest tools.
import {load,url} from './core.js';

export const PDF_MERGER_THUMBNAIL=Object.freeze({
 mobileMaxFileBytes:12*1024*1024,
 desktopMaxFileBytes:32*1024*1024,
 maxWidth:158,
 maxHeight:210,
 maxPixels:34000
});
export function previewEligibility(file,isMobile){
 const max=isMobile?PDF_MERGER_THUMBNAIL.mobileMaxFileBytes:PDF_MERGER_THUMBNAIL.desktopMaxFileBytes;
 if(file.size>max)return {allowed:false,reason:'Preview skipped for this large file to protect device memory. The PDF can still be merged.'};
 return {allowed:true,reason:''};
}
export function thumbnailDimensions(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
  throw Error('Invalid PDF page dimensions for preview.');
 const scale=Math.min(1,PDF_MERGER_THUMBNAIL.maxWidth/width,
  PDF_MERGER_THUMBNAIL.maxHeight/height,
  Math.sqrt(PDF_MERGER_THUMBNAIL.maxPixels/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale};
}
export function ensurePdfJsCompatibility(){
 // The locally bundled PDF.js version uses proposal-stage Map helpers.
 // Install only when absent, only on a PDF Merger page; never overwrite native methods.
 for(const Klass of [Map,WeakMap]){
  if(typeof Klass.prototype.getOrInsertComputed!=='function'){
   Object.defineProperty(Klass.prototype,'getOrInsertComputed',{
    configurable:true,writable:true,value:function(key,callback){
     if(this.has(key))return this.get(key);
     const value=callback(key);this.set(key,value);return value;
    }
   });
  }
  if(typeof Klass.prototype.getOrInsert!=='function'){
   Object.defineProperty(Klass.prototype,'getOrInsert',{
    configurable:true,writable:true,value:function(key,value){
     if(this.has(key))return this.get(key);
     this.set(key,value);return value;
    }
   });
  }
 }
}
export async function renderPdfMergerThumbnail(file,canvas,{signal=null,isMobile=false}={}){
 const eligibility=previewEligibility(file,isMobile);
 if(!eligibility.allowed)return eligibility;
 if(signal?.aborted)throw Error('Preview cancelled');
 ensurePdfJsCompatibility();
 const pdfjs=await load('pdfjs');
 if(signal?.aborted)throw Error('Preview cancelled');
 pdfjs.GlobalWorkerOptions.workerSrc=url('assets/vendor/pdf.worker.mjs');
 let task=null,doc=null,page=null,renderTask=null;
 try{
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(signal?.aborted)throw Error('Preview cancelled');
  task=pdfjs.getDocument({
   data:bytes,isEvalSupported:false,
   cMapUrl:url('assets/vendor/cmaps/'),cMapPacked:true,
   standardFontDataUrl:url('assets/vendor/standard_fonts/'),
   wasmUrl:url('assets/vendor/wasm/'),
   disableAutoFetch:true
  });
  doc=await task.promise;
  if(signal?.aborted)throw Error('Preview cancelled');
  page=await doc.getPage(1);
  const original=page.getViewport({scale:1});
  const dimensions=thumbnailDimensions(original.width,original.height);
  const viewport=page.getViewport({scale:dimensions.scale});
  // PDF.js can use viewport decimal dimensions; the actual canvas remains bounded.
  canvas.width=dimensions.width;canvas.height=dimensions.height;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Canvas preview is unavailable.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
  renderTask=page.render({canvasContext:ctx,viewport});
  await renderTask.promise;
  if(signal?.aborted)throw Error('Preview cancelled');
  return {allowed:true,reason:'',width:canvas.width,height:canvas.height};
 }finally{
  // Some supported PDF.js builds omit destroy(). Use optional cleanup.
  if(signal?.aborted)try{renderTask?.cancel?.();}catch{}
  try{page?.cleanup?.();}catch{}
  try{await doc?.destroy?.();}catch{}
  if(!doc&&task)try{await task.destroy?.();}catch{}
 }
}
