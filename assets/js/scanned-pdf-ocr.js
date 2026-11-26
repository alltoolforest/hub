import {el,field,fileInput,notice,status,setupStatus,downloads,clearOutputs,output,copy,load,url,mobile,errorMessage} from './core.js';
import {pageRanges} from './math.js';
import {createLifecycle,validateFile,stage} from './scanned-pdf-ocr-lifecycle.js';

import {nativeText,classifyPage,renderPlan,mergeMixed,candidate,chooseCandidate,summarize} from './scanned-pdf-ocr-quality.js';

const LANG='assets/vendor/scanned-pdf-ocr/';
const STOP='Cancelled. Previous results have been kept.';
const LIMIT={read:30000,open:60000,init:120000,page:120000,cleanup:15000};
async function dispose(fn){
 let timer;
 try {await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Resource cleanup timed out. Reload before retrying.')),LIMIT.cleanup)})]);}
 finally {clearTimeout(timer);}
}
async function openDocument(file,job,resources){
 await stage(validateFile(file,mobile()?15:40),job,LIMIT.read,'PDF validation');
 const bytes=await stage(file.arrayBuffer(),job,LIMIT.read,'PDF reading');
 const pdfjs=await stage(load('pdfjs'),job,LIMIT.open,'PDF engine loading');
 job.check();
 pdfjs.GlobalWorkerOptions.workerSrc=url('assets/vendor/pdf.worker.mjs');
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,stopAtErrors:true,
   cMapUrl:url('assets/vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:url('assets/vendor/standard_fonts/'),wasmUrl:url('assets/vendor/wasm/')});
 resources.pdfTask=task;
 task.onPassword=()=>job.cancel(Error('This PDF is password-protected. Unlock it in a trusted PDF application and retry.'));
 const pdf=await stage(task.promise,job,LIMIT.open,'PDF opening');
 if(!Number.isSafeInteger(pdf.numPages)||pdf.numPages<1)throw Error('This PDF contains no supported pages.');
 return pdf;
}
async function ensureLocalModel(job){
 const controller=new AbortController(),off=job.onCancel(()=>controller.abort());
 try{
  const response=await stage(fetch(url(LANG+'eng.traineddata.gz'),{method:'HEAD',redirect:'error',signal:controller.signal}),job,LIMIT.read,'Local OCR model check');
  if(!response.ok||/text\/html/i.test(response.headers.get('content-type')||''))throw Error('The local English OCR model is unavailable. No external OCR service was contacted.');
 }finally{off();controller.abort();}
}

export async function mount(root){
 const lifecycle=createLifecycle();
 let file=null,locked=false,initializing=false,leaving=false;
 const input=fileInput(root,'.pdf',false,'Open a scanned PDF');
 const info=el('p',{class:'selected-files','aria-live':'polite',text:'No PDF selected.'});
 input.after(info);
 notice(root,'Printed English text only. Recognition depends on scan quality. Your PDF and extracted text are processed in this browser. Review the extracted text before use.');
 const rangeField=field('ranges','Pages to recognize','text','1',{hint:'For example 1-3,5. Up to 10 pages per run on phones, 30 on desktop.'});
 const orientationField=field('ocr-orientation','Scan orientation','select','auto',{options:[['auto','Automatic'],['0','Original'],['90','90°'],['180','180°'],['270','270°']]});
 root.append(rangeField,orientationField);
 const orientation=orientationField.querySelector('select');
 const range=rangeField.querySelector('input');
 const text=el('textarea',{id:'ocr-text',rows:15,'aria-label':'Editable recognized text'});
 const resultInfo=el('p',{'aria-live':'polite',text:'No recognition result yet.'});
 root.append(resultInfo,text);
 const run=el('button',{type:'button',class:'primary',text:'Recognize text'});
 const cancel=el('button',{type:'button',text:'Cancel',disabled:true});
 const copyBtn=el('button',{type:'button',text:'Copy text'});
 const save=el('button',{type:'button',text:'Download TXT'});
 root.append(el('div',{class:'actions'},[run,cancel,copyBtn,save]));
 setupStatus(root);downloads(root);
 const sync=()=>{const busy=!!lifecycle.active;input.disabled=busy||locked||initializing;range.disabled=busy||locked;orientation.disabled=busy||locked;run.disabled=busy||locked||initializing||!file;cancel.disabled=!busy;copyBtn.disabled=busy;save.disabled=busy;text.readOnly=busy;root.setAttribute('aria-busy',String(busy));};
 const safeStatus=(message,error=false)=>{if(!leaving)status(message,error);};
 async function cleanup(resources){
  let failed=false;
  const attempt=async fn=>{try{await dispose(fn)}catch{failed=true}};
  if(resources.render)await attempt(async()=>{resources.render.cancel();try{await resources.render.promise}catch{}});
  if(resources.worker)await attempt(()=>resources.worker.terminate());
  if(resources.page)await attempt(()=>resources.page.cleanup());
  if(resources.canvas){resources.canvas.width=0;resources.canvas.height=0;}
  if(resources.pdfTask)await attempt(()=>resources.pdfTask.destroy());
  if(failed){locked=true;throw Error('Resource cleanup failed. Reload the page before processing another PDF.');}
 }
 async function withJob(work){
  if(locked||initializing||lifecycle.active||leaving)return;
  const job=lifecycle.start(),resources={};sync();
  let result,error;
  try{result=await work(job,resources);job.check();}
  catch(e){error=e;}
  finally{
   try{await cleanup(resources)}catch(e){error=e;}
   if(!error&&job.reason)error=job.reason;
   job.finish();sync();
  }
  if(error){safeStatus(errorMessage(error),true);return;}
  return {value:result};
 }
 input.addEventListener('change',async()=>{
  if(lifecycle.active||locked||initializing)return;
  const candidate=input.files?.[0];input.value='';
  if(!candidate)return;
  file=null;info.textContent='Checking selected PDF…';sync();
  const checked=await withJob(async(job,resources)=>{safeStatus('Validating PDF…');await openDocument(candidate,job,resources);return candidate;});
  if(checked&&!leaving){file=checked.value;info.textContent='Selected: '+file.name;safeStatus('File ready.');}
  else info.textContent='No valid PDF selected. Previous results, if any, remain below.';
  sync();
 });
 cancel.onclick=()=>{lifecycle.active?.cancel(Error(STOP));safeStatus('Cancelling…');};
 run.onclick=async()=>{
  if(!file||lifecycle.active||locked||initializing)return;
  const selected=file,requested=range.value.trim(),isMobile=mobile(),rotation=orientation.value;
  const recognized=await withJob(async(job,resources)=>{
   safeStatus('Opening PDF…');
   const pdf=await openDocument(selected,job,resources);
   const indices=pageRanges(requested,pdf.numPages);
   if(indices.length>(isMobile?10:30))throw Error('Choose fewer pages for this device.');
   const getWorker=async()=>{
   if(resources.worker)return resources.worker;
   safeStatus('Checking local OCR model…');await ensureLocalModel(job);
   safeStatus('Loading OCR engine…');const T=await stage(load('ocr'),job,LIMIT.init,'OCR engine loading');
   job.check();
   initializing=true;
   let pending;
   try{
    pending=Promise.resolve(T.createWorker('eng',1,{workerPath:url('assets/vendor/tesseract-worker.js'),
     corePath:url('assets/vendor/tesseract-core/'),langPath:url(LANG),workerBlobURL:false,cacheMethod:'none',
     logger:m=>{if(lifecycle.active===job&&!job.reason)safeStatus(m.status+(m.progress!=null?' · '+Math.round(m.progress*100)+'%':''));},
     errorHandler:()=>job.cancel(Error('OCR worker failed. Retry or reload the page.'))}));
   }catch(e){initializing=false;throw e;}
   // If initialization cannot be interrupted, do not permit another worker until it settles.
   pending.then(()=>{initializing=false;sync();},()=>{initializing=false;sync();});
   try{
    resources.worker=await stage(pending,job,LIMIT.init,'OCR worker initialization',async worker=>{
     try{await dispose(()=>worker.terminate());}catch{locked=true;}finally{sync();}
    });
   }catch(e){
    // The library does not expose its worker handle until initialization resolves.
    // Fail closed after an interrupted initialization rather than risk overlap.
    locked=true;throw Error((e?.message||'OCR initialization failed.')+' Reload the page before retrying.');
   }
   return resources.worker;
   };
   const pdfjs=await stage(load('pdfjs'),job,LIMIT.open,'PDF engine loading');
   const records=[];
   for(const index of indices){
    job.check();safeStatus('Reading page '+(index+1)+'…');
    const p=await stage(pdf.getPage(index+1),job,LIMIT.page,'Page loading');resources.page=p;
    try{
     const content=await stage(p.getTextContent(),job,LIMIT.page,'Text inspection');
     const native=nativeText(content.items);
     const ops=await stage(p.getOperatorList(),job,LIMIT.page,'Page classification');
     const kind=classifyPage(native,ops.fnArray,pdfjs.OPS||{});
     if(kind==='digital'){records.push({page:index+1,state:'completed',text:native});continue;}
     const angle=rotation==='auto'?0:Number(rotation);
     const base=p.getViewport({scale:1,rotation:(p.rotate+angle)%360});
     const view=p.getViewport({scale:renderPlan(base.width,base.height,isMobile),rotation:(p.rotate+angle)%360});
     const c=el('canvas',{width:Math.max(1,Math.floor(view.width)),height:Math.max(1,Math.floor(view.height))});resources.canvas=c;
     const context=c.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Could not create a rendering canvas.');
     resources.render=p.render({canvasContext:context,viewport:view,background:'rgb(255,255,255)'});
     await stage(resources.render.promise,job,LIMIT.page,'Page rendering');resources.render=null;
     const pixels=context.getImageData(0,0,c.width,c.height);
     let ink=0;
     for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i]<245||pixels.data[i+1]<245||pixels.data[i+2]<245)ink++;}
     if(!ink&&!native){records.push({page:index+1,state:'blank',text:'',note:'Uniform white rendered page'});continue;}
     const worker=await getWorker();
     safeStatus('Recognizing page '+(index+1)+'…');
     const options={rotateAuto:rotation==='auto'};
     let best=candidate((await stage(worker.recognize(c,options),job,LIMIT.page,'Page recognition')).data);
     if(!best.text||best.confidence===null||best.confidence<75){
      // A single conservative contrast retry, without changing original PDF or dimensions.
      const d=pixels.data;
      for(let i=0;i<d.length;i+=4){const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];const v=Math.max(0,Math.min(255,(gray-128)*1.2+128));d[i]=d[i+1]=d[i+2]=v;}
      context.putImageData(pixels,0,0);
      const second=candidate((await stage(worker.recognize(c,options),job,LIMIT.page,'Quality retry')).data);
      best=chooseCandidate(best,second);
     }
     if(!best.text&&!native){records.push({page:index+1,state:'failed',text:'',note:'Visible content but no text recognized; check scan or handwriting'});continue;}
     const merged=kind==='mixed'?mergeMixed(native,best.text):{text:best.text,review:false};
     records.push({page:index+1,state:'completed',text:merged.text,review:merged.review||best.confidence===null||best.confidence<75||!best.text});
    }finally{
     if(!resources.render){if(resources.canvas){resources.canvas.width=resources.canvas.height=0;resources.canvas=null;}p.cleanup();resources.page=null;}
    }
   }
   return summarize(records);

  });
  if(recognized&&!leaving){
   const result=recognized.value,counts=result.counts;
   if(!result.actual){safeStatus('No text recognized. '+counts.blank+' blank, '+counts.failed+' unrecognized pages. Previous results preserved.',true);return;}
   clearOutputs();text.value=result.text;resultInfo.textContent='Result from: '+selected.name+' · '+counts.completed+' completed, '+counts.blank+' blank, '+counts.failed+' unrecognized, '+counts.review+' need review.';
   safeStatus(counts.failed||counts.review?'Recognition finished with warnings. Review page results and names or numbers before export.':'Text recognized. Review and correct it before export.',!!counts.failed);
  }
 };
 copyBtn.onclick=async()=>{if(lifecycle.active)return;try{await copy(text.value)}catch(e){safeStatus(errorMessage(e),true)}};
 save.onclick=()=>{if(lifecycle.active)return;try{if(!text.value.trim())throw Error('Recognize or enter text first.');clearOutputs();output(new Blob([text.value],{type:'text/plain'}),'recognized-text.txt');safeStatus('TXT ready.');}catch(e){safeStatus(errorMessage(e),true)}};
 window.addEventListener('pagehide',()=>{leaving=true;lifecycle.active?.cancel(Error(STOP));clearOutputs();},{once:true});
 sync();
}
