import { decodeEnhancerHeic, isEnhancerHeicInput } from './image-enhancer-heic.js';
import { inspectPhoto, memoryAdvice, reducedDimensions } from './enhancer-v2/input-plan.js';
import { validatePngEnvelope } from './enhancer-v2/png-stream.js';
export function mount(root) {
  const panel=document.createElement('section');panel.id='enhancer-v2';panel.innerHTML=TEMPLATE;root.append(panel);
  const $=id=>panel.querySelector('#'+id),levels=[4000000,1000000,250000];
  let file=null,worker=null,timer=null,job=0,busy=false,meta=null,nativeAcknowledged=false,reduction=-1,previewConsent=false;
  let urls=[];
  const status=text=>{$('status').textContent=text;};
  function controls(){ $('file').disabled=busy;$('run').disabled=busy||!file;$('cancel').disabled=!busy;$('smaller').disabled=busy;$('cameraPreview').disabled=busy; }
  function stop(){clearTimeout(timer);timer=null;worker?.terminate();worker=null;busy=false;controls();}
  function clearResult(){for(const url of urls)URL.revokeObjectURL(url);urls=[];$('download').hidden=true;$('download').removeAttribute('href');$('original').removeAttribute('src');$('result').removeAttribute('src');$('review').hidden=true;}
  function url(blob){const value=URL.createObjectURL(blob);urls.push(value);return value;}
  function offerSmaller(message){
    const next=reduction+1;
    $('recovery').hidden=false;$('smaller').hidden=next>=levels.length;
    if(next<levels.length)$('smaller').textContent=`Enhance a smaller copy (up to ${levels[next]/1e6} MP)`;
    $('recoveryText').textContent='A smaller copy reduces resolution. Your original file stays unchanged. It will only be created if you select the option below.';
    status(message+(next<levels.length?' You can try a smaller enhanced copy.':' Even the smallest attempt could not complete. The file may need a supported-format export or a device with more available memory.'));
  }
  function fail(ticket,message,code){if(ticket!==job)return;job++;stop();clearResult();if(code==='PREVIEW_CONSENT'){$('recovery').hidden=false;$('cameraPreview').hidden=false;$('recoveryText').textContent=message;status('Permission is needed to use the camera-rendered preview.');}else offerSmaller(message);}
  function armTimeout(ticket){clearTimeout(timer);timer=setTimeout(()=>fail(ticket,'This attempt stopped because the device took too long. No output was exported.'),120000);}
  $('split').addEventListener('input',()=>{$('original').style.clipPath=`inset(0 ${100-Number($('split').value)}% 0 0)`;});
  $('file').addEventListener('change',()=>{job++;stop();clearResult();file=$('file').files[0]||null;meta=null;reduction=-1;nativeAcknowledged=false;previewConsent=false;$('recovery').hidden=true;$('cameraPreview').hidden=true;$('run').textContent='Enhance original';$('fileInfo').textContent=file?`${file.name} · ${(file.size/1048576).toFixed(2)} MB`:FORMATS;status(file?'Ready. Original resolution is attempted first.':'Choose a photo to begin.');controls();});
  $('cancel').addEventListener('click',()=>{job++;stop();status('Cancelled. Your original photo is unchanged.');});
  $('run').addEventListener('click',()=>{reduction=-1;start(false);});
  $('smaller').addEventListener('click',()=>{if(!busy&&reduction+1<levels.length){reduction++;start(true);}});
  $('cameraPreview').addEventListener('click',()=>{previewConsent=true;if(reduction<0)reduction=0;start(true);});
  async function start(reduced) {
    if(!file||busy)return;
    const ticket=++job;busy=true;controls();clearResult();$('recovery').hidden=true;armTimeout(ticket);status('Checking photo dimensions…');let bitmap;
    try {
      if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap)throw new Error('This browser does not provide the image-worker features required here. Please open the tool in a current supported browser.');
      if(!meta)meta=await inspectPhoto(file);if(ticket!==job)return;
      if(meta&&(!meta.width||!meta.height))throw new Error('The image header contains invalid dimensions.');
      if(!reduced&&!nativeAcknowledged&&(!meta||memoryAdvice(meta,navigator.deviceMemory).caution)){
        nativeAcknowledged=true;stop();$('run').textContent='Try original size';offerSmaller(meta?`This ${meta.width} × ${meta.height} photo may exceed the browser’s available memory at original size. You may try the original or choose a smaller copy.`:'The original dimensions could not be checked before decoding. You may try the original or choose a smaller output. Some formats still require full-size decoding.');return;
      }
      const maxPixels=reduced?levels[reduction]:null;
      if(isEnhancerHeicInput(file)){
        status('Decoding HEIC/HEIF…');const decoded=await decodeEnhancerHeic(file,message=>{if(ticket===job)status(message);});
        try{if(ticket!==job)return;const fit=reduced?reducedDimensions(decoded.width||decoded.naturalWidth,decoded.height||decoded.naturalHeight,maxPixels):null;bitmap=await createImageBitmap(decoded,fit?{resizeWidth:fit.width,resizeHeight:fit.height,resizeQuality:'high'}:{});}finally{decoded.close?.();}
        if(ticket!==job){bitmap.close();return;}
      }
      const expectedNative=bitmap?{width:bitmap.width,height:bitmap.height}:meta;
      const options={strength:'balanced',sharpness:'auto',content:'auto',sourceMime:file.type,faceProtection:'standard',faces:[]};
      worker=new Worker(new URL('./enhancer-v2/image-enhancer-photo-worker.js',import.meta.url),{type:'module'});
      worker.onerror=e=>fail(ticket,`Processing failed: ${e.message||'worker error'}.`);
      worker.onmessageerror=()=>fail(ticket,'The processing response could not be read.');
      worker.onmessage=async({data})=>{
        if(ticket!==job)return;
        if(data.error){fail(ticket,data.error,data.code);return;}
        if(data.progress){status(data.progress);armTimeout(ticket);return;}
        if(!data.blob)return;
        stop();busy=true;controls();armTimeout(ticket);status('Checking the exported image…');
        try {
          if(!Number.isSafeInteger(data.width)||!Number.isSafeInteger(data.height)||data.width<1||data.height<1)throw new Error('Invalid output dimensions.');
          if(!reduced&&expectedNative&&(data.width!==expectedNative.width||data.height!==expectedNative.height))throw new Error('Original output dimensions changed.');
          if(reduced&&data.width*data.height>maxPixels)throw new Error('Reduced output exceeded the selected size.');
          await validatePngEnvelope(data.blob,data.width,data.height);
          if(!(data.originalPreview instanceof Blob)||!data.originalPreview.size||!(data.resultPreview instanceof Blob)||!data.resultPreview.size)throw new Error('Preview creation failed.');
          if(ticket!==job)return;
          $('original').src=url(data.originalPreview);$('result').src=url(data.resultPreview);$('compare').style.aspectRatio=`${data.width}/${data.height}`;
          $('download').href=url(data.blob);$('download').download=`AllToolForest-enhanced${reduced?'-smaller':''}.png`;$('download').hidden=false;$('review').hidden=false;
          $('fileInfo').textContent=`${file.name} · output ${data.width} × ${data.height} · ${(data.width*data.height/1e6).toFixed(2)} MP${reduced?' · smaller copy':''}${data.previewUsed?' · camera JPEG preview':''}`;
          stop();status(reduced?'Your smaller enhanced copy is ready. The original file is unchanged.':'Your enhanced photo is ready at original resolution.');
        }catch(e){fail(ticket,`Output check failed: ${e.message}`);}
      };
      armTimeout(ticket);worker.postMessage({file:bitmap?null:file,bitmap,decodeOptions:{reduced,maxPixels,meta,allowPreview:reduced&&previewConsent},options},bitmap?[bitmap]:[]);bitmap=null;
    }catch(e){bitmap?.close();fail(ticket,e.message,e.code);}
  }
  window.addEventListener('pagehide',()=>{job++;stop();clearResult();$('recovery').hidden=true;status('Choose Enhance original to start again.');});
  controls();
}
const FORMATS='JPEG, PNG, WebP, AVIF, BMP, GIF (first frame), HEIC/HEIF and TIFF. Camera RAW: embedded JPEG previews where available.';
const TEMPLATE=`<p class="privacy-note">Your photo stays on your device. Original-size processing is attempted first. Smaller output requires your consent.</p>
<label class="upload" for="file">Choose a photo<input id="file" type="file" accept="image/*,.heic,.heif,.tif,.tiff,.dng,.cr2,.nef,.arw,.raw"></label>
<p id="fileInfo">${FORMATS}</p>
<div class="actions"><button id="run" class="primary" disabled>Enhance original</button><button id="cancel" disabled>Cancel</button></div>
<p id="status" role="status" aria-live="polite">Choose a photo to begin.</p>
<section id="recovery" hidden aria-label="Choose a recovery option"><p id="recoveryText"></p><div class="actions"><button id="smaller">Enhance a smaller copy</button><button id="cameraPreview" hidden>Use the camera JPEG preview</button></div></section>
<section id="review" hidden><div class="reviewTitle"><h2>Compare your photo</h2><a id="download" class="button primary" hidden>Download enhanced PNG</a></div>
<div id="compare"><img id="result" alt="Enhanced photo preview"><img id="original" alt="Original photo preview"><span class="leftTag">Original</span><span class="rightTag">Enhanced</span></div>
<label for="split">Slide to compare<input id="split" type="range" min="0" max="100" value="50"></label><p>The preview is scaled for your screen. Download dimensions are shown above.</p></section>
<details class="other-tasks"><summary>Other image tasks</summary><p><a href="?task=upscale">Upscale resolution</a> · <a href="?task=deblur">Deblur a photo</a></p></details>`;
