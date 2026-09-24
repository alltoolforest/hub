import { loadPdfjs, configureWorkerSrc } from './pdfjs.js';
export async function configurePdfWorker(url){return configureWorkerSrc(url);}
export class PdfRenderer{
  constructor(bytes,{maxCachedPages=3}={}){this.bytes=new Uint8Array(bytes);this.doc=null;this.cache=new Map();this.maxCachedPages=maxCachedPages;}
  async load(){if(this.doc)return this.doc;const p=await loadPdfjs();const task=p.getDocument({data:this.bytes.slice(),isEvalSupported:false,useWorkerFetch:false});this.doc=await task.promise;return this.doc;}
  async getPage(i){await this.load();if(this.cache.has(i)){const p=this.cache.get(i);this.cache.delete(i);this.cache.set(i,p);return p;}const p=await this.doc.getPage(i+1);this.cache.set(i,p);while(this.cache.size>this.maxCachedPages){const [k,v]=this.cache.entries().next().value;this.cache.delete(k);try{v.cleanup();}catch{}}return p;}
  async getTextContent(i){return (await this.getPage(i)).getTextContent({disableNormalization:false});}
  async pageInfo(i){const p=await this.getPage(i),v=p.getViewport({scale:1});return{width:v.width,height:v.height,rotation:p.rotate,view:p.view};}
  async render(i,canvas,{scale=1,rotation=null}={}){const p=await this.getPage(i),v=p.getViewport({scale,rotation:rotation??p.rotate}),dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.ceil(v.width*dpr);canvas.height=Math.ceil(v.height*dpr);canvas.style.width=`${v.width}px`;canvas.style.height=`${v.height}px`;const ctx=canvas.getContext('2d',{alpha:false});ctx.setTransform(dpr,0,0,dpr,0,0);await p.render({canvasContext:ctx,viewport:v}).promise;return{viewport:v,matrix:[...v.transform],cssWidth:v.width,cssHeight:v.height};}
  destroy(){try{this.doc?.destroy();}catch{}this.cache.clear();this.doc=null;}
}
