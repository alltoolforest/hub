import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture} from './pdf-compressor-task1-fixtures.mjs';
const selected=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const browser=await {chromium,firefox,webkit}[selected].launch();
try{
  const page=await browser.newPage(),remote=[];
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.protocol==='blob:'&&url.origin==='http://127.0.0.1:8766')return route.continue();
    if(url.origin!=='http://127.0.0.1:8766'||request.method()!=='GET'){remote.push(url.origin);return route.abort();}
    const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'";
    if(url.pathname==='/session-test')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Session gate</title>',headers:{'Content-Security-Policy':policy}});
    const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});
  });
  await page.goto('http://127.0.0.1:8766/session-test');
  const data=Array.from((await buildFixture('mixed')).bytes);
  const report=await page.evaluate(async data=>{
    const {createWorkerBridge}=await import('/assets/js/pdf-compressor-v2/worker-bridge.mjs');
    const {createCompressionSession}=await import('/assets/js/pdf-compressor-v2/compression-session.mjs');
    let started=0,terminated=0;const created=[],revoked=[],states=[];
    const engine=createWorkerBridge({workerFactory:()=>{
      started++;const worker=new Worker('/tests/pdf-compressor-task8-worker.mjs',{type:'module'});
      const terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminated++;terminate();};return worker;
    }});
    const session=createCompressionSession({engine,onChange:s=>states.push(s.state),
      createURL:blob=>{const url=URL.createObjectURL(blob);created.push(url);return url;},
      revokeURL:url=>{revoked.push(url);URL.revokeObjectURL(url);}});
    await session.select(new File([new Uint8Array(data)],'test.pdf',{type:'application/pdf'}));
    if(session.snapshot().state!=='ready')throw Error('input inspection failed');
    const modes=[];
    for(const mode of ['balanced','strong','lossless']){
      await session.compress(mode);const s=session.snapshot();
      if(!s.canDownload||s.result.mode!==mode)throw Error('verified output missing');
      modes.push({mode,size:s.result.outputBytes});
    }
    await session.select(new File(['invalid PDF source'],'bad.pdf'));
    if(session.snapshot().source.name!=='test.pdf'||!session.snapshot().canRetry)throw Error('valid source lost');
    const cancelled=session.compress();session.cancel();await cancelled;
    if(session.snapshot().canDownload||session.snapshot().state!=='cancelled')throw Error('stale result exposed');
    await session.compress('balanced');session.reset();
    if(session.snapshot().state!=='empty')throw Error('reset failed');
    return {modes,started,terminated,created,revoked,states};
  },data);
  assert.equal(report.started,report.terminated);assert.deepEqual(report.created,report.revoked);
  assert.deepEqual(remote,[]);assert.ok(report.states.includes('failed'));assert.ok(report.states.includes('cancelled'));
  console.log(JSON.stringify({browser:selected,sessionLifecycle:true,noRemoteRequests:true,report},null,2));
}finally{await browser.close();}
