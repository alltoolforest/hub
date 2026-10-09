// PDF Merger Task 1: isolated source validation. The merge engine remains unchanged.
import {el,format,action,notice,setupStatus,status,fileInput,bindFile,pdfLib,output,downloads,clearOutputs,mobile} from './core.js';
import {preparePdfBatch,limitsFor} from './pdf-merger-input.js';
import {verifiedMerge} from './pdf-merger-verify.js';

export async function mount(root){
 let files=[],busy=false,revision=0,outputRevision=-1,controller=null;
 const isMobile=mobile();
 const limits=limitsFor(isMobile);
 const input=fileInput(root,'.pdf',true,'Select PDFs');
 const list=el('ul',{class:'file-list'});
 const summary=el('p',{class:'pdf-merger-admission',role:'status','aria-live':'polite',
  text:'No PDFs selected. Up to '+limits.maxFiles+' files, '+limits.maxPages+' pages and '+
   Math.round(limits.maxTotalBytes/(1024*1024))+' MB total on this device.'});
 root.append(list,summary);
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
 function drawFiles(){
  list.replaceChildren();
  files.forEach((entry,i)=>{
   const row=el('li');
   row.append(
    el('span',{text:(i+1)+'. '+entry.file.name+' · '+format(entry.file.size/1024)+' KB · '+entry.pageCount+' page'+(entry.pageCount===1?'':'s')}),
    action('↑',()=>{if(busy)return;if(i>0){[files[i-1],files[i]]=[files[i],files[i-1]];changed();}drawFiles()}),
    action('↓',()=>{if(busy)return;if(i<files.length-1){[files[i+1],files[i]]=[files[i],files[i+1]];changed();}drawFiles()}),
    action('Remove',()=>{if(busy)return;files.splice(i,1);changed();drawFiles()})
   );
   list.append(row);
  });
  const pages=files.reduce((total,entry)=>total+entry.pageCount,0);
  summary.textContent=files.length+' PDF(s) · '+pages+' page(s) selected. Limits: '+limits.maxFiles+
   ' files, '+limits.maxPages+' pages, '+Math.round(limits.maxTotalBytes/(1024*1024))+' MB total.';
 }
 bindFile(input,async selected=>{
  if(busy)throw Error('Wait for the current merge to finish or cancel it before adding documents.');
  // Neither the queue nor the displayed order changes until every new PDF is verified.
  try{
   const engine=await pdfLib();
   const result=await preparePdfBatch(files,selected,{
    isMobile,
    loadPdf:bytes=>engine.PDFDocument.load(bytes,{updateMetadata:false})
   });
   if(result.entries.length){files=[...files,...result.entries];changed();}
   drawFiles();
   const added=result.entries.length,skipped=result.skipped.length;
   const message=added+' PDF(s) added'+(skipped?' · '+skipped+' exact duplicate(s) skipped: '+result.skipped.join(', '):'')+
    '. The existing file order is preserved.';
   summary.textContent+=' '+message;
  }catch(error){
   // Existing entries and their order remain unchanged; bindFile presents error status.
   summary.textContent='Upload rejected. Previously selected '+files.length+
    ' PDF(s) retained in the same order. '+String(error?.message||error);
   throw error;
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
  }
 });
 const resetButton=el('button',{type:'button',text:'Reset'});
 mergeControls.append(resetButton);
 resetButton.addEventListener('click',()=>{
  if(busy){status('Cancel the merge before resetting.',true);return;}
  files=[];revision++;outputRevision=-1;
  list.replaceChildren();clearOutputs();verified.textContent='';drawFiles();
 });
 setupStatus(root);downloads(root);
}
