// EXPERIMENTAL v3: opt-in destructive PDF page rasterization in a disposable worker.
// This module is not mounted on any production or staging tool route.
export class AggressiveRasterError extends Error {
  constructor(code){super(code);this.name='AggressiveRasterError';this.code=code;}
}
const fail=code=>{throw new AggressiveRasterError(code);};
export const RASTER_PROFILES=Object.freeze({
  balanced:Object.freeze({dpi:125,jpegQuality:0.64,maxPagePixels:6_000_000}),
  strong:Object.freeze({dpi:100,jpegQuality:0.43,maxPagePixels:4_000_000}),
  maximum:Object.freeze({dpi:78,jpegQuality:0.24,maxPagePixels:2_600_000})
});
function guard(signal){if(signal?.aborted)fail('cancelled');}
function boundedViewport(page,profile){
  const initial=page.getViewport({scale:profile.dpi/72});
  if(!(initial.width>0&&initial.height>0)||!Number.isFinite(initial.width*initial.height))
    fail('invalid-page-geometry');
  const downscale=Math.min(1,Math.sqrt(profile.maxPagePixels/(initial.width*initial.height)));
  const viewport=downscale===1?initial:page.getViewport({scale:profile.dpi*downscale/72});
  const width=Math.max(1,Math.ceil(viewport.width)),height=Math.max(1,Math.ceil(viewport.height));
  if(!Number.isSafeInteger(width*height)||width*height>profile.maxPagePixels+20000)
    fail('page-render-budget');
  return {viewport,width,height};
}
export async function rasterizePdfAggressively(sourceBytes,{
  pdfjs,PDF,mode='maximum',consentToFlatten=false,
  // The integrating caller MUST check PDF restrictions/signatures and
  // independently authorize loss of text/forms/annotations/attachments.
  inspectRestrictions,signal,onProgress=()=>{},
  makeCanvas=(width,height)=>new OffscreenCanvas(width,height),
  maxOutputBytes=100_000_000,requireSavings=true,
  // Only true for a File->worker transfer where this worker uniquely owns bytes.
  workerOwnsInput=false,maxPages=1200,maxRunMs=180000
}={}){
  if(!consentToFlatten)fail('flatten-consent-required');
  if(!RASTER_PROFILES[mode])fail('invalid-mode');
  if(!(sourceBytes instanceof Uint8Array)||sourceBytes.length<16)fail('invalid-source');
  if(typeof inspectRestrictions!=='function')fail('security-inspection-required');
  if(!pdfjs?.getDocument||!PDF?.PDFDocument?.create||!PDF?.PDFDocument?.load)fail('runtime-unavailable');
  if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1024)fail('invalid-output-budget');
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10000)fail('invalid-page-budget');
  if(!Number.isFinite(maxRunMs)||maxRunMs<1000)fail('invalid-time-budget');
  const inputBytes=sourceBytes.length,deadline=performance.now()+maxRunMs;
  const budget=()=>{guard(signal);if(performance.now()>deadline)fail('processing-timeout');};
  budget();
  const inspection=await inspectRestrictions(sourceBytes,{signal,mode});
  if(inspection?.allowed!==true)fail(inspection?.code??'restricted-document');
  guard(signal);
  let task=null,source=null,canvas=null;
  const profile=RASTER_PROFILES[mode];
  try{
    task=pdfjs.getDocument({data:workerOwnsInput?sourceBytes:sourceBytes.slice(),stopAtErrors:true,
      isEvalSupported:false,disableAutoFetch:true,disableStream:true});
    source=await task.promise;
    const pages=source.numPages;
    if(!Number.isSafeInteger(pages)||pages<1||pages>maxPages)fail('invalid-page-count');
    const output=await PDF.PDFDocument.create({updateMetadata:false});
    let totalEncoded=0,maxResidentPixels=0;
    for(let number=1;number<=pages;number++){
      budget();
      const page=await source.getPage(number);
      try{
        const {viewport,width,height}=boundedViewport(page,profile);
        maxResidentPixels=Math.max(maxResidentPixels,width*height);
        canvas=makeCanvas(width,height);
        if(!canvas||typeof canvas.convertToBlob!=='function')fail('canvas-unavailable');
        const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:false});
        if(!ctx)fail('canvas-context-unavailable');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
        const render=page.render({canvasContext:ctx,viewport,intent:'print',
          background:'rgb(255,255,255)'});
        const stop=()=>render.cancel();
        signal?.addEventListener('abort',stop,{once:true});
        try{await render.promise;}finally{signal?.removeEventListener('abort',stop);}
        budget();
        const blob=await canvas.convertToBlob({type:'image/jpeg',quality:profile.jpegQuality});
        if(blob?.type!=='image/jpeg'||blob.size<4)fail('jpeg-encode-failed');
        const jpg=new Uint8Array(await blob.arrayBuffer());
        if(jpg[0]!==255||jpg[1]!==216||jpg.at(-2)!==255||jpg.at(-1)!==217)
          fail('invalid-encoded-jpeg');
        totalEncoded+=jpg.length;
        if(totalEncoded>maxOutputBytes)fail('output-budget');
        const embedded=await output.embedJpg(jpg);
        // The unit-scale PDF.js viewport is in PDF points after page rotation.
        const box=page.getViewport({scale:1});
        if(!(box.width>0&&box.height>0))fail('invalid-page-geometry');
        const sheet=output.addPage([box.width,box.height]);
        sheet.drawImage(embedded,{x:0,y:0,width:box.width,height:box.height});
        onProgress({stage:'raster-page',completed:number,total:pages});
      }finally{
        if(canvas){canvas.width=0;canvas.height=0;canvas=null;}
        page.cleanup?.();
      }
    }
    budget();
    const bytes=new Uint8Array(await output.save({useObjectStreams:true,addDefaultPage:false}));
    if(bytes.length>maxOutputBytes)fail('output-budget');
    if(requireSavings&&bytes.length>=inputBytes)
      return {status:'not-smaller',bytes:null,inputBytes,outputBytes:bytes.length,
        pages,destructive:true,mode,maxResidentPixels};
    const reopened=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
    if(reopened.getPageCount()!==pages)fail('output-page-count-mismatch');
    for(const sheet of reopened.getPages()){
      const box=sheet.getMediaBox();
      if(!(box.width>0&&box.height>0))fail('invalid-output-page-geometry');
    }
    return {status:'compressed',bytes,inputBytes,outputBytes:bytes.length,
      pages,destructive:true,mode,maxResidentPixels,
      warnings:['all-pages-rasterized','selectable-text-removed','interactive-forms-and-attachments-not-preserved']};
  }catch(error){
    if(error instanceof AggressiveRasterError)throw error;
    if(signal?.aborted)fail('cancelled');
    throw new AggressiveRasterError('raster-processing-failed');
  }finally{
    if(canvas){canvas.width=0;canvas.height=0;}
    try{await source?.destroy?.();}catch{}
    try{await task?.destroy?.();}catch{}
  }
}

// Worker-scoped WebKit compatibility. Some Safari/WebKit implementations lack
// ReadableStream async iteration although getReader() is standards-compliant.
// Call before loading PDF.js inside the isolated v3 worker; do not install
// globally on shared AllToolForest pages or other frozen tools.
export function installV3StreamIterator(scope=globalThis){
 const proto=scope?.ReadableStream?.prototype;
 if(!proto)return false;
 if(typeof proto[Symbol.asyncIterator]==='function')return true;
 Object.defineProperty(proto,Symbol.asyncIterator,{configurable:true,writable:true,
   value:async function*(){
     const reader=this.getReader();
     try{
       while(true){
         const {done,value}=await reader.read();
         if(done)break;
         yield value;
       }
     }finally{
       try{await reader.cancel();}catch{}
       reader.releaseLock();
     }
   }});
 return true;
}
