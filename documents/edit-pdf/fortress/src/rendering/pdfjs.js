import { assertPdfjsRuntimeCompatible, ensurePdfjsRuntimeCompat } from './browser-compat.js';

ensurePdfjsRuntimeCompat();

let promise=null;
function ensureNodeDomMatrix(){
  if(typeof globalThis.DOMMatrix!=='undefined') return;
  class DOMMatrixPolyfill{
    constructor(init=[1,0,0,1,0,0]){const a=Array.isArray(init)?init:[1,0,0,1,0,0];[this.a,this.b,this.c,this.d,this.e,this.f]=a;}
    translateSelf(x=0,y=0){this.e+=x;this.f+=y;return this;}
    scaleSelf(x=1,y=x){this.a*=x;this.b*=x;this.c*=y;this.d*=y;return this;}
    rotateSelf(){return this;}
    multiplySelf(){return this;}
    preMultiplySelf(){return this;}
    invertSelf(){return this;}
  }
  globalThis.DOMMatrix=DOMMatrixPolyfill;
}

export async function loadPdfjs(){
  if(!promise){
    ensureNodeDomMatrix();
    ensurePdfjsRuntimeCompat();
    assertPdfjsRuntimeCompatible();
    promise=import('../../vendor/pdf.mjs').catch(error=>{
      promise=null;
      const wrapped=new Error(`PDF engine could not start in this browser. ${error?.message||''}`.trim());
      wrapped.code='PDFJS_RUNTIME_INIT_FAILED';wrapped.cause=error;throw wrapped;
    });
  }
  return promise;
}
export async function configureWorkerSrc(url){const p=await loadPdfjs();p.GlobalWorkerOptions.workerSrc=url;}
