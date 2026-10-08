// Image to Text OCR: Task 1 reliability + Task 2 recognition preparation and accessible UX.
// Other PDF / scanned PDF tools use their unchanged code paths.
import {$,el,field,action,notice,setupStatus,status,fileInput,bindFile,checkFile,decodeImage,load,
  copy,output,downloads,clearOutputs,mobile,url} from './core.js';
import {checkImageDimensions,validateImageFile,networkFriendlyError,
  withOcrWorker,recognizeSafely,withinTime,abortError} from './image-ocr-reliability.js';
import {ocrSettings,drawPreparedOcr,validatePhoneImage,ocrProgressMilestone} from './image-ocr-prep.js';

const ENG_LANG='https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
export async function mount(root){
 let file=null,image=null,progressActive=false,activeController=null;
 const input=fileInput(root,'.jpg,.jpeg,.png,.webp,.heic,.heif',false,'Select a text image');
 const selected=el('p',{class:'selected-ocr-source',role:'status','aria-live':'polite',
   text:'No image selected. JPG, PNG, WebP or HEIC/HEIF; printed English only.'});
 root.append(selected);
 const previewRegion=el('section',{class:'ocr-source',hidden:true,'aria-label':'Current image source'});
 const previewTitle=el('h2',{text:'Source image'});
 const sourceCanvas=el('canvas',{role:'img','aria-label':'Current OCR source image. Original text stays unchanged.'});
 previewRegion.append(previewTitle,sourceCanvas);
 root.append(previewRegion);
 function renderPreview(candidate,name){
  const ratio=Math.min(1,720/candidate.width,720/candidate.height);
  const w=Math.max(1,Math.round(candidate.width*ratio)),h=Math.max(1,Math.round(candidate.height*ratio));
  // Keep the old preview and its valid source until the replacement has drawn successfully.
  const temp=el('canvas',{width:w,height:h});
  try{
   const context=temp.getContext('2d');
   if(!context)throw Error('Image preview is unavailable in this browser.');
   context.drawImage(candidate,0,0,w,h);
   sourceCanvas.width=w;sourceCanvas.height=h;
   const target=sourceCanvas.getContext('2d');
   if(!target)throw Error('Image preview is unavailable in this browser.');
   target.drawImage(temp,0,0);
   sourceCanvas.setAttribute('aria-label','Current source: '+name+'; '+candidate.width+
     ' by '+candidate.height+' pixels. Review against extracted text below.');
  }finally{temp.width=temp.height=0;}
 }
 bindFile(input,async files=>{
  const candidate=files[0];
  const ext=checkFile(candidate,['jpg','jpeg','png','webp','heic','heif'],mobile()?15:40);
  if(ext==='webp'||ext==='heic'||ext==='heif')
   await validatePhoneImage(candidate,ext,mobile());
  else await validateImageFile(candidate,ext,mobile());
  let decoded=null;
  try{
   decoded=await decodeImage(candidate);
   checkImageDimensions(decoded.width,decoded.height,mobile());
   renderPreview(decoded,candidate.name);
   // Commit only once decoded dimensions and preview have been validated.
   const previous=image;
   image=decoded;file=candidate;
   selected.textContent='Active OCR image: '+candidate.name+
     ' · '+decoded.width+' × '+decoded.height+' pixels. Previous recognized text stays until OCR succeeds.';
   previewRegion.hidden=false;
   if(previous!==decoded)previous?.close?.();
  }catch(error){if(decoded!==image)decoded?.close?.();throw error;}
 });
 notice(root,'Printed English text only. OCR is performed in your browser; the English language data is downloaded on first use. Use a clear, upright source. Review names and numbers before using the result.');
 const opts=el('div',{class:'fields ocr-options'},[
  field('ocr-rotate','Rotate text for recognition','select','0',{options:[
    ['0','No rotation'],['90','90° clockwise'],['180','180°'],['270','90° counterclockwise']]}),
  field('ocr-prepare','Image preparation','select','original',{options:[
    ['original','Original image (recommended)'],
    ['contrast','Gentle grayscale and contrast for faint print']]})
 ]);
 root.append(opts);
 const hint=el('p',{class:'ocr-hint',text:'Rotation and contrast change only the temporary recognition canvas, never your original image. For sideways photos, select the rotation that makes text upright.'});
 root.append(hint);
 const text=el('textarea',{id:'ocr-text',rows:15,'aria-label':'Editable recognized text'});
 const review=el('p',{class:'ocr-review',role:'status','aria-live':'polite',
   text:'After recognition, compare the extracted text with the source image and correct any errors.'});
 const textLabel=el('label',{for:'ocr-text',text:'Recognized text — editable'});
 root.append(textLabel,text,review);
 // Editing the transcript invalidates downloads containing the previous version.
 text.addEventListener('input',()=>{
  clearOutputs();
  review.textContent='Manual edits made. Copy or download to save your corrected text.';
 });
 const progressInfo=el('div',{class:'ocr-progress-area',hidden:true});
 const progress=el('progress',{id:'ocr-progress',max:100,value:0,'aria-label':'OCR recognition progress'});
 const progressText=el('span',{text:'OCR starting…','aria-hidden':'true'});
 progressInfo.append(progress,progressText);
 root.append(progressInfo);
 const actions=el('div',{class:'actions'});
 const recognize=el('button',{type:'button',class:'primary',text:'Recognize text'});
 const cancel=el('button',{type:'button',text:'Cancel OCR','aria-label':'Cancel OCR and preserve current text',disabled:true});
 actions.append(recognize,cancel,
  action('Copy text',()=>copy(text.value)),
  action('Download TXT',()=>{
   if(!text.value.trim())throw Error('Recognize or enter text first.');
   output(new Blob([text.value],{type:'text/plain'}),'recognized-text.txt');
  }));
 root.append(actions);
 function idle(){
  activeController=null;progressInfo.hidden=true;
  progress.value=0;cancel.disabled=true;recognize.disabled=false;
  input.disabled=false;
  $('#ocr-rotate').disabled=false;$('#ocr-prepare').disabled=false;
 }
 cancel.addEventListener('click',()=>{
  if(activeController&&!activeController.signal.aborted){
   activeController.abort();
   cancel.disabled=true;
   status('Cancelling OCR…');
  }
 });
 recognize.addEventListener('click',async()=>{
  if(activeController)return;
  if(!file||!image){status('Choose a valid image first.',true);return;}
  let settings;
  try{settings=ocrSettings($('#ocr-rotate').value,$('#ocr-prepare').value);}
  catch(error){status(error.message,true);return;}
  const controller=new AbortController();
  const signal=controller.signal;activeController=controller;
  recognize.disabled=true;cancel.disabled=false;input.disabled=true;
  $('#ocr-rotate').disabled=true;$('#ocr-prepare').disabled=true;
  text.readOnly=true;progressActive=true;
  progressInfo.hidden=false;progress.value=0;progressText.textContent='Preparing OCR…';
  let milestone=-1;
  try{
   status('Loading OCR engine…');
   let T;
   try{T=await withinTime(()=>load('ocr'),120000,'OCR engine loading',signal);}
   catch(error){if(signal.aborted)throw abortError();throw networkFriendlyError(error);}
   if(signal.aborted)throw abortError();
   let recognized;
   try{
    recognized=await withOcrWorker(
     async()=>{
      const raw=await T.createWorker('eng',1,{
       workerPath:url('assets/vendor/tesseract-worker.js'),
       corePath:url('assets/vendor/tesseract-core/'),
       langPath:ENG_LANG,
       logger:m=>{
        if(!progressActive||signal.aborted)return;
        const p=ocrProgressMilestone(m.progress,m.status,milestone);
        if(p.value!==null){progress.value=p.value;progressText.textContent=p.text+' · '+p.value+'%';}
        if(p.announce){milestone=p.milestone;status(p.text+' · '+p.milestone+'%');}
       }
      });
      // One-time termination covers cancellation and normal worker cleanup safely.
      let closed=false;
      const worker={
       recognize:(...args)=>raw.recognize(...args),
       terminate:()=>{if(closed)return Promise.resolve();closed=true;return raw.terminate();}
      };
      if(signal.aborted){await worker.terminate();throw abortError();}
      return worker;
     },
     worker=>recognizeSafely(worker,image,(w,h)=>el('canvas',{width:w,height:h}),{
      signal,rotation:settings.rotation,
      paint:(context,source,dimensions)=>drawPreparedOcr(context,source,dimensions,settings)
     }),
     {signal}
    );
   }catch(error){if(signal.aborted)throw abortError();throw networkFriendlyError(error);}
   if(signal.aborted)throw abortError();
   if(!recognized.trim())throw Error('No printed text was recognized. Try a clearer image or another rotation. Previous text and downloads are preserved.');
   // Task 1 invariant: only successful, nonempty results replace previous edited text.
   clearOutputs();
   text.value=recognized;
   review.textContent='Review the text against the source above, especially names, numbers and line breaks. Correct mistakes before download.';
   progress.value=100;progressText.textContent='Recognition complete';
   status('Text recognized. Review and correct it before export.');
  }catch(error){
   const message=signal.aborted?'OCR cancelled. Your previous text and downloads were preserved.':networkFriendlyError(error).message;
   status(message,true);
   review.textContent='The last valid text remains available. You can retry recognition or save your corrections.';
  }finally{
   progressActive=false;text.readOnly=false;
   idle();
  }
 });
 setupStatus(root);downloads(root);
 window.addEventListener('pagehide',()=>{progressActive=false;activeController?.abort();image?.close?.();},{once:true});
}
