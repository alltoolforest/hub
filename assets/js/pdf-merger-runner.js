// PDF Merger large-job dispatch. Shared PDF tools and existing short-job flow untouched.
const workerScript=new URL('./pdf-merger-worker.js',import.meta.url).href;
import {verifiedMerge,cancellationError} from './pdf-merger-verify.js';

export function shouldUsePdfMergeWorker(entries){
 const count=entries.length;
 const bytes=entries.reduce((sum,e)=>sum+(e?.file?.size||0),0);
 const pages=entries.reduce((sum,e)=>sum+(e?.pageCount||0),0);
 return count>=13||bytes>=48*1024*1024||pages>=300;
}
export async function mergePdfBatch(entries,{isMobile=false,signal=null,onProgress=()=>{},loadEngine}={}){
 if(signal?.aborted)throw cancellationError();
 if(typeof loadEngine!=='function')throw Error('PDF merge engine loader is unavailable.');
 if(!shouldUsePdfMergeWorker(entries)||typeof Worker!=='function'){
  const lib=await loadEngine();
  if(signal?.aborted)throw cancellationError();
  return verifiedMerge(entries,lib,{isMobile,signal,onProgress});
 }
 return new Promise((resolve,reject)=>{
  let worker=null,settled=false;
  const cleanup=()=>{
   signal?.removeEventListener('abort',onAbort);
   if(worker){
    worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
    worker.terminate();
   }
   worker=null;
  };
  const finish=(error,result)=>{
   if(settled)return;
   settled=true;cleanup();
   if(error)reject(error);else resolve(result);
  };
  const onAbort=()=>finish(cancellationError());
  try{
   worker=new Worker(workerScript);
   signal?.addEventListener('abort',onAbort,{once:true});
   worker.onmessage=event=>{
    if(settled)return;
    const message=event.data||{};
    if(message.type==='progress'){
     try{onProgress(message.info);}catch{}
    }else if(message.type==='error'){
     finish(Error(message.message||'The background merge failed. Try fewer PDFs.'));
    }else if(message.type==='result'){
     const expected=entries.reduce((sum,e)=>sum+e.pageCount,0);
     if(!(message.blob instanceof Blob)||message.pageCount!==expected||message.blob.size!==message.byteLength)
      finish(Error('Background merge output could not be verified. Your previous download is preserved.'));
     else finish(null,{blob:message.blob,pageCount:message.pageCount,byteLength:message.byteLength});
    }
   };
   worker.onerror=()=>finish(Error('The background PDF engine stopped unexpectedly. Your previous download is preserved.'));
   worker.onmessageerror=()=>finish(Error('The PDF result could not be transferred safely. Your previous download is preserved.'));
   if(signal?.aborted){onAbort();return;}
   worker.postMessage({
    type:'merge',
    entries:entries.map(entry=>({file:entry.file,pageCount:entry.pageCount})),
    isMobile
   });
  }catch(error){
   finish(Error('The background PDF engine could not start on this browser. Try updating the browser or a smaller batch.'));
  }
 });
}
