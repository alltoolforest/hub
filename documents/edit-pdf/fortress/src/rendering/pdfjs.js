import { assertPdfjsRuntimeCompatible, ensurePdfjsRuntimeCompat } from './browser-compat.js';

ensurePdfjsRuntimeCompat();

const PDFJS_VERSION='6.3.289';
const LEGACY_CANDIDATES=[
  {
    module:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.mjs`,
    worker:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.mjs`,
    source:'jsdelivr',
  },
  {
    module:`https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.mjs`,
    worker:`https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.mjs`,
    source:'unpkg',
  },
];

let promise=null;
let activeMode=null;
let activeLegacyWorker=null;
let requestedWorkerSrc=null;

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

function browserIdentity(){
  if(typeof navigator==='undefined')return {ios:false,safari:false,webkit:false};
  const ua=String(navigator.userAgent||'');
  const platform=String(navigator.platform||'');
  const ios=/iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
  const webkit=/AppleWebKit/i.test(ua);
  const chromium=/Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|SamsungBrowser/i.test(ua);
  const firefox=/Firefox|FxiOS/i.test(ua);
  const safari=webkit&&!ios&&!chromium&&!firefox&&/Safari/i.test(ua);
  return {ios,safari,webkit,ua};
}

export function prefersLegacyPdfjs(){
  const identity=browserIdentity();
  // Every browser on iOS uses WebKit. PDF.js itself recommends the legacy
  // distribution for older browser runtimes, and Safari remains the browser
  // family with the largest compatibility surface for the modern bundle.
  return identity.ios||identity.safari;
}

async function loadModern(){
  const module=await import('../../vendor/pdf.mjs');
  return {module,mode:'modern',worker:null,source:'local'};
}

async function loadLegacy(){
  let lastError=null;
  for(const candidate of LEGACY_CANDIDATES){
    try{
      const module=await import(candidate.module);
      return {module,mode:'legacy',worker:candidate.worker,source:candidate.source};
    }catch(error){lastError=error;}
  }
  throw lastError||new Error('The Safari-compatible PDF engine could not be loaded.');
}

async function chooseBuild(){
  ensureNodeDomMatrix();
  ensurePdfjsRuntimeCompat();
  assertPdfjsRuntimeCompatible();
  const legacyFirst=prefersLegacyPdfjs();
  let firstError=null;
  if(legacyFirst){
    try{return await loadLegacy();}catch(error){firstError=error;}
    try{return await loadModern();}catch(error){
      const wrapped=new Error(`Safari-compatible and standard PDF engines both failed to start. ${error?.message||firstError?.message||''}`.trim());
      wrapped.code='PDFJS_ALL_BUILDS_FAILED';wrapped.cause=error;wrapped.firstCause=firstError;throw wrapped;
    }
  }
  try{return await loadModern();}catch(error){firstError=error;}
  try{return await loadLegacy();}catch(error){
    const wrapped=new Error(`Standard and compatibility PDF engines both failed to start. ${error?.message||firstError?.message||''}`.trim());
    wrapped.code='PDFJS_ALL_BUILDS_FAILED';wrapped.cause=error;wrapped.firstCause=firstError;throw wrapped;
  }
}

function applyWorker(module){
  if(!module?.GlobalWorkerOptions)return;
  const worker=activeMode==='legacy'?activeLegacyWorker:requestedWorkerSrc;
  if(worker)module.GlobalWorkerOptions.workerSrc=worker;
}

export async function loadPdfjs(){
  if(!promise){
    promise=chooseBuild().then(result=>{
      activeMode=result.mode;
      activeLegacyWorker=result.worker||null;
      applyWorker(result.module);
      return result.module;
    }).catch(error=>{
      promise=null;activeMode=null;activeLegacyWorker=null;
      if(error?.code==='PDFJS_ALL_BUILDS_FAILED'||error?.code==='BROWSER_PDF_RUNTIME_UNSUPPORTED')throw error;
      const wrapped=new Error(`PDF engine could not start in this browser. ${error?.message||''}`.trim());
      wrapped.code='PDFJS_RUNTIME_INIT_FAILED';wrapped.cause=error;throw wrapped;
    });
  }
  return promise;
}

export async function configureWorkerSrc(url){
  requestedWorkerSrc=url;
  const module=await loadPdfjs();
  applyWorker(module);
  return {mode:activeMode,workerSrc:module.GlobalWorkerOptions?.workerSrc||null};
}

export function getPdfjsRuntimeMode(){return activeMode;}
