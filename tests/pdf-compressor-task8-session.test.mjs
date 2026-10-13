import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompressionSession} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
import {createWorkerBridge} from '../assets/js/pdf-compressor-v2/worker-bridge.mjs';
import {digestPDFBytes} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
const bytes=new TextEncoder().encode('%PDF-1.7 test source bytes %%EOF');
const file=(name='source.pdf')=>({name,size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer});
async function result(input,mode='balanced'){
  const digest=await digestPDFBytes(input);
  return {bytes:input.slice(),mode,status:'original-retained',inputBytes:input.length,outputBytes:input.length,savedBytes:0,
    integrity:{version:1,mode,sourceDigest:digest,outputDigest:digest,inputBytes:input.length,
      outputBytes:input.length,savedBytes:0,independentTextVerified:true}};
}
const inspector=async input=>({valid:true,sourceBytes:input.length});
test('retries reuse source, failed replacement retains it, and every output URL is released',async()=>{
  const created=[],revoked=[];let fail=false;
  const session=createCompressionSession({engine:{inspect:async b=>{if(fail)throw {code:'incomplete-pdf'};return inspector(b);},compress:(b,{mode})=>result(b,mode)},
    createURL:()=>{const url='blob:test/'+created.length;created.push(url);return url;},revokeURL:url=>revoked.push(url)});
  assert.equal(session.snapshot().state,'empty');await session.select(file());
  for(const mode of ['balanced','strong','lossless']){
    await session.compress(mode);assert.equal(session.snapshot().canDownload,true);
  }
  fail=true;await session.select(file('replacement.pdf'));
  assert.equal(session.snapshot().state,'failed');assert.equal(session.snapshot().source.name,'source.pdf');
  assert.equal(session.snapshot().canRetry,true);assert.equal(session.snapshot().canDownload,false);
  assert.deepEqual(created,revoked);
  await session.compress('lossless');const navigationCleanup=session.dispose;navigationCleanup();
  assert.equal(session.snapshot().state,'empty');assert.deepEqual(created,revoked);
});
test('cancel/reset discard late loading and processing successes; concurrent runs are rejected',async()=>{
  let complete,read;
  const session=createCompressionSession({engine:{inspect:inspector,compress:async b=>new Promise(resolve=>{complete=()=>result(b).then(resolve);})}});
  const loading=session.select({...file(),arrayBuffer:()=>new Promise(resolve=>{read=()=>resolve(bytes.slice().buffer);})});
  session.cancel();read();assert.equal((await loading).status,'stale');assert.equal(session.snapshot().state,'cancelled');
  await session.select(file());const processing=session.compress();
  await assert.rejects(session.compress(),/source-not-ready/);
  await assert.rejects(session.select(file()),/processing-already-in-progress/);
  session.reset();complete();assert.equal((await processing).status,'stale');assert.equal(session.snapshot().result,null);
});
test('oversize preflight and invalid receipts cannot read or expose downloads',async()=>{
  let reads=0,urls=0;
  const session=createCompressionSession({engine:{inspect:inspector,compress:async b=>({...await result(b),bytes:new Uint8Array(b.length)})},createURL:()=>{urls++;return 'blob:bad';}});
  await session.select({name:'large.pdf',size:20*1024*1024+1,arrayBuffer:async()=>{reads++;}});
  assert.equal(reads,0);assert.equal(session.snapshot().error.code,'file-limit');
  await session.select(file());await session.compress();
  assert.equal(session.snapshot().error.code,'invalid-output-receipt');assert.equal(urls,0);assert.equal(session.snapshot().canRetry,true);
});
test('workers terminate on completion, abort, error and timeout; late messages cannot settle again',async()=>{
  for(const scenario of ['success','abort','error','timeout']){
    let worker,callback,terminations=0;
    const bridge=createWorkerBridge({timeoutMs:10,workerFactory:()=>worker={terminate:()=>{terminations++;},postMessage:()=>{callback=worker.onmessage;}}});
    const controller=new AbortController(),pending=bridge.inspect(bytes,{signal:controller.signal});
    if(scenario==='success')callback({data:{ok:true,report:{valid:true}}});
    if(scenario==='abort')controller.abort();
    if(scenario==='error')worker.onerror({message:'worker crash'});
    if(scenario==='success')await pending;else await assert.rejects(pending);
    callback({data:{ok:true,report:{valid:true}}});assert.equal(terminations,1);
  }
});
