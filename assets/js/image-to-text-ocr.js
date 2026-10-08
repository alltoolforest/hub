// Image to Text OCR — multiple ordered images; original per-image pixel data is preserved.
// Dedicated OCR-only UI: no scanned PDF, Edit PDF, or frozen-tool code is modified.
import {$,el,field,action,notice,setupStatus,status,fileInput,bindFile,checkFile,decodeImage,load,
 copy,output,downloads,clearOutputs,mobile,url} from './core.js';
import {checkImageDimensions,validateImageFile,networkFriendlyError,
 withOcrWorker,recognizeSafely,withinTime,abortError} from './image-ocr-reliability.js';
import {ocrSettings,drawPreparedOcr,validatePhoneImage,ocrProgressMilestone} from './image-ocr-prep.js';
import {batchCapacity,moveBy,rotateBy,batchText,drawRotatedPreview} from './image-ocr-batch.js';
import {docxBlob,pdfBlob} from './image-ocr-export.js';

const ENG_LANG='https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
export async function mount(root){
 let items=[],nextId=0,activeId=null,image=null,file=null;
 let progressActive=false,activeController=null,queueRevision=0,resultRevision=-1;
 const input=fileInput(root,'.jpg,.jpeg,.png,.webp,.heic,.heif',true,'Select one or more text images');
 const selected=el('p',{class:'selected-ocr-source',role:'status','aria-live':'polite',
  text:'No images selected. JPG, PNG, WebP and HEIC/HEIF; printed English only.'});
 root.append(selected);
 notice(root,'Add images, arrange their order, rotate each preview as needed, then run OCR. Text is extracted in that same order. Recognition is browser-based; English model data downloads on first use. Check extracted names and numbers.');
 const queueHeading=el('h2',{text:'Arrange images for OCR'});
 const queueHelp=el('p',{class:'ocr-hint',id:'ocr-queue-help',
  text:'Use Move up / Move down to set the reading order. Rotations update each preview immediately and do not change the original image.'});
 const queue=el('ol',{class:'ocr-batch-list','aria-label':'Image reading order','aria-describedby':'ocr-queue-help'});
 root.append(queueHeading,queueHelp,queue);
 const previewRegion=el('section',{class:'ocr-source',hidden:true,'aria-label':'Current image source'});
 const previewTitle=el('h2',{text:'Selected image preview'});
 const sourceCanvas=el('canvas',{role:'img','aria-label':'Current OCR source image'});
 previewRegion.append(previewTitle,sourceCanvas);root.append(previewRegion);
 const opts=el('div',{class:'fields ocr-options'},[
  field('ocr-rotate','Rotate selected image','select','0',{options:[
   ['0','No rotation'],['90','90° clockwise'],['180','180°'],['270','90° counterclockwise']]}),
  field('ocr-prepare','Image preparation','select','original',{options:[
   ['original','Original image (recommended)'],
   ['contrast','Gentle grayscale and contrast for faint print']]})
 ]);
 root.append(opts);
 const hint=el('p',{class:'ocr-hint',text:'Rotation is shown in the preview immediately. Gentle contrast is applied only to the temporary OCR canvas.'});root.append(hint);
 const textLabel=el('label',{for:'ocr-text',text:'Extracted text — editable, in image order'});
 const text=el('textarea',{id:'ocr-text',rows:15,'aria-label':'Editable recognized text'});
 const review=el('p',{class:'ocr-review',role:'status','aria-live':'polite',
  text:'After OCR, compare the combined text to the ordered images. You may correct it before export.'});
 root.append(textLabel,text,review);
 const progressInfo=el('div',{class:'ocr-progress-area',hidden:true});
 const progress=el('progress',{id:'ocr-progress',max:100,value:0,'aria-label':'OCR recognition progress'});
 const progressText=el('span',{text:'OCR starting…','aria-hidden':'true'});
 progressInfo.append(progress,progressText);root.append(progressInfo);
 const actions=el('div',{class:'actions'});
 const recognize=el('button',{type:'button',class:'primary',text:'Recognize text'});
 const cancel=el('button',{type:'button',text:'Cancel OCR','aria-label':'Cancel OCR and preserve current text',disabled:true});
 // Unlike the shared action(), tool-local exports never re-enable unrelated controls
 // while an OCR job still owns them.
 function localAction(label,fn){
  const button=el('button',{type:'button',text:label});
  button.addEventListener('click',async()=>{
   if(button.disabled)return;
   button.disabled=true;
   try{await fn();}
   catch(error){status(error?.message||'Export failed. Please retry.',true);}
   finally{button.disabled=false;}
  });
  return button;
 }
 const captureExport=()=>{
  assertCurrentOrder();
  return {value:text.value,revision:resultRevision};
 };
 const verifyExport=revision=>{
  if(queueRevision!==revision||resultRevision!==revision)
   throw Error('The OCR result changed during export. Run OCR again or retry with the current text.');
 };
 actions.append(recognize,cancel,
  localAction('Copy text',()=>copy(text.value)),
  localAction('Download TXT',()=>{
   if(!text.value.trim())throw Error('Recognize or enter text first.');
   const snapshot=captureExport();
   verifyExport(snapshot.revision);
   output(new Blob([snapshot.value],{type:'text/plain;charset=utf-8'}),'extracted-text.txt');
  }),
  localAction('Download DOCX',async()=>{
   const snapshot=captureExport();
   const engine=await load('docx');
   const blob=await docxBlob(snapshot.value,engine);
   verifyExport(snapshot.revision);
   output(blob,'extracted-text.docx');
   status('DOCX ready. The file contains your editable, reviewed text.');
  }),
  localAction('Download PDF',async()=>{
   const snapshot=captureExport();
   const engine=await load('pdf');
   const blob=await pdfBlob(snapshot.value,engine);
   verifyExport(snapshot.revision);
   output(blob,'extracted-text.pdf');
   status(blob.ocrTextRasterized?
    'PDF ready. International text is preserved visually; use DOCX for editable and selectable text.':
    'PDF ready. All text is selectable.');
  })
 );
 root.append(actions);
 function current(){return items.find(i=>i.id===activeId)||null;}
 function assertCurrentOrder(){
  if(items.length&&resultRevision!==queueRevision)throw Error('Images or their order changed. Run OCR again before exporting, so the text follows the current image order.');
 }
 function dirty(reason){
  queueRevision++;
  if(text.value.trim()){
   // Never delete a valid previous download, but label its old image order clearly.
   for(const row of $('#downloads')?.querySelectorAll('.download-row')||[]){
    row.classList.add('ocr-stale-download');
    if(!row.querySelector('.ocr-stale-label')){
     row.prepend(el('span',{class:'ocr-stale-label',
      text:'Previous image order — this download is not the current arrangement.'}));
    }
   }
   review.textContent=reason+' Existing downloads contain the previous image order. Run OCR again before generating exports for the current arrangement.';
  }
 }
 function showSelected(){
  const active=current();image=active?.image||null;file=active?.file||null;
  previewRegion.hidden=!active;
  if(!active){selected.textContent='No images selected.';return;}
  selected.textContent='Active OCR image: '+active.name+' · '+active.image.width+' × '+active.image.height+
   ' pixels · '+items.length+' image'+(items.length===1?'':'s')+' in chosen order.';
  $('#ocr-rotate').value=String(active.rotation);
  drawRotatedPreview(sourceCanvas,active.image,active.rotation,720);
  sourceCanvas.setAttribute('aria-label','Selected image '+active.name+' rotated '+active.rotation+' degrees.');
 }
 function renderQueue(focusId=null,focusAction=null){
  queue.replaceChildren();
  items.forEach((item,index)=>{
   const li=el('li',{class:'ocr-batch-item', 'aria-label':'Image '+(index+1)+': '+item.name});
   if(item.id===activeId)li.classList.add('selected');
   const thumb=el('canvas',{class:'ocr-thumb',role:'img','aria-label':'Preview of '+item.name});
   drawRotatedPreview(thumb,item.image,item.rotation,130);
   const info=el('div',{class:'ocr-batch-info'},[
    el('strong',{text:(index+1)+'. '+item.name}),
    el('small',{text:item.image.width+' × '+item.image.height+' px · rotation '+item.rotation+'°'})
   ]);
   const buttons=el('div',{class:'ocr-batch-buttons'});
   const control=(label,fn,disabled=false)=>{
    const btn=el('button',{type:'button',text:label,disabled:disabled||Boolean(activeController)});
    btn.addEventListener('click',()=>{
     if(activeController)return;
     try{fn();}catch(e){status(e.message,true);}
    });
    buttons.append(btn);
   };
   control('View',()=>{activeId=item.id;renderQueue(item.id,'View');showSelected();});
   control('Move up',()=>{
    items=moveBy(items,item.id,-1);dirty('Image order changed.');renderQueue(item.id,'Move up');showSelected();
   },index===0);
   control('Move down',()=>{
    items=moveBy(items,item.id,1);dirty('Image order changed.');renderQueue(item.id,'Move down');showSelected();
   },index===items.length-1);
   control('Rotate left',()=>rotate(item.id,-90));
   control('Rotate right',()=>rotate(item.id,90));
   control('Remove',()=>{
    items=items.filter(i=>i.id!==item.id);
    item.image.close?.();
    if(activeId===item.id)activeId=items[0]?.id??null;
    dirty('Image selection changed.');
    renderQueue(items[Math.min(index,items.length-1)]?.id??null,'View');
    showSelected();
   });
   li.append(thumb,info,buttons);queue.append(li);
  });
  queueHeading.textContent='Arrange images for OCR ('+items.length+')';
  if(focusId!==null){
   const position=items.findIndex(item=>item.id===focusId);
   const buttons=position>=0?[...queue.children[position].querySelectorAll('button')]:[];
   const target=buttons.find(b=>b.textContent===focusAction&&!b.disabled)||
    buttons.find(b=>b.textContent==='View');
   target?.focus();
  }
 }
 function rotate(id,step){
  const item=items.find(i=>i.id===id);if(!item)return;
  item.rotation=rotateBy(item.rotation,step);
  activeId=id;dirty('Image rotation changed.');
  renderQueue(id,step>0?'Rotate right':'Rotate left');showSelected();
  status(item.name+' rotated to '+item.rotation+'°. Preview updated.');
 }
 $('#ocr-rotate').addEventListener('change',()=>{
  const item=current();if(!item)return;
  const next=ocrSettings($('#ocr-rotate').value).rotation;
  if(next!==item.rotation){item.rotation=next;dirty('Image rotation changed.');renderQueue();}
  showSelected();
 });
 bindFile(input,async files=>{
  batchCapacity(items,files.length,mobile());
  const staged=[];
  try{
   for(const candidate of files){
    const ext=checkFile(candidate,['jpg','jpeg','png','webp','heic','heif'],mobile()?15:40);
    if(['webp','heic','heif'].includes(ext))await validatePhoneImage(candidate,ext,mobile());
    else await validateImageFile(candidate,ext,mobile());
    let decoded=null;
    try{
     decoded=await decodeImage(candidate);
     checkImageDimensions(decoded.width,decoded.height,mobile());
     const budget=batchCapacity([...items,...staged],1,mobile());
     if(budget.usedPixels+decoded.width*decoded.height>budget.maxPixels)
      throw Error('This batch exceeds the safe decoded-image memory limit. Try fewer or smaller images.');
     // Validate canvas before adding to the live working set.
     const test=el('canvas');drawRotatedPreview(test,decoded,0,130);test.width=test.height=0;
     staged.push({id:++nextId,name:candidate.name,file:candidate,image:decoded,rotation:0,text:null});
    }catch(e){decoded?.close?.();throw e;}
   }
   const previousItems=items,previousActive=activeId;
   // Preview the candidate queue before making the upload visible to OCR.
   try{
    items=[...items,...staged];
    activeId=staged[0]?.id??activeId;
    renderQueue();showSelected();
   }catch(error){
    items=previousItems;activeId=previousActive;
    try{renderQueue();showSelected();}catch{}
    throw error;
   }
   dirty('New images added.');
   status(items.length+' image(s) ready. Set the order and rotation, then recognize.');
  }catch(error){for(const item of staged)item.image.close?.();throw error;}
 });
 text.addEventListener('input',()=>{
  clearOutputs();
  review.textContent='Manual edits made. Export will include your corrected text.';
 });
 function idle(){
  activeController=null;progressInfo.hidden=true;progress.value=0;
  cancel.disabled=true;recognize.disabled=false;input.disabled=false;
  $('#ocr-rotate').disabled=false;$('#ocr-prepare').disabled=false;
  renderQueue();
 }
 cancel.addEventListener('click',()=>{
  if(activeController&&!activeController.signal.aborted){
   activeController.abort();cancel.disabled=true;status('Cancelling OCR…');
  }
 });
 recognize.addEventListener('click',async()=>{
  if(activeController)return;
  if(!items.length){status('Choose at least one valid image first.',true);return;}
  const settings=ocrSettings('0',$('#ocr-prepare').value);
  const controller=new AbortController(),signal=controller.signal;activeController=controller;
  recognize.disabled=true;cancel.disabled=false;input.disabled=true;
  $('#ocr-rotate').disabled=true;$('#ocr-prepare').disabled=true;
  text.readOnly=true;progressActive=true;progressInfo.hidden=false;progress.value=0;
  progressText.textContent='Starting ordered OCR…';renderQueue();
  const snapshot=[...items],startedRevision=queueRevision;
  let imageIndex=0,milestone=-1;
  try{
   status('Loading OCR engine…');
   let T;
   try{T=await withinTime(()=>load('ocr'),120000,'OCR engine loading',signal);}
   catch(e){if(signal.aborted)throw abortError();throw networkFriendlyError(e);}
   if(signal.aborted)throw abortError();
   let recognized;
   try{
    recognized=await withOcrWorker(async()=>{
     const raw=await T.createWorker('eng',1,{
      workerPath:url('assets/vendor/tesseract-worker.js'),corePath:url('assets/vendor/tesseract-core/'),
      langPath:ENG_LANG,
      logger:m=>{
       if(!progressActive||signal.aborted)return;
       const p=ocrProgressMilestone(m.progress,m.status,milestone);
       const overall=Math.round(((imageIndex+(p.value??0)/100)/snapshot.length)*100);
       progress.value=overall;progressText.textContent='Image '+(imageIndex+1)+' of '+snapshot.length+' · '+overall+'%';
       if(p.announce){milestone=p.milestone;status('Image '+(imageIndex+1)+'/'+snapshot.length+' · '+p.text+' '+p.milestone+'%');}
      }
     });
     let closed=false;
     const worker={
      recognize:(...args)=>raw.recognize(...args),
      terminate:()=>{if(closed)return Promise.resolve();closed=true;return raw.terminate();}
     };
     if(signal.aborted){await worker.terminate();throw abortError();}
     return worker;
    },async worker=>{
     const results=[];
     for(const [index,item] of snapshot.entries()){
      if(signal.aborted)throw abortError();
      imageIndex=index;milestone=-1;
      status('Recognizing image '+(index+1)+' of '+snapshot.length+': '+item.name);
      const value=await recognizeSafely(worker,item.image,(w,h)=>el('canvas',{width:w,height:h}),{
       signal,rotation:item.rotation,
       paint:(ctx,source,dimensions)=>drawPreparedOcr(ctx,source,dimensions,{...settings,rotation:item.rotation})
      });
      results.push({...item,text:value.trim()||'[No printed text recognized]'});
      progress.value=Math.round((index+1)/snapshot.length*100);
     }
     return results;
    },{signal});
   }catch(e){if(signal.aborted)throw abortError();throw networkFriendlyError(e);}
   if(signal.aborted||queueRevision!==startedRevision)throw abortError();
   if(!recognized.some(i=>i.text!=='[No printed text recognized]'))
    throw Error('No printed text was recognized in this batch. Previous text and downloads are preserved.');
   const combined=batchText(recognized);
   for(const item of recognized){
    const original=items.find(i=>i.id===item.id);
    if(original)original.text=item.text;
   }
   clearOutputs();
   text.value=combined;
   resultRevision=queueRevision;
   review.textContent='OCR complete in image order. Compare against the previews and edit mistakes before exporting TXT, DOCX or PDF.';
   progress.value=100;status('Text recognized from '+snapshot.length+' image(s) in your chosen order.');
  }catch(error){
   status(signal.aborted?'OCR cancelled. Your previous text and downloads were preserved.':networkFriendlyError(error).message,true);
   review.textContent='Previous valid text is preserved. You can retry OCR without losing edits.';
  }finally{progressActive=false;text.readOnly=false;idle();}
 });
 setupStatus(root);downloads(root);
 window.addEventListener('pagehide',()=>{
  progressActive=false;activeController?.abort();
  for(const item of items)item.image.close?.();
 },{once:true});
}
