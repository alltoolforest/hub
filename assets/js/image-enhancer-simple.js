import { decodeEnhancerHeic, isEnhancerHeicInput } from './image-enhancer-heic.js';
export function mount(root) {
const panel=document.createElement('section');panel.id='enhancer-v2';panel.innerHTML=TEMPLATE;root.append(panel);
const $=id=>panel.querySelector('#'+id);
let file=null,worker=null,originalURL=null,resultURL=null,timer=null,job=0,busy=false;
const status=text=>{$('status').textContent=text;};
function controls(){for(const id of['file'])$(id).disabled=busy;$('run').disabled=busy||!file;$('cancel').disabled=!busy;}
function stop(){clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}busy=false;controls();}
function armTimeout(ticket){clearTimeout(timer);timer=setTimeout(()=>{if(ticket!==job)return;job++;stop();status('Processing took too long. Try a smaller image. No output exported.');},120000);}
function clearResult(){if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('download').hidden=true;$('download').removeAttribute('href');$('result').removeAttribute('src');$('diagnostics').textContent='';}
$('split').addEventListener('input',()=>{$('original').style.clipPath=`inset(0 ${100-Number($('split').value)}% 0 0)`;});
$('file').addEventListener('change',()=>{job++;stop();clearResult();if(originalURL)URL.revokeObjectURL(originalURL);originalURL=null;file=$('file').files[0]||null;if(file&&file.size>50*1024*1024){file=null;status('Choose a photo up to 50 MB.');}else status(file?'Ready. Select Enhance photo.':'Choose a photo to begin.');$('review').hidden=true;$('fileInfo').textContent=file?`${file.name} · ${(file.size/1048576).toFixed(2)} MB`:'JPEG, PNG, WebP or HEIC · native resolution · up to 12 megapixels';controls();});
$('cancel').addEventListener('click',()=>{job++;stop();status('Cancelled. Your original photo is unchanged.');});
$('run').addEventListener('click',async()=>{
 if(!file||busy)return;const ticket=++job;busy=true;controls();clearResult();armTimeout(ticket);status('Decoding your photograph…');let bitmap;
 try{
  if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap)throw new Error('Enhancement requires a browser with image workers and OffscreenCanvas. Try current Chrome on Android or a supported current Safari.');
  const heic=isEnhancerHeicInput(file);
  if(heic){const decoded=await decodeEnhancerHeic(file,message=>{if(ticket===job)status(message);});try{if(ticket!==job)return;bitmap=await createImageBitmap(decoded);}finally{decoded.close?.();}}
  else bitmap=await createImageBitmap(file);
  if(ticket!==job){bitmap.close();return;}
  const {width,height}=bitmap;if(width*height>12000000)throw new Error('This enhancer currently supports photos up to 12 megapixels. Choose a smaller original.');
  if(!originalURL){
   let previewBlob=file;
   if(heic){const scale=Math.min(1,1000/Math.max(width,height)),canvas=new OffscreenCanvas(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));try{const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Photo preview is unavailable.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);previewBlob=await canvas.convertToBlob({type:'image/png'});}finally{canvas.width=canvas.height=0;}if(ticket!==job){bitmap.close();return;}}
   originalURL=URL.createObjectURL(previewBlob);
  }$('original').src=originalURL;$('compare').style.aspectRatio=`${width}/${height}`;$('review').hidden=false;
  $('fileInfo').textContent=`${file.name} · ${width} × ${height} · ${(width*height/1e6).toFixed(2)} MP`;
  const options={strength:'balanced',sharpness:'auto',content:'auto',sourceMime:file.type,faceProtection:'standard',faces:[]};
  worker=new Worker(new URL('./enhancer-v2/image-enhancer-photo-worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>{if(ticket!==job)return;job++;stop();status(`Processing failed: ${e.message||'worker error'}. No output exported.`);};
  worker.onmessageerror=()=>{if(ticket!==job)return;job++;stop();status('Processing response could not be read. No output exported.');};
  worker.onmessage=async({data})=>{
   if(ticket!==job)return;if(data.error){job++;stop();status(`Processing failed: ${data.error}. No output exported.`);return;}
   if(data.progress){status(data.progress);return;}if(!data.blob)return;
   stop();busy=true;controls();armTimeout(ticket);status('Checking native-size output…');let check;
   try{if(!(data.blob instanceof Blob)||!data.blob.size||data.width!==width||data.height!==height)throw new Error('Invalid output metadata');check=await createImageBitmap(data.blob);if(check.width!==width||check.height!==height)throw new Error('Output dimensions changed');check.close();check=null;if(ticket!==job)return;
    resultURL=URL.createObjectURL(data.blob);$('result').src=resultURL;$('download').href=resultURL;$('download').download='AllToolForest-enhanced.png';$('download').hidden=false;$('diagnostics').textContent=JSON.stringify({build:'v2-main-20261015',width,height,...data.diagnostics},null,2);clearTimeout(timer);timer=null;busy=false;controls();status('Your photo is ready. Compare the result and download.');
   }catch(e){if(check)check.close();if(ticket!==job)return;stop();status(`Output check failed: ${e.message}. No output exported.`);}
  };
  armTimeout(ticket);
  worker.postMessage({bitmap,options},[bitmap]);bitmap=null;
 }catch(e){if(bitmap)bitmap.close();if(ticket!==job)return;stop();status(e.message);}
});
window.addEventListener('pagehide',()=>{job++;stop();clearResult();if(originalURL)URL.revokeObjectURL(originalURL);originalURL=null;$('original').removeAttribute('src');$('review').hidden=true;status(file?'Ready. Enhance again to restore the preview.':'Choose a photo to begin.');});

}

const TEMPLATE = '<p class="privacy-note">Your photo stays on your device. Original dimensions are preserved.</p>\n<label class="upload" for="file">Choose a photo<input id="file" type="file" accept="image/jpeg,image/png,image/webp,.heic,.heif"></label>\n<p id="fileInfo">JPEG, PNG, WebP or HEIC · up to 12 megapixels · up to 50 MB</p>\n<div class="actions"><button id="run" class="primary" disabled>Enhance photo</button><button id="cancel" disabled>Cancel</button></div>\n<p id="status" role="status" aria-live="polite">Choose a photo to begin.</p>\n<section id="review" hidden><div class="reviewTitle"><h2>Compare your photo</h2><a id="download" class="button primary" download="AllToolForest-enhanced.png" hidden>Download enhanced PNG</a></div>\n<div id="compare"><img id="result" alt="Enhanced photo"><img id="original" alt="Original photo"><span class="leftTag">Original</span><span class="rightTag">Enhanced</span></div>\n<label for="split">Slide to compare<input id="split" type="range" min="0" max="100" value="50"></label>\n<p>Enhancement improves tone, color and existing detail. It does not reconstruct missing features or remove strong blur.</p>\n<details><summary>Processing information</summary><pre id="diagnostics"></pre></details></section>\n<details class="other-tasks"><summary>Other image tasks</summary><p><a href="?task=upscale">Upscale resolution</a> · <a href="?task=deblur">Deblur a photo</a></p></details>';
