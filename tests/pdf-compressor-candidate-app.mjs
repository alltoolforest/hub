import {mountCompressor} from '../assets/js/pdf-compressor-v2/compressor-ui.mjs';
import {createWorkerBridge} from '../assets/js/pdf-compressor-v2/worker-bridge.mjs';
import {detectDeviceProfile} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
const profile=detectDeviceProfile();let workerURL=null;
globalThis.RC_RESOURCES={started:0,terminated:0};
const engine=createWorkerBridge({fileInput:true,profile:profile.id,onProgress:stage=>globalThis.RC_UI?.progress(stage),workerFactory:()=>{
 if(!workerURL){const raw=atob(globalThis.QA_WORKER_SOURCE),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);workerURL=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));}
 const worker=new Worker(workerURL),terminate=worker.terminate.bind(worker);RC_RESOURCES.started++;
 worker.terminate=()=>{terminate();RC_RESOURCES.terminated++;};return worker;
}});
globalThis.RC_UI=mountCompressor(document.getElementById('compressor'),{engine,limits:profile.limits});
globalThis.addEventListener('pagehide',()=>{if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;});
