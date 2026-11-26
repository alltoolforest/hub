import {el,field,fileInput,notice,status,setupStatus,downloads,clearOutputs,output,copy,load,url,mobile,errorMessage,safeName} from './core.js';
import {boundedRanges,budgets,canvasDimensions,retryIndices,mergeRetry,pageProgress,appendRecord} from './scanned-pdf-ocr-performance.js';
import {createLifecycle,validateFile,stage} from './scanned-pdf-ocr-lifecycle.js';

import {nativeText,classifyPage,mergeMixed,chooseCandidate,summarize} from './scanned-pdf-ocr-quality.js';
import {recognitionEvidence,safeRenderPlan} from './scanned-pdf-ocr-layout.js';

const LANG='assets/vendor/scanned-pdf-ocr/';
const PDFJS=LANG+'pdfjs/';
const loadPdf=()=>import(url(PDFJS+'pdf.min.mjs'));
const STOP='Cancelled. Previous results have been kept.';
const LIMIT={read:30000,open:60000,init:120000,page:120000,cleanup:15000};
async function dispose(fn){
 let timer;
 try {await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Resource cleanup timed out. Reload before retrying.')),LIMIT.cleanup)})]);}
 finally {clearTimeout(timer);}
}
async function openDocument(file,job,resources){
 await stage(validateFile(file,budgets(mobile()).fileMB),job,LIMIT.read,'PDF validation');
 const limits=budgets(mobile());
 const tail=await stage(file.slice(-4096).text(),job,LIMIT.read,'PDF trailer validation');
 if(!/(?:^|[\r\n])%%EOF(?:[\r\n\t \0]|$)/.test(tail))throw Error('This PDF appears truncated because its end-of-file marker is missing.');
 const pdfjs=await stage(loadPdf(),job,LIMIT.open,'PDF engine loading');
 job.check();
 pdfjs.GlobalWorkerOptions.workerSrc=url(PDFJS+'pdf.worker.min.mjs');
 const transport=new class extends pdfjs.PDFDataRangeTransport{
  closed=false;
  requestDataRange(begin,end){
   if(this.closed||job.reason)return;
   file.slice(begin,end).arrayBuffer().then(buffer=>{
    if(this.closed||job.reason)return;
    if(buffer.byteLength!==end-begin)throw Error('The requested PDF bytes could not be read.');
    this.onDataRange(begin,new Uint8Array(buffer));
   }).catch(()=>{
    if(!this.closed)job.cancel(Error('Could not read the selected PDF. Reopen the file and try again.'));
   });
  }
  abort(){this.closed=true;}
 }(file.size,null,true);
 const task=pdfjs.getDocument({range:transport,rangeChunkSize:262144,disableStream:true,disableAutoFetch:true,
   isEvalSupported:false,stopAtErrors:true,maxImageSize:limits.sourceImagePixels,
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
 let file=null,locked=false,initializing=false,leaving=false,recovery=null,pageCount=0,resultFile=null;
 const input=fileInput(root,'.pdf',false,'Open a scanned PDF');
 const info=el('p',{class:'selected-files','aria-live':'polite',text:'No PDF selected.'});
 input.after(info);
 notice(root,'Printed English text only. Recognition depends on scan quality. Your PDF and extracted text are processed in this browser. Review the extracted text before use.');
 const rangeField=field('ranges','Pages to recognize','text','1',{hint:'For example 1-3,5. Up to 10 pages per run at narrow widths or 500 at desktop widths.'});
 const orientationField=field('ocr-orientation','Scan orientation','select','auto',{options:[['auto','Automatic'],['0','Original'],['90','90°'],['180','180°'],['270','270°']]});
 const selectionField=field('ocr-selection','Pages','select','all',{options:[['all','All pages'],['range','Selected pages']]});
 const selection=selectionField.querySelector('select');
 const advanced=el('details',{},[el('summary',{text:'Scan orientation options'}),orientationField]);
 root.append(selectionField,rangeField,advanced);
 rangeField.hidden=true;
 selection.onchange=()=>{rangeField.hidden=selection.value!=='range';};
 const preview=el('canvas',{'aria-label':'First page preview',role:'img',hidden:true});
 preview.style.maxWidth='100%';preview.style.height='auto';
 root.append(preview);
 const orientation=orientationField.querySelector('select');
 const range=rangeField.querySelector('input');const hint=rangeField.querySelector('small');if(hint){hint.id='ocr-range-hint';range.setAttribute('aria-describedby',hint.id);}
 const text=el('textarea',{id:'ocr-text',rows:15,'aria-label':'Editable recognized text'});
 const resultInfo=el('p',{'aria-live':'polite',text:'No recognition result yet.'});
 const progress=el('progress',{max:100,value:0,'aria-label':'Document recognition progress'});
 const progressInfo=el('p',{text:'No recognition job running.'});
 progress.style.width='100%';progressInfo.setAttribute('role','status');root.append(progress,progressInfo);
 const run=el('button',{type:'button',class:'primary',text:'Recognize text'});
 const cancel=el('button',{type:'button',text:'Cancel',disabled:true});
 const retry=el('button',{type:'button',text:'Retry failed pages',disabled:true});
 const copyBtn=el('button',{type:'button',text:'Copy text'});
 const save=el('button',{type:'button',text:'Download TXT'});
 root.append(el('div',{class:'actions'},[run,cancel,retry]),el('h2',{text:'Recognized text'}),resultInfo,text,el('div',{class:'actions'},[copyBtn,save]));
 setupStatus(root);downloads(root);
 const sync=()=>{const busy=!!lifecycle.active;input.disabled=busy||locked||initializing;range.disabled=busy||locked;selection.disabled=busy||locked;orientation.disabled=busy||locked;run.disabled=busy||locked||initializing||!file;cancel.disabled=!busy;retry.disabled=busy||locked||initializing||!recovery||!file||recovery.file!==file||!retryIndices(recovery.records).length;copyBtn.disabled=busy;save.disabled=busy;text.readOnly=busy;progressInfo.setAttribute('aria-busy',String(busy));};
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
  file=null;recovery=null;pageCount=0;preview.hidden=true;preview.width=0;preview.height=0;root.querySelector('#ocr-recovery')?.remove();root.querySelector('#ocr-page-warnings')?.remove();info.textContent='Checking selected PDF…';sync();
  const checked=await withJob(async(job,resources)=>{safeStatus('Validating PDF…');const doc=await openDocument(candidate,job,resources);const p=await stage(doc.getPage(1),job,LIMIT.page,'Preview page');resources.page=p;const base=p.getViewport({scale:1});const view=p.getViewport({scale:Math.min(1,360/Math.max(base.width,base.height))});preview.width=Math.max(1,Math.ceil(view.width));preview.height=Math.max(1,Math.ceil(view.height));resources.render=p.render({canvasContext:preview.getContext('2d'),viewport:view,background:'rgb(255,255,255)'});await stage(resources.render.promise,job,LIMIT.page,'Preview rendering');resources.render=null;return {file:candidate,count:doc.numPages};});
  if(checked&&!leaving){file=checked.value.file;pageCount=checked.value.count;selection.value='all';range.value='1';rangeField.hidden=true;preview.hidden=false;info.textContent='Selected: '+file.name+' · '+(file.size/1048576).toFixed(2)+' MB · '+pageCount+' pages';if(pageCount>budgets(mobile()).pages){selection.value='range';rangeField.hidden=false;range.value='1-'+budgets(mobile()).pages;safeStatus('File ready. Only the first '+budgets(mobile()).pages+' pages are selected; change the range to process other pages.');}else safeStatus('File ready. All pages selected.');}
  else {preview.hidden=true;preview.width=0;preview.height=0;info.textContent='No valid PDF selected. Previous results, if any, remain below.';}
  sync();
 });
 cancel.onclick=()=>{lifecycle.active?.cancel(Error(STOP));safeStatus('Cancelling…');};
 async function recognize(retrying=false){
  if(!file||lifecycle.active||locked||initializing)return;
  if(!retrying&&text.value.trim()&&!window.confirm('A successful recognition run will replace the current editable text. Continue?'))return;
  const selected=file,requested=selection.value==='all'?'1-'+pageCount:range.value.trim(),isMobile=mobile(),rotation=retrying?recovery.rotation:orientation.value,limits=budgets(isMobile);
  const previous=retrying?recovery.records:null;
  const remainingTextBudget=limits.textChars-(previous||[]).filter(r=>r.state==='completed').reduce((n,r)=>n+r.text.length,0);
  let current=[],indices=[],attempted=false,abortNote='Job interrupted';
  const start=performance.now();let workerStart=null,workerReady=null;
  progress.value=0;progressInfo.textContent='Preparing recognition…';
  const recognized=await withJob(async(job,resources)=>{
   safeStatus('Opening PDF…');
   const pdf=await openDocument(selected,job,resources);
   indices=retrying?retryIndices(previous):boundedRanges(requested,pdf.numPages,limits.pages);
   if(indices.length>limits.pages||indices.some(i=>i<0||i>=pdf.numPages))throw Error('Choose fewer valid pages for this device.');
   attempted=true;
   const getWorker=async()=>{
   if(resources.worker)return resources.worker;
   workerStart=performance.now();safeStatus('Checking local OCR model…');await ensureLocalModel(job);
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
   workerReady=performance.now();return resources.worker;
   };
   const pdfjs=await stage(loadPdf(),job,LIMIT.open,'PDF engine loading');
   const records=current;
   for(const index of indices){
    job.check();
    if(records.length&&records.length%16===0){
     await stage(pdf.cleanup(),job,LIMIT.cleanup,'PDF cache cleanup');
    }
    progressInfo.textContent='Page '+(records.length+1)+' of '+indices.length+' (PDF page '+(index+1)+')';safeStatus('Reading page '+(index+1)+'…');
    let p=null;
    try{
     p=await stage(pdf.getPage(index+1),job,LIMIT.page,'Page loading');resources.page=p;
     const content=await stage(p.getTextContent(),job,LIMIT.page,'Text inspection');
     const native=nativeText(content.items);
     const ops=await stage(p.getOperatorList(),job,LIMIT.page,'Page classification');
     const kind=classifyPage(native,ops.fnArray,pdfjs.OPS||{});
     // Strict PDF.js operator-list parsing rejects images over maxImageSize.
     const imagePresent=classifyPage('probe',ops.fnArray,pdfjs.OPS||{})==='mixed';
    
     if(kind==='digital'){appendRecord(records,{page:index+1,state:'completed',text:native},remainingTextBudget);continue;}
     const angle=rotation==='auto'?0:Number(rotation);
     const c=el('canvas');
     resources.canvas=c;
     async function renderAt(angle) {
      const rotation=(p.rotate+angle)%360;
      const base=p.getViewport({scale:1,rotation});
      const plan=safeRenderPlan(base.width,base.height,isMobile);
      const viewport=p.getViewport({scale:plan.scale,rotation});
      const {width,height}=canvasDimensions(viewport.width,viewport.height,limits);
      c.width=width;
      c.height=height;
      const context=c.getContext('2d',{willReadFrequently:true});
      if(!context)throw Error('Could not create a rendering canvas.');
      resources.render=p.render({canvasContext:context,viewport,background:'rgb(255,255,255)'});
      await stage(resources.render.promise,job,LIMIT.page,'Page rendering');
      resources.render=null;
      return context;
     }
     let context=await renderAt(angle);
     if(!imagePresent&&!native){
      const pixels=context.getImageData(0,0,c.width,c.height).data;
      const hasInk=pixels.some((value,index)=>index%4!==3&&value<245);
      if(!hasInk){records.push({page:index+1,state:'blank',text:'',note:'Uniform white rendered page'});continue;}
     }
     const worker=await getWorker();
     safeStatus('Recognizing page '+(index+1)+'…');
     const read=async label=>recognitionEvidence((await stage(
      worker.recognize(c,{rotateAuto:rotation==='auto',tessedit_pageseg_mode:'3'},{text:true,tsv:true}),
      job,LIMIT.page,label)).data);
     let best=await read('Page recognition'),bestAngle=angle,renderedAngle=angle;
     if(rotation==='auto'&&imagePresent&&(!best.text||(best.confidence??0)<65)){
      // Tesseract's rotateAuto corrects small skew but does not reliably correct
      // upside-down or sideways scans. Reuse a single bounded canvas for retries.
      for(const alternate of [180,90,270]){
       context=await renderAt(alternate);
       renderedAngle=alternate;
       const candidate=await read('Orientation retry');
       if(candidate.text&&(!best.text||(candidate.confidence??0)>=Math.max(75,(best.confidence??0)+15))){
        best=candidate;
        bestAngle=alternate;
       }
       if((best.confidence??0)>=85)break;
      }
     }
     if(!best.text||best.confidence===null||best.confidence<75||best.uncertain>0){
      if(bestAngle!==renderedAngle)context=await renderAt(bestAngle);
      const pixels=context.getImageData(0,0,c.width,c.height);
      const d=pixels.data;
      for(let i=0;i<d.length;i+=4){
       const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
       d[i]=d[i+1]=d[i+2]=Math.max(0,Math.min(255,(gray-128)*1.2+128));
      }
      // Clear only isolated, single-pixel dark specks surrounded by near-white.
      // The unfiltered OCR result remains available for candidate comparison.
      const stride=c.width*4;
      for(let y=1;y<c.height-1;y++){
       if(y%256===0){
        await new Promise(resolve=>setTimeout(resolve,0));
        job.check();
       }
       for(let x=1;x<c.width-1;x++){
        const i=y*stride+x*4;
        if(d[i]<120&&d[i-stride-4]>240&&d[i-stride]>240&&d[i-stride+4]>240&&
           d[i-4]>240&&d[i+4]>240&&d[i+stride-4]>240&&d[i+stride]>240&&d[i+stride+4]>240){
         d[i]=d[i+1]=d[i+2]=255;
        }
       }
      }
      context.putImageData(pixels,0,0);
      best=chooseCandidate(best,await read('Quality retry'));
     }
     if(!best.text&&!native){records.push({page:index+1,state:'failed',text:'',note:'Visible content but no text recognized; check scan or handwriting'});continue;}
     const merged=kind==='mixed'?mergeMixed(native,best.text):{text:best.text,review:false};
     appendRecord(records,{page:index+1,state:'completed',text:merged.text,uncertain:best.uncertain,note:!best.text?'No raster text recognized. Selectable text was preserved.':undefined,review:merged.review||best.confidence===null||best.confidence<75||best.uncertain>0||best.layoutFallback||!best.text},remainingTextBudget);
    }catch(e){
     abortNote=errorMessage(e);
     if(job.reason||locked||/safe output budget/.test(abortNote)){records.push({page:index+1,state:job.reason&&String(job.reason.message).startsWith('Cancelled.')?'cancelled':'failed',text:'',note:'Page interrupted; retry after resolving the reported error'});throw e;}
     // A failed page is recoverable only after all active page resources are released.
     records.push({page:index+1,state:'failed',text:'',note:abortNote});
    }finally{
     if(resources.render){try{resources.render.cancel();await dispose(async()=>{try{await resources.render.promise}catch{}});resources.render=null;}catch{locked=true;throw Error('Render cleanup failed; reload before retrying.');}}
     if(resources.canvas){resources.canvas.width=resources.canvas.height=0;resources.canvas=null;}
     if(p){p.cleanup();resources.page=null;}
     progress.value=pageProgress(records.length,indices.length);
    }
   }
   return records;

  });
  if(leaving)return;
  if(!attempted){progressInfo.textContent='Recognition not started.';return;}
  if(!recognized){const done=new Set(current.map(r=>r.page));for(const i of indices)if(!done.has(i+1))current.push({page:i+1,state:'skipped',text:'',note:'Job interrupted before page completed'});}
  const records=previous?mergeRetry(previous,current):current;
  const result=summarize(records),counts=result.counts;
  const issues=records.filter(record=>record.state!=='completed'||record.review);
  root.querySelector('#ocr-page-warnings')?.remove();
  if(issues.length){
   const details=el('details',{id:'ocr-page-warnings'},[el('summary',{text:'Page details ('+issues.length+')'})]);
   details.append(el('ul',{},issues.map(record=>el('li',{text:'Page '+record.page+': '+(record.note||'Review the recognized text against the original.')}))));
   resultInfo.after(details);
  }
  const uncertain=records.reduce((sum,r)=>sum+(r.uncertain||0),0);
  recovery={file:selected,rotation,records};
  progressInfo.textContent='Processed '+(counts.completed+counts.blank)+' of '+records.length+' selected pages. '+Math.round(performance.now()-start)+' ms total'+(workerReady!==null?' · OCR initialization '+Math.round(workerReady-workerStart)+' ms':'')+'.';
  // On retry, never overwrite manually edited output. Keep recovered text separately until explicit review.
  if(result.actual){
   if(retrying||!recognized){
    const block=el('textarea',{rows:8,readonly:true,'aria-label':'Recovered recognition output'});block.value=result.text;
    const replace=el('button',{type:'button',text:'Replace editable text with recovered result'});
    const panel=el('div',{class:'notice'},[el('p',{text:'Recovered result from '+selected.name+'. Existing editable text and downloads are unchanged.'}),block,replace]);
    root.querySelector('#ocr-recovery')?.remove();panel.id='ocr-recovery';root.append(panel);
    replace.onclick=()=>{if(lifecycle.active||recovery?.records!==records)return;if(text.value.trim()&&!window.confirm('Replace the current editable text, including any corrections?'))return;clearOutputs();text.value=result.text;resultFile=selected;resultInfo.textContent='Result from: '+selected.name+' · '+counts.completed+' completed, '+counts.failed+' failed, '+counts.cancelled+' cancelled, '+counts.skipped+' skipped.';panel.remove();};
   }else{clearOutputs();root.querySelector('#ocr-recovery')?.remove();text.value=result.text;resultFile=selected;resultInfo.textContent='Result from: '+selected.name+' · '+counts.completed+' completed, '+counts.blank+' blank, '+counts.failed+' unrecognized, '+counts.cancelled+' cancelled, '+counts.skipped+' skipped, '+counts.review+' need review · '+uncertain+' low-confidence OCR words (check against original).';}
  }
  if(recognized)safeStatus(!result.actual?'No text recognized. Previous results preserved.':counts.failed||counts.review?'Recognition finished with warnings. Review results before export.':'Recognition finished. Review results before export.',!result.actual||!!counts.failed);
  sync();
 }
 run.onclick=()=>recognize(false);
 retry.onclick=()=>{if(recovery&&recovery.file===file) return recognize(true);};
 text.addEventListener('input',clearOutputs);
 copyBtn.onclick=async()=>{if(lifecycle.active)return;try{await copy(text.value)}catch(e){safeStatus(errorMessage(e),true)}};
 save.onclick=()=>{if(lifecycle.active)return;try{if(!text.value.trim())throw Error('Recognize or enter text first.');clearOutputs();output(new Blob([text.value],{type:'text/plain;charset=utf-8'}),safeName(resultFile?.name||'recognized','-text','txt'));safeStatus('TXT ready.');}catch(e){safeStatus(errorMessage(e),true)}};
 window.addEventListener('pagehide',()=>{leaving=true;lifecycle.active?.cancel(Error(STOP));clearOutputs();});
 window.addEventListener('pageshow',event=>{if(event.persisted){leaving=false;sync();}});
 sync();
}
