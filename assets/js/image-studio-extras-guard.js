import {load} from './core.js';

const root=document.querySelector('#workspace');
if(root) protectExtras(root);

function protectExtras(root){
  let sourceFile=null,previewBase=null;
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const mobileLike=()=>/iP(?:hone|ad|od)/.test(navigator.userAgent||'')||(/Macintosh/.test(navigator.userAgent||'')&&navigator.maxTouchPoints>1)||matchMedia('(max-width:700px)').matches||matchMedia('(pointer:coarse)').matches;
  const status=(text,error=false)=>{const n=root.querySelector('#status');if(n){n.textContent=text;n.classList.toggle('error',error)}};
  const buttonByText=text=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  const sourceDimensions=()=>{for(const item of root.querySelectorAll('.result-item')){const label=item.querySelector('small')?.textContent?.trim();if(label==='Dimensions'){const m=item.querySelector('strong')?.textContent?.match(/([\d,]+)\s*[×x]\s*([\d,]+)/);if(m)return [Number(m[1].replace(/,/g,'')),Number(m[2].replace(/,/g,''))]}}return null};
  const blurSupported=()=>{try{const c=document.createElement('canvas'),ctx=c.getContext('2d');if(!ctx||!('filter' in ctx))return false;const old=ctx.filter;ctx.filter='blur(2px)';const ok=String(ctx.filter).includes('blur');ctx.filter=old;return ok}catch{return false}};
  const supportsType=type=>{if(type==='image/png'||type==='image/jpeg')return true;const c=document.createElement('canvas');c.width=c.height=1;try{return c.toDataURL(type).startsWith(`data:${type}`)}catch{return false}};
  const extension=name=>String(name||'').split('.').pop().toLowerCase();
  const baseName=name=>String(name||'image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'')||'image';
  const canvasBlob=(c,type,quality)=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Image export failed. Reduce the image size and try again.')),type,quality));
  const downloadBlob=(blob,name)=>{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};

  const mode=root.querySelector('#extra-redact-mode'),intensity=root.querySelector('#extra-redact-intensity'),blurOption=mode?[...mode.options].find(o=>o.value==='blur'):null;
  if(blurOption&&!blurSupported()){blurOption.disabled=true;blurOption.textContent='Blur · not supported in this browser';if(mode.value==='blur')mode.value='pixelate'}

  const fileInput=root.querySelector('#file-input');
  fileInput?.addEventListener('change',()=>{const f=fileInput.files?.[0];if(f){sourceFile=f;previewBase=null}},true);
  fileInput?.closest('.dropzone')?.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f){sourceFile=f;previewBase=null}},true);

  async function decodeFile(file){const x=extension(file.name);let blob=file;if(x==='heic'||x==='heif'){const decoder=await load('heic');blob=await decoder({blob:file,toType:'image/png'});if(Array.isArray(blob))blob=blob[0]}
    if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob)}catch{}}
    const u=URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error(`Could not decode this ${x.toUpperCase()} image in this browser.`));im.src=u})}finally{URL.revokeObjectURL(u)}
  }

  const redactCanvas=[...root.querySelectorAll('canvas')].find(c=>c.getAttribute('aria-label')?.startsWith('Redaction preview'))||null;
  const redactWrap=redactCanvas?.closest('.studio-analysis-wrap')||null;
  const selection=redactWrap?.querySelector('.studio-selection')||null;

  function currentSelection(){if(!redactCanvas||!redactWrap||!selection||selection.hidden)return null;const cr=redactCanvas.getBoundingClientRect(),wr=redactWrap.getBoundingClientRect();if(!cr.width||!cr.height)return null;const left=parseFloat(selection.style.left||'0')-(cr.left-wr.left),top=parseFloat(selection.style.top||'0')-(cr.top-wr.top),width=parseFloat(selection.style.width||'0'),height=parseFloat(selection.style.height||'0');const x=clamp(left/cr.width,0,1),y=clamp(top/cr.height,0,1),w=clamp(width/cr.width,.0001,1-x),h=clamp(height/cr.height,.0001,1-y);return {x,y,w,h}}

  function sampleRegion(ctx,x,y,w,h){const values=[];for(let gy=0;gy<9;gy++)for(let gx=0;gx<9;gx++){const px=clamp(Math.floor(x+(gx+.5)*w/9),0,ctx.canvas.width-1),py=clamp(Math.floor(y+(gy+.5)*h/9),0,ctx.canvas.height-1),d=ctx.getImageData(px,py,1,1).data;values.push(d[0],d[1],d[2],d[3])}return values}
  function changed(before,after){if(before.length!==after.length)return false;let count=0,total=0;for(let i=0;i<before.length;i+=4){const delta=Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])+Math.abs(before[i+3]-after[i+3]);if(delta>3)count++;total+=delta}return count>=2&&total>=12}

  function applyPixelate(ctx,c,x,y,w,h,strength){const block=Math.max(2,Math.round(strength)),tw=Math.max(1,Math.ceil(w/block)),th=Math.max(1,Math.ceil(h/block)),tmp=document.createElement('canvas');tmp.width=tw;tmp.height=th;tmp.getContext('2d').drawImage(c,x,y,w,h,0,0,tw,th);ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(tmp,0,0,tw,th,x,y,w,h);ctx.restore();tmp.width=tmp.height=0}
  function applyTrueBlur(ctx,c,x,y,w,h,strength){if(!blurSupported())throw new Error('Blur is not supported by this browser. Choose Pixelate instead.');const radius=Math.max(1,Math.round(strength)),pad=Math.ceil(radius*2),sx=Math.max(0,x-pad),sy=Math.max(0,y-pad),ex=Math.min(c.width,x+w+pad),ey=Math.min(c.height,y+h+pad),sw=Math.max(1,ex-sx),sh=Math.max(1,ey-sy),src=document.createElement('canvas'),blurred=document.createElement('canvas');src.width=blurred.width=sw;src.height=blurred.height=sh;src.getContext('2d').drawImage(c,sx,sy,sw,sh,0,0,sw,sh);const bctx=blurred.getContext('2d');bctx.filter=`blur(${radius}px)`;bctx.drawImage(src,0,0);bctx.filter='none';ctx.drawImage(blurred,x-sx,y-sy,w,h,x,y,w,h);src.width=src.height=blurred.width=blurred.height=0}

  function capturePreviewBase(){if(!redactCanvas||!redactCanvas.width||!redactCanvas.height)return;previewBase=document.createElement('canvas');previewBase.width=redactCanvas.width;previewBase.height=redactCanvas.height;previewBase.getContext('2d').drawImage(redactCanvas,0,0)}
  function restorePreviewBase(){if(!redactCanvas||!previewBase||previewBase.width!==redactCanvas.width||previewBase.height!==redactCanvas.height)return false;const ctx=redactCanvas.getContext('2d');ctx.clearRect(0,0,redactCanvas.width,redactCanvas.height);ctx.drawImage(previewBase,0,0);return true}
  function renderLivePreview(){
    const r=currentSelection();if(!r||!redactCanvas||redactWrap?.hidden)return;
    if(!previewBase)capturePreviewBase();
    if(!restorePreviewBase())return;
    const ctx=redactCanvas.getContext('2d'),x=clamp(Math.floor(r.x*redactCanvas.width),0,redactCanvas.width-1),y=clamp(Math.floor(r.y*redactCanvas.height),0,redactCanvas.height-1),w=Math.max(1,Math.min(redactCanvas.width-x,Math.ceil(r.w*redactCanvas.width))),h=Math.max(1,Math.min(redactCanvas.height-y,Math.ceil(r.h*redactCanvas.height))),strength=Number(intensity?.value)||12;
    try{if(mode?.value==='blur')applyTrueBlur(ctx,redactCanvas,x,y,w,h,strength);else applyPixelate(ctx,redactCanvas,x,y,w,h,strength);status(`Live ${mode?.value==='blur'?'blur':'pixelate'} preview updated. Download to permanently apply it.`)}catch(err){restorePreviewBase();status(err?.message||String(err),true)}
  }
  function clearLivePreview(){restorePreviewBase();previewBase=null}

  const chooseArea=buttonByText('Choose area'),clearSelection=buttonByText('Clear selection');
  chooseArea?.addEventListener('click',()=>{previewBase=null},true);
  clearSelection?.addEventListener('click',()=>{clearLivePreview()},true);
  redactCanvas?.addEventListener('pointerdown',()=>{if(previewBase)restorePreviewBase()},true);
  redactCanvas?.addEventListener('pointerup',()=>setTimeout(renderLivePreview,0));
  mode?.addEventListener('change',renderLivePreview);
  intensity?.addEventListener('input',renderLivePreview);

  const originalDownload=buttonByText('Download redacted image');
  if(originalDownload){const redactionDownload=originalDownload.cloneNode(true);originalDownload.replaceWith(redactionDownload);redactionDownload.addEventListener('click',async e=>{e.preventDefault();if(redactionDownload.disabled)return;redactionDownload.disabled=true;try{if(!sourceFile)throw new Error('Open an image first.');const r=currentSelection();if(!r)throw new Error('Choose a redaction area first.');const limit=mobileLike()?8e6:24e6,dims=sourceDimensions();if(dims&&dims[0]*dims[1]>limit)throw new Error(`For reliable redaction on this device, first create and reopen an image below ${limit/1e6} million pixels. The main editor can safely reduce large dimensions.`);status('Applying permanent redaction…');const im=await decodeFile(sourceFile);if(im.width*im.height>limit){im.close?.();throw new Error(`For reliable redaction on this device, first create and reopen an image below ${limit/1e6} million pixels.`)}const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,c.width,c.height);im.close?.();const x=clamp(Math.floor(r.x*c.width),0,c.width-1),y=clamp(Math.floor(r.y*c.height),0,c.height-1),w=Math.max(1,Math.min(c.width-x,Math.ceil(r.w*c.width))),h=Math.max(1,Math.min(c.height-y,Math.ceil(r.h*c.height))),strength=Number(intensity?.value)||12,before=sampleRegion(ctx,x,y,w,h);if(mode?.value==='blur')applyTrueBlur(ctx,c,x,y,w,h,strength);else applyPixelate(ctx,c,x,y,w,h,strength);const after=sampleRegion(ctx,x,y,w,h);if(!changed(before,after)){c.width=c.height=0;throw new Error('No pixel change could be verified in the selected area. Choose a different area or increase the intensity.')}const xExt=extension(sourceFile.name),type=xExt==='png'?'image/png':(xExt==='webp'&&supportsType('image/webp')?'image/webp':'image/jpeg'),blob=await canvasBlob(c,type,.92),actual=blob.type||type;if(actual!==type){c.width=c.height=0;throw new Error(`This browser returned ${actual||'an unknown format'} instead of ${type}. Try PNG or JPG.`)}downloadBlob(blob,`${baseName(sourceFile.name)}-redacted.${type==='image/png'?'png':type==='image/webp'?'webp':'jpg'}`);c.width=c.height=0;status(`${mode?.value==='blur'?'Blur':'Pixelation'} applied and pixel change verified. Redacted image ready.`)}catch(err){console.error(err);status(err?.message||String(err),true)}finally{redactionDownload.disabled=false}})}

  const reset=buttonByText('Reset image');
  reset?.addEventListener('click',()=>{
    previewBase=null;
    buttonByText('Clear selection')?.click();
    if(mode)mode.value='pixelate';
    if(intensity)intensity.value='12';
    const circleSize=root.querySelector('#extra-circle-size');if(circleSize)circleSize.value='800';
    const circleFormat=root.querySelector('#extra-circle-format');if(circleFormat)circleFormat.value='image/png';
    for(const d of root.querySelectorAll('.studio-extra-section'))d.open=false;
    for(const wrap of root.querySelectorAll('.studio-analysis-wrap'))wrap.hidden=true;
    root.querySelector('.studio-swatches')?.replaceChildren();
    root.querySelector('.studio-meta')?.replaceChildren();
  });
}
