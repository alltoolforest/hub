import { assertPdfjsRuntimeCompatible, ensurePdfjsRuntimeCompat } from './browser-compat.js';

ensurePdfjsRuntimeCompat();

export const PDFJS_VERSION='6.3.289';
export const MODERN_MODULE_PATH='../../vendor/pdf.mjs';
export const LEGACY_MODULE_PATH='../../vendor/pdf.legacy.mjs';
export const LEGACY_WORKER_PATH='../../vendor/pdf.worker.legacy.mjs';
export const STANDARD_FONT_DATA_PATH='../../vendor/standard_fonts/';

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

export function classifyBrowserIdentity({userAgent='',platform='',maxTouchPoints=0}={}){
  const ua=String(userAgent||'');
  const currentPlatform=String(platform||'');
  const ios=/iPad|iPhone|iPod/i.test(ua)||(currentPlatform==='MacIntel'&&Number(maxTouchPoints)>1);
  const webkit=/AppleWebKit/i.test(ua);
  const chromium=/Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|SamsungBrowser/i.test(ua);
  const firefox=/Firefox|FxiOS/i.test(ua);
  const safari=webkit&&!ios&&!chromium&&!firefox&&/Safari/i.test(ua);
  return {ios,safari,webkit,ua};
}

function browserIdentity(){
  if(typeof navigator==='undefined')return {ios:false,safari:false,webkit:false,ua:''};
  return classifyBrowserIdentity({
    userAgent:navigator.userAgent,
    platform:navigator.platform,
    maxTouchPoints:navigator.maxTouchPoints,
  });
}

export function prefersLegacyPdfjs(identity=browserIdentity()){
  // Every browser on iOS uses WebKit. Safari/iOS use the pinned legacy build;
  // no PDF bytes or runtime code is fetched from a third-party CDN.
  return !!(identity?.ios||identity?.safari);
}

export function localStandardFontDataUrl(){
  return new URL(STANDARD_FONT_DATA_PATH,import.meta.url).href;
}

export function withLocalPdfjsAssets(source){
  // All AllToolForest callers currently use the PDF.js object form. Keep the
  // helper conservative for external/primitive call shapes and never override
  // an explicit caller policy.
  if(!source||typeof source!=='object'||ArrayBuffer.isView(source)||source instanceof ArrayBuffer)return source;
  if(source.standardFontDataUrl)return source;
  return {...source,standardFontDataUrl:localStandardFontDataUrl()};
}

export function pdfjsRuntimePolicy(){
  return {
    version:PDFJS_VERSION,
    modernModule:MODERN_MODULE_PATH,
    legacyModule:LEGACY_MODULE_PATH,
    legacyWorker:LEGACY_WORKER_PATH,
    standardFontData:STANDARD_FONT_DATA_PATH,
    externalRuntime:false,
    externalStandardFonts:false,
  };
}

async function loadModern(){
  const module=await import(MODERN_MODULE_PATH);
  return {module,mode:'modern',worker:null,source:'local'};
}

async function loadLegacy(){
  const module=await import(LEGACY_MODULE_PATH);
  const worker=new URL(LEGACY_WORKER_PATH,import.meta.url).href;
  return {module,mode:'legacy',worker,source:'local'};
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

function wrapPdfjsModule(module){
  const getDocument=source=>module.getDocument(withLocalPdfjsAssets(source));
  return new Proxy(module,{
    get(target,property,receiver){
      if(property==='getDocument')return getDocument;
      return Reflect.get(target,property,receiver);
    },
  });
}

export async function loadPdfjs(){
  if(!promise){
    promise=chooseBuild().then(result=>{
      activeMode=result.mode;
      activeLegacyWorker=result.worker||null;
      applyWorker(result.module);
      return wrapPdfjsModule(result.module);
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
