import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const selected=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const engine={chromium,firefox,webkit}[selected];
if(!engine)throw Error('Unsupported test browser');
const browser=await engine.launch({headless:true,timeout:30000});
try{
  const context=await browser.newContext(),page=await context.newPage(),unexpected=[];
  const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'";
  await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(url.origin!=='http://127.0.0.1:8765'||r.method()!=='GET'){
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
  await page.goto('http://127.0.0.1:8765/compressor-worker-gate');
  const report=[];
  for(const id of ['scanned','mixed','form','bookmarks','attachment','tagged']){
    const {bytes}=await buildFixture(id),started=performance.now();
    const raw=await page.evaluate(async data=>{
      const worker=new Worker('/tests/pdf-compressor-task4-worker.mjs',{type:'module'});
      try{
        const result=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('worker-timeout')),30000);
          worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
          worker.onmessage=event=>{
            // PDF.js may announce its worker handshake before the app result.
            if(typeof event.data?.ok!=='boolean')return;
            clearTimeout(timer);resolve(event.data);
          };
          const input=new Uint8Array(data);worker.postMessage({bytes:input},[input.buffer]);
        });
        if(!result.ok)throw Error(result.code+': '+result.message);
        return {...result.result,bytes:Array.from(result.result.bytes)};
      }finally{worker.terminate();}
    },Array.from(bytes));
    const output=new Uint8Array(raw.bytes);
    assert.equal(await losslessFingerprint(output,{PDF}),await losslessFingerprint(bytes,{PDF}));
    assert.ok(output.length<=bytes.length);
    report.push({fixture:id,status:raw.status,inputBytes:bytes.length,
      outputBytes:output.length,savedBytes:raw.savedBytes,elapsedMs:Math.round(performance.now()-started)});
  }
  assert.deepEqual(unexpected,[]);
  assert.ok(report.some(row=>row.savedBytes>0));
  console.log(JSON.stringify({browser:selected,sourceBuiltWasm:true,moduleWorker:true,
    strictCSP:true,unexpectedRequests:unexpected,report},null,2));
}finally{await browser.close();}
