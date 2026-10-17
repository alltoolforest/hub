import assert from 'node:assert/strict';
import {checkRenderedOutput} from './pdf-compressor-task5-render-check.mjs';
import {buildImageFixture} from './pdf-compressor-task5-fixtures.mjs';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';

const selected=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const engine={chromium,firefox,webkit}[selected];
if(!engine)throw Error('Unsupported test browser');
const browser=await engine.launch({headless:true,timeout:30000});
try{
  const context=await browser.newContext(),page=await context.newPage(),unexpected=[];
  let localBlobRequests=0;
  const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'";
  await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    // WebKit routes local Blob image decoding through this hook. It remains
    // in browser memory and cannot be fetched by the HTTP request context.
    if(url.protocol==='blob:'&&url.origin==='http://127.0.0.1:8766'&&r.method()==='GET'){
      localBlobRequests++;return route.continue();
    }
    if(url.origin!=='http://127.0.0.1:8766'||r.method()!=='GET'){
      unexpected.push({url:r.url(),method:r.method()});return route.abort();
    }
    if(url.pathname==='/compressor-worker-gate')return route.fulfill({status:200,contentType:'text/html',
      headers:{'Content-Security-Policy':policy},
      body:'<!doctype html><title>Isolated compressor worker test</title>'});
    // Dedicated workers use their own response CSP rather than inheriting the
    // document policy. Apply the same restriction to every local response.
    const response=await route.fetch();
    return route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});
  });
  await page.goto('http://127.0.0.1:8766/compressor-worker-gate');
  const report=[];
  const inputs=[];
  for(const id of ['digital','scanned','image-heavy','mixed','form','bookmarks','attachment','tagged'])inputs.push({id,bytes:(await buildFixture(id)).bytes});
  for(const [id,options] of [['gray-scan',{gray:true}],['shared-image',{shared:true}],['masked-image',{masked:true}],['hidden-ocr',{hiddenOCR:true}],['downsample-scan',{width:2500,height:1100}],['jpeg-scan',{jpegQuality:98}],['efficient-jpeg',{jpegQuality:45}]])inputs.push({id,bytes:await buildImageFixture(options)});
  for(const mode of ['lossless','balanced','strong','maximum'])for(const {id,bytes} of inputs){
    const started=performance.now();
    const raw=await page.evaluate(async ({data,mode})=>{
      const worker=new Worker('/tests/pdf-compressor-task6-worker.mjs',{type:'module'});
      try{
        const result=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('worker-timeout')),30000);
          worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
          worker.onmessage=event=>{
            // PDF.js may announce its worker handshake before the app result.
            if(typeof event.data?.ok!=='boolean')return;
            clearTimeout(timer);resolve(event.data);
          };
          const input=new Uint8Array(data);worker.postMessage({bytes:input,mode},[input.buffer]);
        });
        if(!result.ok)throw Error(result.code+': '+result.message+'; '+(result.diagnostic??''));
        return {...result.result,bytes:Array.from(result.result.bytes)};
      }finally{worker.terminate();}
    },{data:Array.from(bytes),mode});
    const output=new Uint8Array(raw.bytes);
    const reopened=await PDF.PDFDocument.load(output); assert.equal(reopened.getPageCount(),(await PDF.PDFDocument.load(bytes)).getPageCount());
    assert.ok(output.length<=bytes.length);
    if(raw.status==='original-retained')assert.deepEqual(output,bytes);
    assert.equal(raw.mode,mode);assert.equal(raw.inputBytes,bytes.length);assert.equal(raw.outputBytes,output.length);assert.equal(raw.savedBytes,bytes.length-output.length);
    assert.equal(raw.stages.at(-1).engine,'lossless');
    if(mode==='lossless'||['digital','form','bookmarks','attachment','tagged','masked-image'].includes(id))assert.equal(raw.stages.length,1);
    if(['jpeg-scan','scanned'].includes(id)&&mode!=='lossless')assert.equal(raw.stages[0].engine,'embedded-images');
    assert.equal(raw.settings.imageQualityReductionAllowed,mode!=='lossless');
    if(mode==='lossless'||id==='digital')assert.equal(raw.settings.imageTransformationApplied,false);
    const renderedRMS=await checkRenderedOutput(bytes,output,mode,{requireOCR:id==='hidden-ocr'});
    report.push({fixture:id,mode,renderedRMS,status:raw.status,inputBytes:bytes.length,
      outputBytes:output.length,savedBytes:raw.savedBytes,elapsedMs:Math.round(performance.now()-started)});
  }
  assert.deepEqual(unexpected,[]);
  assert.ok(report.some(row=>row.savedBytes>0));
  assert.ok(report.find(r=>r.fixture==='scanned'&&r.mode==='strong').outputBytes<
    report.find(r=>r.fixture==='scanned'&&r.mode==='balanced').outputBytes);
  console.log(JSON.stringify({browser:selected,documentAwarePipeline:true,moduleWorker:true,
    strictCSP:true,localBlobRequests,unexpectedRequests:unexpected,report},null,2));
}finally{await browser.close();}
