import { loadPdfjs, configureWorkerSrc } from './pdfjs.js';
import { canvasRenderPlan } from './canvas-budget.js';
export async function configurePdfWorker(url){return configureWorkerSrc(url);}
export class PdfRenderer{
  constructor(bytes,{maxCachedPages=3}={}){this.bytes=new Uint8Array(bytes);this.doc=null;this.task=null;this.loading=null;this.destroyed=false;this.cache=new Map();this.maxCachedPages=maxCachedPages;}
  async load(){
    if(this.destroyed)throw new Error('PDF renderer is closed.');
    if(this.doc)return this.doc;
    if(!this.loading)this.loading=(async()=>{
      const p=await loadPdfjs();
      if(this.destroyed)throw new Error('PDF renderer is closed.');
      const task=p.getDocument({data:this.bytes.slice(),isEvalSupported:false,useWorkerFetch:false});this.task=task;
      try{this.doc=await task.promise;return this.doc;}
      catch(error){try{await task.destroy();}catch{}if(this.task===task)this.task=null;throw error;}
    })().catch(error=>{this.loading=null;throw error;});
    return this.loading;
  }
  async getPage(i){await this.load();if(this.cache.has(i)){const p=this.cache.get(i);this.cache.delete(i);this.cache.set(i,p);return p;}const p=await this.doc.getPage(i+1);this.cache.set(i,p);while(this.cache.size>this.maxCachedPages){const [k,v]=this.cache.entries().next().value;this.cache.delete(k);try{v.cleanup();}catch{}}return p;}
  async getTextContent(i){return (await this.getPage(i)).getTextContent({disableNormalization:false});}
  async pageInfo(i){const p=await this.getPage(i),v=p.getViewport({scale:1});return{width:v.width,height:v.height,rotation:p.rotate,view:p.view};}
  async render(i,canvas,{scale=1,rotation=null}={}){const p=await this.getPage(i),v=p.getViewport({scale,rotation:rotation??p.rotate}),plan=canvasRenderPlan(v.width,v.height,globalThis.devicePixelRatio);canvas.width=plan.pixelWidth;canvas.height=plan.pixelHeight;canvas.style.width=`${v.width}px`;canvas.style.height=`${v.height}px`;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('This browser could not allocate a PDF canvas.');ctx.setTransform(plan.scaleX,0,0,plan.scaleY,0,0);await p.render({canvasContext:ctx,viewport:v}).promise;return{viewport:v,matrix:[...v.transform],cssWidth:v.width,cssHeight:v.height};}
  async destroy(){this.destroyed=true;const task=this.task;this.task=null;this.cache.clear();this.doc=null;this.bytes=null;try{await task?.destroy();}catch{}}
}
