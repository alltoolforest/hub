// Task 8: one disposable worker per operation; termination cancels synchronous WASM.
export class WorkerOperationError extends Error {
  constructor(code){super(code);this.name='WorkerOperationError';this.code=code;}
}
export function createWorkerBridge({workerFactory,timeoutMs=120000,profile='standard',fileInput=false,onProgress=()=>{},now=()=>Date.now(),visibilityTarget=globalThis.document}={}){
  if(typeof workerFactory!=='function')throw new TypeError('Isolated worker factory required');
  const run=(op,bytes,{mode,targetBytes,signal}={})=>new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new WorkerOperationError('cancelled'));
    let worker,timer,settled=false;
    // Target-size jobs may run two fully verified profiles. Grant a
    // bounded second window only when the user explicitly requests a target.
    // Ordinary compression retains the original deadline unchanged.
    const effectiveTimeoutMs=targetBytes===undefined?timeoutMs:timeoutMs*2;
    const deadline=now()+effectiveTimeoutMs;
    const finish=(error,value)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      visibilityTarget?.removeEventListener('visibilitychange',checkDeadline);
      if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}
      error?reject(error):resolve(value);
    };
    const checkDeadline=()=>{
      if(now()<deadline)return false;
      finish(new WorkerOperationError('processing-timeout'));return true;
    };
    const abort=()=>finish(new WorkerOperationError('cancelled'));
    try{
      worker=workerFactory();
      worker.onmessage=event=>{
        if(settled||checkDeadline())return;
        if(event.data?.type==='progress'&&['inspect','target-attempt','embedded-images','lossless','lossless-inspection','lossless-optimization','lossless-verification','final-output'].includes(event.data.stage)){
          onProgress(event.data.stage);return;
        }
        if(typeof event.data?.ok!=='boolean')return; // Ignore parser handshake.
        if(event.data.ok)finish(null,event.data[op==='inspect'?'report':'result']);
        else finish(new WorkerOperationError(event.data.code??'processing-failed'));
      };
      worker.onerror=()=>finish(new WorkerOperationError('worker-failed'));
      worker.onmessageerror=()=>finish(new WorkerOperationError('worker-message-failed'));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      visibilityTarget?.addEventListener('visibilitychange',checkDeadline);
      timer=setTimeout(()=>finish(new WorkerOperationError('processing-timeout')),effectiveTimeoutMs);
      if(fileInput&&typeof Blob!=='undefined'&&bytes instanceof Blob)worker.postMessage({op,file:bytes,mode,targetBytes,profile});
      else {const copy=bytes.slice();worker.postMessage({op,bytes:copy,mode,targetBytes,profile},[copy.buffer]);}
    }catch(error){finish(error);}
  });
  const bridge={inspect:(bytes,options)=>run('inspect',bytes,options),compress:(bytes,options)=>run('compress',bytes,options)};
  if(fileInput){bridge.inspectFile=(file,options)=>run('inspect',file,options);bridge.compressFile=(file,options)=>run('compress',file,options);}
  return bridge;
}
