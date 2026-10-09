// PDF Merger Task 1: isolated source validation. The merge engine remains unchanged.
import {el,format,action,notice,setupStatus,status,fileInput,bindFile,pdfLib,output,downloads,clearOutputs,mobile} from './core.js';
import {preparePdfBatch,limitsFor} from './pdf-merger-input.js';
import {verifiedMerge} from './pdf-merger-verify.js';
import {renderPdfMergerThumbnail,previewEligibility} from './pdf-merger-preview.js';

export async function mount(root){
 let files=[],busy=false,uploading=false,revision=0,outputRevision=-1,controller=null;
 const previewCache=new Map(),previewQueue=[];
 let previewRunning=false;
 const isMobile=mobile();
 const limits=limitsFor(isMobile);
 const input=fileInput(root,'.pdf',true,'Select PDFs');
 const list=el('ul',{class:'file-list pdf-merger-list','aria-label':'PDF documents in selected merge order'});
 const queueHint=el('p',{class:'pdf-merger-queue-hint',id:'pdf-merger-queue-hint',
  text:'Review each first page, then use Move up, Move down or Remove to arrange complete PDFs. The numbered order is the merge order.'});
 list.setAttribute('aria-describedby','pdf-merger-queue-hint');
 const queueLive=el('p',{class:'pdf-merger-queue-live',role:'status','aria-live':'polite','aria-atomic':'true'});
 const summary=el('p',{class:'pdf-merger-admission',role:'status','aria-live':'polite',
  text:'No PDFs selected. Up to '+limits.maxFiles+' files, '+limits.maxPages+' pages and '+
   Math.round(limits.maxTotalBytes/(1024*1024))+' MB total on this device.'});
 root.append(queueHint,list,queueLive,summary);
 function markOldResult(){
  if(outputRevision===revision)return;
  for(const row of root.querySelectorAll('#downloads .download-row')){
   if(!row.querySelector('.pdf-merger-old-order')){
    row.prepend(el('span',{class:'pdf-merger-old-order',role:'note',
     text:'Previous file arrangement — this download does not reflect the currently selected order. '}));
   }
  }
 }
 function changed(){
  revision++;
  markOldResult();
 }

 const previewObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const event of entries){
   if(!event.isIntersecting)continue;
   previewObserver.unobserve(event.target);
   const holder=[...previewCache.entries()].find(([,view])=>view.canvas===event.target);
   if(holder)enqueuePreview(holder[0]);
  }
 },{rootMargin:'120px'}):null;
 function releasePreview(entry){
  const view=previewCache.get(entry);
  if(!view)return;
  previewObserver?.unobserve(view.canvas);
  view.controller.abort();
  view.canvas.width=0;view.canvas.height=0;
  previewCache.delete(entry);
 }
 function enqueuePreview(entry){
  const view=previewCache.get(entry);
  if(!view||view.started||view.done||previewQueue.includes(entry))return;
  previewQueue.push(entry);
  void drainPreviews();
 }
 async function drainPreviews(){
  if(previewRunning||busy||uploading)return;
  previewRunning=true;
  try{
   while(previewQueue.length&&!busy&&!uploading){
    const entry=previewQueue.shift(),view=previewCache.get(entry);
    if(!view||view.started||view.done)continue;
    view.started=true;
    const eligibility=previewEligibility(entry.file,isMobile);
    if(!eligibility.allowed){
     view.label.textContent=eligibility.reason;view.canvas.hidden=true;view.done=true;continue;
    }
    try{
     view.label.textContent='Rendering first-page preview…';
     await renderPdfMergerThumbnail(entry.file,view.canvas,{isMobile,signal:view.controller.signal});
     if(previewCache.get(entry)===view&&!view.controller.signal.aborted){
      view.canvas.hidden=false;
      view.label.textContent='First-page preview';
      view.done=true;
     }
    }catch(error){
     if(previewCache.get(entry)===view){
      view.canvas.hidden=true;
      view.label.textContent=view.controller.signal.aborted?'Preview paused.':
       'Preview unavailable; this validated PDF can still be merged.';
      view.done=!view.controller.signal.aborted;
     }
    }finally{
     view.started=false;
    }
   }
  }finally{previewRunning=false;}
 }
 function previewFor(entry){
  let view=previewCache.get(entry);
  if(!view){
   const canvas=el('canvas',{class:'pdf-merger-thumbnail',role:'img',
    'aria-label':'First page of '+entry.file.name,hidden:true});
   const label=el('span',{class:'pdf-merger-preview-status',text:'Preview pending…'});
   view={canvas,label,controller:new AbortController(),started:false,done:false};
   previewCache.set(entry,view);
  }
  return view;
 }
 function announce(message){queueLive.textContent=message;}
 function drawFiles(focusEntry=null,focusAction=null){
  list.replaceChildren();
  for(const [i,entry] of files.entries()){
   const row=el('li',{class:'pdf-merger-item'});
   const view=previewFor(entry);
   const frame=el('div',{class:'pdf-merger-preview-frame'});
   frame.append(view.canvas,view.label);
   const info=el('div',{class:'pdf-merger-item-info'});
   info.append(
    el('span',{class:'pdf-merger-file-title',text:(i+1)+'. '+entry.file.name+' · '+format(entry.file.size/1024)+' KB · '+entry.pageCount+' page'+(entry.pageCount===1?'':'s')}),
    el('small',{text:'PDF '+(i+1)+' of '+files.length})
   );
   const controls=el('div',{class:'pdf-merger-file-controls','aria-label':'Actions for '+entry.file.name});
   const addButton=(text,key,label,handler,disabled=false)=>{
    const button=el('button',{type:'button',text,
     'aria-label':label+' '+entry.file.name,disabled:busy||uploading||disabled});
    button.dataset.action=key;
    button.addEventListener('click',()=>{
     if(busy||uploading)return;
     handler();
    });
    controls.append(button);
    return button;
   };
   addButton('↑','up','Move up',()=>{
    if(i<=0)return;
    [files[i-1],files[i]]=[files[i],files[i-1]];
    changed();drawFiles(entry,i===1?'down':'up');
    announce('Moved '+entry.file.name+' to position '+i+' of '+files.length+'.');
   },i===0);
   addButton('↓','down','Move down',()=>{
    if(i>=files.length-1)return;
    [files[i+1],files[i]]=[files[i],files[i+1]];
    changed();drawFiles(entry,i===files.length-2?'up':'down');
    announce('Moved '+entry.file.name+' to position '+(i+2)+' of '+files.length+'.');
   },i===files.length-1);
   addButton('Remove','remove','Remove',()=>{
    files.splice(i,1);releasePreview(entry);changed();
    const next=files[Math.min(i,files.length-1)]||null;
    drawFiles(next,next?'remove':null);
    announce('Removed '+entry.file.name+'. '+files.length+' PDFs remain.');
   });
   row.append(frame,info,controls);list.append(row);
   if(!view.done&&!view.started){
    if(previewObserver)previewObserver.observe(view.canvas);
    else enqueuePreview(entry);
   }
  }
  const pages=files.reduce((total,entry)=>total+entry.pageCount,0);
  summary.textContent=files.length+' PDF(s) · '+pages+' page(s) selected. Limits: '+limits.maxFiles+
   ' files, '+limits.maxPages+' pages, '+Math.round(limits.maxTotalBytes/(1024*1024))+' MB total.';
  if(focusEntry){
   const index=files.indexOf(focusEntry);
   if(index>=0){
    const controls=list.children[index].querySelectorAll('button');
    const target=[...controls].find(button=>button.dataset.action===focusAction&&!button.disabled)||
     [...controls].find(button=>!button.disabled);
    target?.focus();
   }else input.focus();
  }
 }
 bindFile(input,async selected=>{
  if(busy)throw Error('Wait for the current merge to finish or cancel it before adding documents.');
  if(uploading)throw Error('Wait for the current document upload to finish.');
  uploading=true;
  // Neither the queue nor the displayed order changes until every new PDF is verified.
  try{
   const engine=await pdfLib();
   const result=await preparePdfBatch(files,selected,{
    isMobile,
    loadPdf:bytes=>engine.PDFDocument.load(bytes,{updateMetadata:false})
   });
   if(result.entries.length){files=[...files,...result.entries];changed();}
   uploading=false;
   drawFiles();
   announce(result.entries.length+' new PDF files added. '+files.length+' PDFs are in the selected merge order.');
   const added=result.entries.length,skipped=result.skipped.length;
   const message=added+' PDF(s) added'+(skipped?' · '+skipped+' exact duplicate(s) skipped: '+result.skipped.join(', '):'')+
    '. The existing file order is preserved.';
   summary.textContent+=' '+message;
  }catch(error){
   // Existing entries and their order remain unchanged; bindFile presents error status.
   summary.textContent='Upload rejected. Previously selected '+files.length+
    ' PDF(s) retained in the same order. '+String(error?.message||error);
   throw error;
  }finally{
   uploading=false;
   void drainPreviews();
  }
 });
 notice(root,'Add files in batches, then use the arrows to set their order. Exact duplicate selections are skipped. Invalid or oversized batches do not replace previously selected PDFs. Browser-based page copying may not preserve bookmarks, form fields, signatures, attachments or document-level actions; affected documents are rejected rather than silently losing those features.');
 const mergeControls=el('div',{class:'actions'});
 const mergeButton=el('button',{type:'button',class:'primary',text:'Create PDF'});
 const cancelButton=el('button',{type:'button',text:'Cancel merge',disabled:true});
 const progress=el('progress',{max:1,value:0,hidden:true,'aria-label':'PDF merge progress'});
 const verified=el('p',{class:'pdf-merger-result',role:'status','aria-live':'polite'});
 mergeControls.append(mergeButton,cancelButton,progress);
 root.append(mergeControls,verified);
 cancelButton.addEventListener('click',()=>{
  if(busy&&controller&&!controller.signal.aborted){
   controller.abort();
   cancelButton.disabled=true;
   status('Cancelling merge after the current operation…');
  }
 });
 // The shared generic action helper re-enables every workspace control when any
 // action finishes. Keep merge state owned locally to prevent mid-merge queue edits.
 mergeButton.addEventListener('click',async()=>{
  if(busy)return;
  if(files.length<2){status('Choose at least two PDFs.',true);return;}
  const snapshot=[...files],startRevision=revision;
  const abortController=new AbortController();
  controller=abortController;busy=true;
  // Do not compete for decoded PDF memory while merging.
  for(const view of previewCache.values())if(view.started&&!view.done)view.controller.abort();
  const disabled=new Map();
  for(const control of root.querySelectorAll('input,select,button')){
   if(control===cancelButton)continue;
   disabled.set(control,control.disabled);control.disabled=true;
  }
  cancelButton.disabled=false;
  progress.hidden=false;progress.max=snapshot.length;progress.value=0;
  try{
   const engine=await pdfLib();
   if(abortController.signal.aborted)throw Error('Merge cancelled. Your previous download remains available.');
   const result=await verifiedMerge(snapshot,engine,{
    signal:abortController.signal,isMobile,
    onProgress:p=>{
     if(p.phase==='copying'){
      progress.value=p.index-1;
      status('Merging '+p.index+' of '+p.total+' PDFs…');
     }else if(p.phase==='saving'){
      progress.value=p.total;status('Saving merged PDF…');
     }else if(p.phase==='verifying')status('Verifying merged PDF pages and order…');
    }
   });
   if(abortController.signal.aborted||revision!==startRevision)
    throw Error('The merge was cancelled or its file order changed. Previous downloads were preserved.');
   // Publish a fully verified output first. Previous download links remain untouched
   // throughout parsing/saving/verification and every failure path.
   const oldRows=[...root.querySelectorAll('#downloads .download-row')];
   output(result.blob,'merged.pdf');
   // Once a valid new download exists, release old object URLs and their blobs.
   for(const old of oldRows){
    for(const link of old.querySelectorAll('a[href^="blob:"]'))
     URL.revokeObjectURL(link.href);
    old.remove();
   }
   outputRevision=revision;
   verified.textContent='Verified output: '+result.pageCount+' pages · '+
    format(result.byteLength/1024)+' KB. Merge follows the selected document order.';
   status('Merged PDF verified and ready to download.');
  }catch(error){
   status(error?.name==='AbortError'?
    'Merge cancelled. Your previous successful download was preserved.':
    String(error?.message||error),true);
  }finally{
   busy=false;controller=null;cancelButton.disabled=true;
   progress.hidden=true;progress.value=0;
   for(const [control,wasDisabled] of disabled)if(control.isConnected)control.disabled=wasDisabled;
   for(const [entry,view] of previewCache){
    if(view.controller.signal.aborted&&!view.done){
     view.controller=new AbortController();
     view.started=false;
     enqueuePreview(entry);
    }
   }
   void drainPreviews();
  }
 });
 const resetButton=el('button',{type:'button',text:'Reset'});
 mergeControls.append(resetButton);
 resetButton.addEventListener('click',()=>{
  if(busy){status('Cancel the merge before resetting.',true);return;}
  for(const entry of files)releasePreview(entry);
  previewQueue.length=0;
  files=[];revision++;outputRevision=-1;
  list.replaceChildren();clearOutputs();verified.textContent='';drawFiles();
  announce('All PDFs removed from the merge queue.');
 });
 setupStatus(root);downloads(root);
 window.addEventListener('pagehide',()=>{
  for(const entry of files)releasePreview(entry);
  previewQueue.length=0;
  previewObserver?.disconnect();
 },{once:true});
}
