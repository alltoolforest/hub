// Task 8: one disposable worker per operation; termination cancels synchronous WASM.
export class WorkerOperationError extends Error {
  constructor(code){super(code);this.name='WorkerOperationError';this.code=code;}
}
export function createWorkerBridge({workerFactory,timeoutMs=120000}={}){
  if(typeof workerFactory!=='function')throw new TypeError('Isolated worker factory required');
  const run=(op,bytes,{mode,signal}={})=>new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new WorkerOperationError('cancelled'));
    let worker,timer,settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;
      clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();}
      error?reject(error):resolve(value);
    };
    const abort=()=>finish(new WorkerOperationError('cancelled'));
    try{
      worker=workerFactory();
      worker.onmessage=event=>{
        if(typeof event.data?.ok!=='boolean')return; // Ignore parser handshake.
        if(event.data.ok)finish(null,event.data[op==='inspect'?'report':'result']);
        else finish(new WorkerOperationError(event.data.code??'processing-failed'));
      };
      worker.onerror=()=>finish(new WorkerOperationError('worker-failed'));
      worker.onmessageerror=()=>finish(new WorkerOperationError('worker-message-failed'));
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      timer=setTimeout(()=>finish(new WorkerOperationError('processing-timeout')),timeoutMs);
      const copy=bytes.slice();worker.postMessage({op,bytes:copy,mode},[copy.buffer]);
    }catch(error){finish(error);}
  });
  return {inspect:(bytes,options)=>run('inspect',bytes,options),
    compress:(bytes,options)=>run('compress',bytes,options)};
}
