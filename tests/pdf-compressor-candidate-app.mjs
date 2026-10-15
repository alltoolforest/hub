import {preflightPDFFile} from '../assets/js/pdf-compressor-v2/file-preflight.mjs';
import {mountCompressor} from '../assets/js/pdf-compressor-v2/compressor-ui.mjs';
import {createWorkerBridge} from '../assets/js/pdf-compressor-v2/worker-bridge.mjs';
import {detectDeviceProfile} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
const profile=detectDeviceProfile();let workerURL=null;
const qaDiagnostics=document.createElement('pre');
qaDiagnostics.id='pdf-compressor-qa-error';
qaDiagnostics.setAttribute('role','status');
qaDiagnostics.setAttribute('aria-live','polite');
qaDiagnostics.hidden=true;
qaDiagnostics.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;background:#fff3ec;border:1px solid #a34c29;border-radius:8px;padding:12px;margin-top:12px';
document.getElementById('compressor').appendChild(qaDiagnostics);
const showQAError=(details={})=>{
 const capabilities={
  secureContext:isSecureContext,
  decompressionStream:typeof DecompressionStream==='function',
  offscreenCanvas:typeof OffscreenCanvas==='function',
  imageBitmap:typeof createImageBitmap==='function',
  wasm:typeof WebAssembly==='object',
  webCrypto:Boolean(globalThis.crypto?.subtle)
 };
 qaDiagnostics.textContent='Local diagnostic (no PDF data sent):\\n'+
  'Stage: '+String(details.stage??'unknown')+'\\n'+
  'Error: '+String(details.name??'WorkerError')+'\\n'+
  'Code: '+String(details.code??'processing-failed')+'\\n'+
  'Details: '+String(details.message??'No details available')+'\\n'+
  'Browser features: '+JSON.stringify(capabilities);
 qaDiagnostics.hidden=false;
};
globalThis.RC_RESOURCES={started:0,terminated:0};
const engine=createWorkerBridge({fileInput:true,profile:profile.id,onProgress:stage=>globalThis.RC_UI?.progress(stage),workerFactory:()=>{
 if(!workerURL){const raw=atob(globalThis.QA_WORKER_SOURCE),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);workerURL=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));}
 const worker=new Worker(workerURL),terminate=worker.terminate.bind(worker);RC_RESOURCES.started++;
 worker.addEventListener('message',event=>{
   if(event.data?.ok===false)
    showQAError({...event.data.diagnostic,code:event.data.code});
 });
 worker.addEventListener('error',()=>showQAError({stage:'worker-start-or-runtime',
   name:'WorkerError',code:'worker-failed',message:'Worker stopped unexpectedly'}));
 worker.terminate=()=>{terminate();RC_RESOURCES.terminated++;};return worker;
}});
// Avoid running the complete parser twice before the first result.
engine.inspectFile=(file,{signal}={})=>preflightPDFFile(file,{signal,limits:profile.limits});
globalThis.RC_UI=mountCompressor(document.getElementById('compressor'),{engine,limits:profile.limits});
document.querySelector('[data-run]')?.addEventListener('click',()=>{
 qaDiagnostics.hidden=true;qaDiagnostics.textContent='';
},{capture:true});

globalThis.addEventListener('pagehide',()=>{if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;});
