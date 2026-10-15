const $=id=>document.getElementById(id);
let file=null,worker=null,originalURL=null,resultURL=null,timer=null,job=0,busy=false;
const status=text=>{$('status').textContent=text;};
function controls(){for(const id of['file','engine','strength','sharpness','content','local'])$(id).disabled=busy;$('run').disabled=busy||!file;$('cancel').disabled=!busy;}
function stop(){clearTimeout(timer);timer=null;if(worker){worker.terminate();worker=null;}busy=false;controls();}
function clearResult(){if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('download').hidden=true;$('download').removeAttribute('href');$('result').removeAttribute('src');$('diagnostics').textContent='';}
$('split').addEventListener('input',()=>{$('original').style.clipPath=`inset(0 ${100-Number($('split').value)}% 0 0)`;});
$('file').addEventListener('change',()=>{job++;stop();clearResult();if(originalURL)URL.revokeObjectURL(originalURL);originalURL=null;file=$('file').files[0]||null;if(file&&file.size>50*1024*1024){file=null;status('This test accepts files up to 50 MB.');}else status(file?'Ready. Select settings, then enhance.':'Choose a photo to begin.');$('review').hidden=true;$('fileInfo').textContent=file?`${file.name} · ${(file.size/1048576).toFixed(2)} MB`:'JPEG, PNG or WebP · native resolution · up to 12 megapixels in this test';controls();});
$('cancel').addEventListener('click',()=>{job++;stop();status('Cancelled. Your original photo is unchanged.');});
$('run').addEventListener('click',async()=>{
 if(!file||busy)return;const ticket=++job;busy=true;controls();clearResult();status('Decoding your photograph…');let bitmap;
 try{
  if(!window.Worker||!window.OffscreenCanvas||!window.createImageBitmap)throw new Error('This test requires a browser with image workers and OffscreenCanvas. Try current Chrome on Android or a supported current Safari.');
  bitmap=await createImageBitmap(file);if(ticket!==job){bitmap.close();return;}
  const {width,height}=bitmap;if(width*height>12000000)throw new Error('This experimental page is limited to 12 megapixels. Choose a smaller image for this test.');
  if(!originalURL)originalURL=URL.createObjectURL(file);$('original').src=originalURL;$('compare').style.aspectRatio=`${width}/${height}`;$('review').hidden=false;
  $('fileInfo').textContent=`${file.name} · ${width} × ${height} · ${(width*height/1e6).toFixed(2)} MP`;
  const portrait=$('content').value==='portrait';
  const options={strength:$('strength').value,sharpness:$('sharpness').value,content:$('content').value,sourceMime:file.type,faceProtection:portrait?'strict':'standard',faces:portrait?[{x:0,y:0,width,height}]:[],...($('local').value==='off'?{localExposure:'off'}:{})};
  const engine=$('engine').value;
  worker=new Worker(new URL(engine==='original'?'./original/image-enhancer-photo-worker.js':engine==='safety'?'./safety/image-enhancer-photo-worker.js':'./image-enhancer-photo-worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>{if(ticket!==job)return;job++;stop();status(`Processing failed: ${e.message||'worker error'}. No output exported.`);};
  worker.onmessage=async({data})=>{
   if(ticket!==job)return;if(data.error){job++;stop();status(`Processing failed: ${data.error}. No output exported.`);return;}
   if(data.progress){status(data.progress);return;}if(!data.blob)return;
   stop();busy=true;controls();status('Checking native-size output…');let check;
   try{if(!(data.blob instanceof Blob)||!data.blob.size||data.width!==width||data.height!==height)throw new Error('Invalid output metadata');check=await createImageBitmap(data.blob);if(check.width!==width||check.height!==height)throw new Error('Output dimensions changed');check.close();check=null;if(ticket!==job)return;
    resultURL=URL.createObjectURL(data.blob);$('result').src=resultURL;$('download').href=resultURL;$('download').download=`AllToolForest-V2-${engine}.png`;$('download').hidden=false;$('diagnostics').textContent=JSON.stringify({build:'archive-v2-20261014-test3',engine,width,height,options,...data.diagnostics},null,2);busy=false;controls();status('Complete. Compare and download the native-size PNG.');
   }catch(e){if(check)check.close();if(ticket!==job)return;busy=false;controls();status(`Output check failed: ${e.message}. No output exported.`);}
  };
  timer=setTimeout(()=>{if(ticket!==job)return;job++;stop();status('Processing exceeded the two-minute test limit. Try a smaller image or gentler settings.');},120000);
  worker.postMessage({bitmap,options},[bitmap]);bitmap=null;
 }catch(e){if(bitmap)bitmap.close();if(ticket!==job)return;stop();status(e.message);}
});
window.addEventListener('pagehide',()=>{job++;stop();if(originalURL)URL.revokeObjectURL(originalURL);if(resultURL)URL.revokeObjectURL(resultURL);});
