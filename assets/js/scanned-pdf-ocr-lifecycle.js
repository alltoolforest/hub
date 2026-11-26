export function createLifecycle(){
 let active=null;
 return {start(){if(active)throw Error("A document job is already running.");let reason=null;const listeners=new Set();const job={get reason(){return reason;},cancel(error=Error("Cancelled.")){if(reason)return;reason=error;for(const fn of [...listeners])fn(reason);listeners.clear();},onCancel(fn){if(reason){fn(reason);return ()=>{};}listeners.add(fn);return ()=>listeners.delete(fn);},check(){if(reason)throw reason;},finish(){listeners.clear();if(active===job)active=null;}};active=job;return job;},get active(){return active;}};
}

export async function validateFile(file,maxMB){
 if(!file||!file.size)throw Error("Choose a non-empty PDF.");
 if(!/\.pdf$/i.test(file.name))throw Error("Choose a PDF file.");
 if(file.size>maxMB*1024*1024)throw Error(`Choose a PDF no larger than ${maxMB} MB.`);
 const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")throw Error("Invalid PDF header.");
 if(!/^[0-9]\.[0-9]$/.test(String.fromCharCode(...bytes.slice(5,8))))throw Error("Invalid PDF version header.");
}

export function stage(promise,job,ms,label,lateDispose){
 return new Promise((resolve,reject)=>{
  let settled=false,timer,unsubscribe=()=>{};
  const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);unsubscribe();ok?resolve(value):reject(value);};
  timer=setTimeout(()=>job.cancel(Error(label+" timed out. Retry or reload the page.")),ms);
  unsubscribe=job.onCancel(error=>finish(false,error));
  Promise.resolve(promise).then(value=>{if(settled){if(lateDispose)Promise.resolve().then(()=>lateDispose(value)).catch(()=>{});return;}finish(true,value);},err=>finish(false,err));
 });
}
