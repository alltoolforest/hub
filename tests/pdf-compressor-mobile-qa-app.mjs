// Diagnostic harness for performance; not the Task 11 production interface.
import {createWorkerBridge} from '../assets/js/pdf-compressor-v2/worker-bridge.mjs';
import {createCompressionSession} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
import {detectDeviceProfile} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
const el=id=>document.getElementById(id),profile=detectDeviceProfile();
let workerURL=null,timer=null,started=0,last=0,ticks=0,maxGap=0,inspectionMs=0;
globalThis.QA_WORKERS=[];globalThis.QA_RESOURCE_COUNTS={workersStarted:0,workersTerminated:0};
const engine=createWorkerBridge({profile:profile.id,onProgress:stage=>{globalThis.QA_PHASE=stage;},workerFactory:()=>{
  if(!workerURL){
    const raw=atob(globalThis.QA_WORKER_SOURCE),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    workerURL=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
  }
  const worker=new Worker(workerURL);globalThis.QA_WORKERS.push(worker);globalThis.QA_RESOURCE_COUNTS.workersStarted++;
  const terminate=worker.terminate.bind(worker);
  worker.terminate=()=>{terminate();globalThis.QA_RESOURCE_COUNTS.workersTerminated++;
    globalThis.QA_WORKERS=globalThis.QA_WORKERS.filter(active=>active!==worker);};
  return worker;
}});
const session=createCompressionSession({engine,limits:profile.limits,onChange:s=>{
  const busy=['loading','processing'].includes(s.state);
  el('file').disabled=s.state==='processing';el('mode').disabled=busy;
  el('run').disabled=!s.canRetry;el('cancel').disabled=!busy;el('download').hidden=!s.canDownload;
  el('source').textContent=s.source?'Active PDF: '+s.source.name+' ('+s.source.size+' bytes)':'';
  if(s.state==='loading'||s.state==='processing'){
    started=last=performance.now();ticks=0;maxGap=0;globalThis.QA_PHASE='starting';
    el('status').textContent=s.state==='loading'?'Inspecting PDF':'Processing: starting';el('report').textContent='';
  }else if(s.state==='ready'){
    inspectionMs=Math.round(performance.now()-started);el('status').textContent='Ready: '+s.source.name;
  }else if(s.state==='failed')el('status').textContent='Test failed safely: '+s.error.code+'. '+s.error.message;
  else if(s.state==='cancelled')el('status').textContent='Cancelled. The original PDF is unchanged.';
  else if(s.state==='empty'){el('status').textContent='Select a PDF';el('report').textContent='';}
  else if(s.state==='completed'){
    const r=s.result;el('download').href=r.url;el('download').download=r.name;
    el('status').textContent='Completed: '+r.outputBytes+' bytes. Engine time: '+r.engineMs+' ms.';
    el('report').textContent=JSON.stringify({mode:r.mode,settings:r.settings,classification:r.classification,
      stages:r.stages,engineMs:r.engineMs,wallMs:Math.round(performance.now()-started),inspectionWallMs:inspectionMs,
      status:r.status,inputBytes:r.inputBytes,outputBytes:r.outputBytes,savedBytes:r.savedBytes,
      reductionPercent:r.reductionPercent,uiTicks:ticks,maxUiGapMs:Math.round(maxGap),
      independentTextVerified:r.integrity.independentTextVerified,deviceProfile:profile.id,
      resources:{...globalThis.QA_RESOURCE_COUNTS,activeWorkers:globalThis.QA_WORKERS.length},
      limits:profile.limits,deviceMemoryHintGB:navigator.deviceMemory??null,
      hardwareConcurrency:navigator.hardwareConcurrency??null,userAgent:navigator.userAgent,
      note:'Budgets are provisional. Device memory is a capability hint, not measured peak process RAM.'},null,2);
  }
  if(!s.canDownload)el('download').removeAttribute('href');
}});
globalThis.QA_SESSION=session;
el('limit').textContent='Maximum PDF size on this device: '+Math.round(profile.limits.maxBytes/1048576)+
  ' MiB ('+profile.limits.maxBytes+' bytes). Image and document complexity budgets also apply.';
el('file').onchange=async()=>{await session.select(el('file').files[0]);};
el('run').onclick=async()=>{if(session.snapshot().canRetry)await session.compress(el('mode').value);};
el('cancel').onclick=session.cancel;el('reset').onclick=()=>{session.reset();el('file').value='';};
const labels={'inspect':'checking PDF','embedded-images':'compressing images','lossless':'optimizing structure',
  'lossless-optimization':'optimizing structure','final-output':'verifying output'};
const startTimer=()=>{if(timer)clearInterval(timer);timer=setInterval(()=>{
  const state=session.snapshot().state;
  if(['loading','processing'].includes(state)){
    const now=performance.now();ticks++;maxGap=Math.max(maxGap,now-last);last=now;
    el('status').textContent=(state==='loading'?'Inspecting: ':'Processing ('+(labels[globalThis.QA_PHASE]??'starting')+'): ')+Math.round((now-started)/1000)+' seconds';
  }
},100);};
startTimer();
addEventListener('pagehide',()=>{
  session.dispose();el('file').value='';clearInterval(timer);timer=null;
  if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;globalThis.QA_WORKERS=[];
});
addEventListener('pageshow',startTimer);
