// PDF Merger Task 1: isolated source validation. The merge engine remains unchanged.
import {el,format,notice,setupStatus,status,errorMessage,fileInput,pdfLib,output,downloads,clearOutputs,mobile} from './core.js';
import {preparePdfBatch,limitsFor} from './pdf-merger-input.js';
import {mergePdfBatch} from './pdf-merger-runner.js';
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
 const mergeJump=el('a',{class:'button pdf-merger-jump',href:'#pdf-merger-actions',
  text:'Jump to Create PDF',hidden:true});
 root.append(queueHint,list,queueLive,summary,mergeJump);
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
  // Consent applies to the exact selected queue. A changed queue needs a fresh choice.
  bookmarkConsent.checked=false;
  markOldResult();
  if(outputRevision>=0&&outputRevision!==revision)
   verified.textContent='Previous verified PDF: this download uses the earlier file arrangement. Create a new PDF for the current order.';
 }

 const previewObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const event of entries){
   if(!event.isIntersecting)continue;
   previewObserver.unobserve(event.target);
   const holder=[...previewCache.entries()].find(([,view])=>view.canvas.parentElement===event.target);
   if(holder)enqueuePreview(holder[0]);
  }
 },{rootMargin:'120px'}):null;
 function releasePreview(entry){
  const view=previewCache.get(entry);
  if(!view)return;
  if(view.canvas.parentElement)previewObserver?.unobserve(view.canvas.parentElement);
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
  // Previously observed frames are about to be detached on reorder.
  if(previewObserver)for(const view of previewCache.values())
   if(view.canvas.parentElement)previewObserver.unobserve(view.canvas.parentElement);
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
    if(previewObserver)previewObserver.observe(frame);
    else enqueuePreview(entry);
   }
  }
  const pages=files.reduce((total,entry)=>total+entry.pageCount,0);
  summary.textContent=files.length+' PDF(s) · '+pages+' page(s) selected. Limits: '+limits.maxFiles+
   ' files, '+limits.maxPages+' pages, '+Math.round(limits.maxTotalBytes/(1024*1024))+' MB total.';
  mergeJump.hidden=files.length<10;
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
 // PDF Merger owns its upload controls. The generic bindFile helper re-enables
 // intentionally disabled controls (Cancel, first Move up, last Move down).
 // Preserve the existing admission/order logic while restoring each prior state.
 input.addEventListener('change',async()=>{
  const selected=[...input.files];
  if(!selected.length)return;
  const disabled=new Map();
  for(const control of root.querySelectorAll('button,input,select')){
   disabled.set(control,control.disabled);
   control.disabled=true;
  }
  let info=input.parentElement.querySelector('.selected-files');
  if(!info){info=el('p',{class:'selected-files'});input.after(info);}
  status(selected.some(f=>f.size>5*1024**2)?
   'Large file selected. Opening may take longer and use more memory…':'Opening file…');
  try{
   if(busy)throw Error('Wait for the current merge to finish or cancel it before adding documents.');
   if(uploading)throw Error('Wait for the current document upload to finish.');
   uploading=true;
   // The current queue and order change only after all new PDFs validate.
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
   info.textContent='Selected: '+selected.map(f=>f.name).join(', ');
   status('File ready.');
  }catch(error){
   summary.textContent='Upload rejected. Previously selected '+files.length+
    ' PDF(s) retained in the same order. '+String(error?.message||error);
   info.textContent='Could not open the selected file.';
   status(errorMessage(error),true);
  }finally{
   uploading=false;
   for(const [control,wasDisabled] of disabled)if(control.isConnected)control.disabled=wasDisabled;
   input.value='';
   void drainPreviews();
  }
 });
 notice(root,'Add PDFs in batches. You can merge 20 or more on modern phones within the displayed size and page limits. Larger jobs run in a background worker where supported. Keep this tab open until the download is ready. Exact duplicate selections are skipped; invalid batches preserve earlier files. Browser-based page copying may not preserve bookmarks, form fields, signatures, attachments or document-level actions. Bookmark removal requires your permission below; other unsupported features are rejected rather than silently lost.');
 const bookmarkConsent=el('input',{type:'checkbox',id:'pdf-merger-bookmark-consent',
  'aria-describedby':'pdf-merger-bookmark-info'});
 const bookmarkLabel=el('label',{for:'pdf-merger-bookmark-consent',text:'Merge pages only (remove bookmarks)'});
 const bookmarkInfo=el('p',{id:'pdf-merger-bookmark-info',
  text:'Optional: select only if your PDF contains bookmarks and you accept that the merged COPY will omit them. Your original PDFs will not change. Forms, signatures and other unsupported features remain protected.'});
 const bookmarkOption=el('div',{class:'pdf-merger-bookmark-option'});
 bookmarkOption.append(bookmarkConsent,bookmarkLabel,bookmarkInfo);
 const mergeControls=el('div',{class:'actions',id:'pdf-merger-actions'});
 const mergeButton=el('button',{type:'button',class:'primary',text:'Create PDF'});
 const cancelButton=el('button',{type:'button',text:'Cancel merge',disabled:true});
 const progress=el('progress',{max:1,value:0,hidden:true,'aria-label':'PDF merge progress'});
 const verified=el('p',{class:'pdf-merger-result',role:'status','aria-live':'polite'});
 mergeControls.append(mergeButton,cancelButton,progress);
 root.append(bookmarkOption,mergeControls,verified);
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
   status('Preparing PDFs for verified merging…');
   const result=await mergePdfBatch(snapshot,{
    signal:abortController.signal,isMobile,loadEngine:pdfLib,
    allowBookmarkLoss:bookmarkConsent.checked,
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
   // The shared Share / Save helper reenables unrelated disabled controls.
   // Replace only this PDF Merger result's share handler with a local one.
   const latestRows=[...root.querySelectorAll('#downloads .download-row')];
   const newRow=latestRows.find(row=>!oldRows.includes(row));
   const sharedShare=newRow?.querySelector('button');
   if(sharedShare&&sharedShare.textContent==='Share / Save'){
    const safeShare=sharedShare.cloneNode(true);
    sharedShare.replaceWith(safeShare);
    safeShare.addEventListener('click',async()=>{
     if(busy||safeShare.disabled)return;
     safeShare.disabled=true;
     try{
      const shareFile=new File([result.blob],'merged.pdf',{type:'application/pdf'});
      await navigator.share({files:[shareFile]});
     }catch(error){
      if(error?.name!=='AbortError')status('Sharing failed. You can still use Download.',true);
     }finally{safeShare.disabled=false;}
    });
   }
   // Once a valid new download exists, release old object URLs and their blobs.
   for(const old of oldRows){
    for(const link of old.querySelectorAll('a[href^="blob:"]'))
     URL.revokeObjectURL(link.href);
    old.remove();
   }
   outputRevision=revision;
   verified.textContent='Verified output: '+result.pageCount+' pages · '+
    format(result.byteLength/1024)+' KB. Merge follows the selected document order.'+
    (bookmarkConsent.checked?' Bookmarks were intentionally not copied.':'');
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
  files=[];revision++;outputRevision=-1;bookmarkConsent.checked=false;
  list.replaceChildren();clearOutputs();verified.textContent='';drawFiles();
  const previousFiles=input.parentElement.querySelector('.selected-files');
  if(previousFiles)previousFiles.textContent='';
  status('');
  announce('All PDFs removed from the merge queue.');
 });
 setupStatus(root);downloads(root);
 // The shared download helper revokes blob URLs on pagehide. A bfcache restore
 // can otherwise display revoked download links. Safely clear stale results and
 // rebuild first-page previews when the browser restores this same tool page.
 window.addEventListener('pagehide',()=>{
  for(const entry of files)releasePreview(entry);
  previewQueue.length=0;
  previewObserver?.disconnect();
 });
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  const hadResult=!!root.querySelector('#downloads .download-row');
  clearOutputs();
  outputRevision=-1;
  verified.textContent=hadResult?
   'Previous download expired when this tab was restored. Create PDF again to get a fresh verified download.':'';
  if(hadResult)status('Previous PDF download expired on browser return. Recreate the PDF.');
  drawFiles();
  announce('PDF Merger restored. Selected PDFs are retained; create a new download if needed.');
  void drainPreviews();
 });
}
