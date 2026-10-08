// Image to Text OCR — Task 1: lossless retries, validated source, bounded resources.
// No changes to OCR language, recognition quality, cancellation, or interface design in Task 1.
import {$,el,action,notice,setupStatus,status,fileInput,bindFile,checkFile,decodeImage,load,
  copy,output,downloads,clearOutputs,mobile,url} from './core.js';
import {checkImageDimensions,validateImageFile,networkFriendlyError,
  withOcrWorker,recognizeSafely} from './image-ocr-reliability.js';

const ENG_LANG='https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
export async function mount(root){
 let file=null,image=null,progressActive=false;
 const input=fileInput(root,'.jpg,.jpeg,.png',false,'Select a text image');
 const selected=el('p',{class:'selected-ocr-source',role:'status','aria-live':'polite',
   text:'No image selected. JPG, JPEG or PNG; printed English text only.'});
 root.append(selected);
 bindFile(input,async files=>{
  const candidate=files[0];
  const ext=checkFile(candidate,['jpg','jpeg','png'],mobile()?15:40);
  await validateImageFile(candidate,ext,mobile());
  let decoded=null;
  try{
   decoded=await decodeImage(candidate);
   checkImageDimensions(decoded.width,decoded.height,mobile());
   // Commit only after the replacement file has passed decoding and dimension checks.
   const previous=image;
   image=decoded;file=candidate;
   selected.textContent='Active OCR image: '+candidate.name+
     ' · '+decoded.width+' × '+decoded.height+' pixels. Previous recognized text is retained until you run OCR successfully.';
   if(previous!==decoded)previous?.close?.();
  }catch(error){if(decoded!==image)decoded?.close?.();throw error;}
 });
 notice(root,'Printed English text only. OCR accuracy depends on scan quality. The first run downloads a recognition engine and English language data; it may take time. Review the extracted text.');
 const text=el('textarea',{id:'ocr-text',rows:15,'aria-label':'Editable recognized text'});
 root.append(text);
 root.append(el('div',{class:'actions'},[
  action('Recognize text',async()=>{
   if(!file||!image)throw Error('Choose a valid image first.');
   // Prevent user edits during an active recognition attempt, then restore editability.
   // Preserve prior text and downloads until a non-empty result has been recognized.
   text.readOnly=true;
   progressActive=true;
   try{
    status('Loading OCR engine…');
    let T;
    try{T=await load('ocr');}
    catch(error){throw networkFriendlyError(error);}
    let recognized;
    try{
     recognized=await withOcrWorker(
      ()=>T.createWorker('eng',1,{
       workerPath:url('assets/vendor/tesseract-worker.js'),
       corePath:url('assets/vendor/tesseract-core/'),
       langPath:ENG_LANG,
       logger:m=>{
        if(progressActive)status(m.status+(m.progress!=null?' · '+Math.round(m.progress*100)+'%':''));
       }
      }),
      worker=>recognizeSafely(worker,image,(w,h)=>el('canvas',{width:w,height:h}))
     );
    }catch(error){throw networkFriendlyError(error);}
    if(!recognized.trim())throw Error('No printed text was recognized. Try a clearer image. The previous text and downloads are preserved.');
    // Only now replace the result and invalidate downloads that belong to the old text.
    clearOutputs();
    text.value=recognized;
    status('Text recognized. Review and correct it before export.');
   }finally{progressActive=false;text.readOnly=false;}
  },true),
  action('Copy text',()=>copy(text.value)),
  action('Download TXT',()=>{
   if(!text.value.trim())throw Error('Recognize or enter text first.');
   output(new Blob([text.value],{type:'text/plain'}),'recognized-text.txt');
  })
 ]));
 setupStatus(root);downloads(root);
 window.addEventListener('pagehide',()=>{progressActive=false;image?.close?.();},{once:true});
}
