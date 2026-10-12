// TASK 2 feasibility probe only: browser-native image encoders, WASM and
// off-main-thread capability. Does not edit, upload, or compress a PDF.
// Start local server; npm install --no-save playwright@1.56.1
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const BASE=process.env.PDF_COMPRESSOR_BASE_URL||'http://127.0.0.1:8765/';
const contexts=[
  ['chromium-desktop',chromium,{width:1280,height:800},false],
  ['chromium-mobile-viewport',chromium,{width:360,height:780},true],
  ['firefox-desktop',firefox,{width:1280,height:800},false],
  ['webkit-mobile-viewport',webkit,{width:390,height:844},true]
];
const report=[];
for(const [name,engine,viewport,isMobile] of contexts){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({
    viewport,isMobile:isMobile&&name.startsWith('chromium'),
    hasTouch:isMobile
  });
  const page=await context.newPage();
  const externalRequests=[];
  page.on('request',r=>{
    if(!r.url().startsWith('blob:')&&new URL(r.url()).origin!==new URL(BASE).origin)
      externalRequests.push(r.url());
  });
  try{
    await page.goto(new URL('documents/pdf-compressor/',BASE),{
      waitUntil:'domcontentloaded',timeout:30000
    });
    const data=await page.evaluate(async()=>{
      const now=()=>performance.now();
      const width=640,height=900;
      const c=document.createElement('canvas');
      c.width=width;c.height=height;
      const ctx=c.getContext('2d',{willReadFrequently:false});
      // Synthesize a page-like raster with text-patterns and color bands.
      ctx.fillStyle='#f7f7f5';ctx.fillRect(0,0,width,height);
      for(let y=16;y<height-20;y+=24){
        ctx.fillStyle=y%48===16?'#303030':'#606060';
        ctx.fillRect(24,y,width-48,2);
        ctx.fillRect(24,y+6,Math.max(160,(y*29)%540),2);
      }
      for(let i=0;i<90;i++){
        ctx.fillStyle='rgb('+((i*59)%255)+','+((i*31)%255)+','+((i*71)%255)+')';
        ctx.fillRect((i*61)%width,650+(i*23)%220,13,8);
      }
      const encode=async(type,quality)=>{
        const started=now();
        const blob=await new Promise(resolve=>c.toBlob(resolve,type,quality));
        if(!blob) return {requested:type,supported:false};
        const actualType=blob.type;
        let decoded=false,correctDimensions=false;
        try{
          const bitmap=await createImageBitmap(blob);
          decoded=true;correctDimensions=bitmap.width===width&&bitmap.height===height;
          bitmap.close();
        }catch{}
        return {requested:type,actualType,bytes:blob.size,
          encodeMs:Number((now()-started).toFixed(2)),
          supported:actualType===type,decoded,correctDimensions};
      };
      const codecs=[];
      for(const item of [
        ['image/png',undefined],['image/jpeg',0.78],['image/webp',0.78]
      ])codecs.push(await encode(item[0],item[1]));
      const wasmHeader=new Uint8Array([0,97,115,109,1,0,0,0]);
      let wasmInstantiates=false;
      try{await WebAssembly.instantiate(wasmHeader);wasmInstantiates=true;}catch{}
      let workerAvailable=false,workerWasm=false,workerOffscreen=false,workerError=null;
      try{
        const source='self.onmessage=()=>postMessage({wasm:typeof WebAssembly!=="undefined",offscreen:typeof OffscreenCanvas!=="undefined"});';
        const url=URL.createObjectURL(new Blob([source],{type:'application/javascript'}));
        try{
          const worker=new Worker(url);
          try{
            const response=await new Promise((resolve,reject)=>{
              worker.onmessage=e=>resolve(e.data);
              worker.onerror=e=>reject(Error(e.message||'worker error'));
              worker.postMessage({});
            });
            workerAvailable=true;workerWasm=response.wasm;workerOffscreen=response.offscreen;
          }finally{worker.terminate();}
        }finally{URL.revokeObjectURL(url);}
      }catch(e){workerError=String(e.message||e);}
      c.width=0;c.height=0;
      return {
        wasmInstantiates,workerAvailable,workerWasm,workerOffscreen,workerError,
        createImageBitmapAvailable:typeof createImageBitmap==='function',
        offscreenCanvasAvailable:typeof OffscreenCanvas==='function',
        deviceMemoryGiB:navigator.deviceMemory??null,
        hardwareConcurrency:navigator.hardwareConcurrency??null,
        imagePixels:width*height,
        estimatedRgbaBytes:width*height*4,
        codecs
      };
    });
    assert.equal(data.wasmInstantiates,true,'Browser cannot instantiate minimal WASM');
    assert.equal(data.workerAvailable,true,'Blob worker unavailable');
    assert.equal(data.workerWasm,true,'WebAssembly unsupported within worker');
    for(const type of ['image/png','image/jpeg']){
      const codec=data.codecs.find(item=>item.requested===type);
      assert.ok(codec.supported&&codec.decoded&&codec.correctDimensions,
        type+' encoding/decoding failed on '+name);
    }
    assert.deepEqual(externalRequests,[],'Unexpected cross-origin network requests');
    report.push({name,...data,externalRequests:0,pass:true,
      caveat:'Browser emulator / CI desktop viewport, NOT a physical phone benchmark.'});
  }catch(e){
    report.push({name,pass:false,error:String(e?.stack||e).slice(0,700)});
    throw e;
  }finally{
    await context.close();await browser.close();
  }
}
console.log('PDF_COMPRESSOR_TASK2_BROWSER_JSON_START');
console.log(JSON.stringify({task:'Task 2 browser codec and WASM feasibility',
  report,disclaimer:'This only demonstrates image encoding and worker capabilities; not full PDF image-resource integrity or QPDF WASM functionality.'},null,2));
console.log('PDF_COMPRESSOR_TASK2_BROWSER_JSON_END');
