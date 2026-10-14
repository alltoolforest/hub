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
  await session.select({name:'large.pdf',size:100000001,arrayBuffer:async()=>{reads++;}});
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

test('immutable File ownership uses File APIs while binding source and output digests',async()=>{
  const source=new File([bytes],'source.pdf',{type:'application/pdf'});let inspections=0,compressions=0;
  const session=createCompressionSession({engine:{inspect:async()=>{throw Error('unexpected byte inspection');},compress:async()=>{throw Error('unexpected byte compression');},
    inspectFile:async f=>{assert.equal(f,source);inspections++;return inspector(new Uint8Array(await f.arrayBuffer()));},
    compressFile:async(f,{mode})=>{assert.equal(f,source);compressions++;return result(new Uint8Array(await f.arrayBuffer()),mode);}}});
  await session.select(source);assert.equal(session.snapshot().state,'ready');
  for(const mode of ['balanced','strong','lossless']){await session.compress(mode);assert.equal(session.snapshot().state,'completed');}
  assert.equal(inspections,1);assert.equal(compressions,3);session.dispose();
});
test('File transport is explicit and completion releases its worker',async()=>{
 let message,terminated=0,worker;const source=new File([bytes],'source.pdf');
 const legacy=createWorkerBridge({workerFactory:()=>{}});assert.equal(legacy.inspectFile,undefined);
 const bridge=createWorkerBridge({fileInput:true,workerFactory:()=>worker={postMessage:m=>{message=m;},terminate:()=>{terminated++;}}});
 const pending=bridge.inspectFile(source);assert.equal(message.file,source);assert.equal(message.bytes,undefined);
 worker.onmessage({data:{ok:true,report:{valid:true}}});await pending;assert.equal(terminated,1);
});

// A suspended tab can receive worker messages before its delayed timer callback.
test('expired worker messages and visibility restoration cannot release stale output',async()=>{
 for(const event of ['progress','result','visibility']){
  let clock=0,worker,terminated=0,progress=0;
  const visibilityTarget=new EventTarget();
  const bridge=createWorkerBridge({now:()=>clock,timeoutMs:1000,visibilityTarget,
   onProgress:()=>progress++,workerFactory:()=>worker={postMessage:()=>{},terminate:()=>terminated++}});
  const pending=bridge.compress(new Uint8Array(8));
  clock=1001;
  if(event==='visibility')visibilityTarget.dispatchEvent(new Event('visibilitychange'));
  else worker.onmessage({data:event==='progress'?{type:'progress',stage:'lossless-verification'}:{ok:true,result:{bytes:new Uint8Array(8)}}});
  await assert.rejects(pending,e=>e.code==='processing-timeout');
  assert.equal(terminated,1);assert.equal(progress,0);
  visibilityTarget.dispatchEvent(new Event('visibilitychange'));assert.equal(terminated,1);
 }
});

test('fast selection only checks boundaries; invalid, oversize and cancelled files fail before processing',async()=>{
 const {preflightPDFFile}=await import('../assets/js/pdf-compressor-v2/file-preflight.mjs');
 const limits={maxBytes:1000};const file=new File(['%PDF-1.7\nnot a parsed document\n%%EOF\n'],'preflight.pdf');
 assert.deepEqual(await preflightPDFFile(file,{limits}),{valid:true,sourceBytes:file.size,preflightOnly:true});
 await assert.rejects(preflightPDFFile(new File(['not PDF'.repeat(10)],'bad.pdf'),{limits}),e=>e.code==='unsupported-header');
 await assert.rejects(preflightPDFFile(new File(['%PDF-1.7\nincomplete file'],'bad.pdf'),{limits}),e=>e.code==='incomplete-pdf');
 await assert.rejects(preflightPDFFile({size:1001,slice:()=>{throw Error('must not read');}},{limits}),e=>e.code==='file-limit');
 const controller=new AbortController();controller.abort();await assert.rejects(preflightPDFFile(file,{limits,signal:controller.signal}));
});
