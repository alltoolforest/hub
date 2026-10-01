const workspace=document.querySelector('#workspace');
if(workspace) enhanceCropUI(workspace);

function enhanceCropUI(root){
  const $=s=>root.querySelector(s);
  const preview=$('.canvas-frame canvas');
  const frame=$('.canvas-frame');
  const cropX=$('#crop-x'),cropY=$('#crop-y'),cropW=$('#crop-w'),cropH=$('#crop-h'),ratio=$('#crop-ratio');
  if(!preview||!frame||!cropX||!cropY||!cropW||!cropH)return;

  const oldCropButton=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()==='Select visual crop');
  if(!oldCropButton)return;
  const cropButton=oldCropButton.cloneNode(true);
  cropButton.textContent='Crop image';
  oldCropButton.replaceWith(cropButton);

  const style=document.createElement('style');
  style.textContent=`
    .studio-crop-overlay{position:absolute;z-index:6;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(9,27,21,.58),0 0 0 1px #145940;cursor:move;touch-action:none;min-width:24px;min-height:24px}
    .studio-crop-overlay[hidden]{display:none!important}
    .studio-crop-grid{position:absolute;inset:0;pointer-events:none;background:linear-gradient(to right,transparent 33.1%,rgba(255,255,255,.7) 33.2%,rgba(255,255,255,.7) 33.6%,transparent 33.7%,transparent 66.3%,rgba(255,255,255,.7) 66.4%,rgba(255,255,255,.7) 66.8%,transparent 66.9%),linear-gradient(to bottom,transparent 33.1%,rgba(255,255,255,.7) 33.2%,rgba(255,255,255,.7) 33.6%,transparent 33.7%,transparent 66.3%,rgba(255,255,255,.7) 66.4%,rgba(255,255,255,.7) 66.8%,transparent 66.9%)}
    .studio-crop-handle{position:absolute;width:24px;height:24px;touch-action:none}
    .studio-crop-handle::after{content:"";position:absolute;width:10px;height:10px;background:#fff;border:2px solid #145940;border-radius:2px;left:7px;top:7px;box-sizing:border-box}
    .studio-crop-handle[data-handle="nw"]{left:-12px;top:-12px;cursor:nwse-resize}.studio-crop-handle[data-handle="n"]{left:50%;top:-12px;transform:translateX(-50%);cursor:ns-resize}.studio-crop-handle[data-handle="ne"]{right:-12px;top:-12px;cursor:nesw-resize}
    .studio-crop-handle[data-handle="e"]{right:-12px;top:50%;transform:translateY(-50%);cursor:ew-resize}.studio-crop-handle[data-handle="se"]{right:-12px;bottom:-12px;cursor:nwse-resize}.studio-crop-handle[data-handle="s"]{left:50%;bottom:-12px;transform:translateX(-50%);cursor:ns-resize}
    .studio-crop-handle[data-handle="sw"]{left:-12px;bottom:-12px;cursor:nesw-resize}.studio-crop-handle[data-handle="w"]{left:-12px;top:50%;transform:translateY(-50%);cursor:ew-resize}
    .studio-crop-controls{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 4px}.studio-crop-controls[hidden]{display:none!important}
    .studio-crop-help{font-size:13px;color:var(--muted);margin:8px 0 0}.studio-crop-help[hidden]{display:none!important}
    @media(max-width:700px){.studio-crop-handle{width:32px;height:32px}.studio-crop-handle::after{width:12px;height:12px;left:10px;top:10px}.studio-crop-handle[data-handle="nw"]{left:-16px;top:-16px}.studio-crop-handle[data-handle="n"]{top:-16px}.studio-crop-handle[data-handle="ne"]{right:-16px;top:-16px}.studio-crop-handle[data-handle="e"]{right:-16px}.studio-crop-handle[data-handle="se"]{right:-16px;bottom:-16px}.studio-crop-handle[data-handle="s"]{bottom:-16px}.studio-crop-handle[data-handle="sw"]{left:-16px;bottom:-16px}.studio-crop-handle[data-handle="w"]{left:-16px}}
  `;
  document.head.append(style);

  const overlay=document.createElement('div');
  overlay.className='studio-crop-overlay';
  overlay.hidden=true;
  overlay.setAttribute('aria-label','Crop selection. Drag to move; drag handles to resize.');
  overlay.append(Object.assign(document.createElement('div'),{className:'studio-crop-grid'}));
  for(const h of ['nw','n','ne','e','se','s','sw','w']){
    const handle=document.createElement('span');
    handle.className='studio-crop-handle';
    handle.dataset.handle=h;
    handle.setAttribute('aria-hidden','true');
    overlay.append(handle);
  }
  frame.append(overlay);

  const controls=document.createElement('div');
  controls.className='studio-crop-controls';
  controls.hidden=true;
  const apply=document.createElement('button');apply.type='button';apply.className='primary';apply.textContent='Apply crop';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel crop';
  const reset=document.createElement('button');reset.type='button';reset.textContent='Reset crop box';
  controls.append(apply,cancel,reset);
  frame.after(controls);
  const help=document.createElement('p');help.className='studio-crop-help';help.hidden=true;help.textContent='Drag inside the box to move it. Drag any edge or corner to resize. Choose an aspect ratio above to constrain the crop.';
  controls.after(help);

  let active=false;
  let box={x:0,y:0,w:1,h:1};
  let initial={...box};
  let gesture=null;
  let resizeObserver=null;
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  const numeric=(el,fallback)=>{const v=Number(el.value);return Number.isFinite(v)?v:fallback};
  const currentFields=()=>({x:clamp(numeric(cropX,0)/100,0,1),y:clamp(numeric(cropY,0)/100,0,1),w:clamp(numeric(cropW,100)/100,.001,1),h:clamp(numeric(cropH,100)/100,.001,1)});
  const currentRatio=()=>{if(!ratio||ratio.value==='free')return null;const p=ratio.value.split(':').map(Number);if(p.length!==2||!p[0]||!p[1])return null;const rotation=Number($('#rotation')?.value||0);const r=p[0]/p[1];return rotation%180?1/r:r};
  function canvasRect(){return preview.getBoundingClientRect()}
  function frameRect(){return frame.getBoundingClientRect()}
  function minNorm(){const r=canvasRect();return {x:Math.min(.2,Math.max(.01,28/Math.max(r.width,1))),y:Math.min(.2,Math.max(.01,28/Math.max(r.height,1)))}}
  function sanitize(b){const m=minNorm();let w=clamp(b.w,m.x,1),h=clamp(b.h,m.y,1),x=clamp(b.x,0,1-w),y=clamp(b.y,0,1-h);return {x,y,w,h}}
  function render(){if(!active)return;box=sanitize(box);const c=canvasRect(),f=frameRect();overlay.style.left=`${c.left-f.left+box.x*c.width}px`;overlay.style.top=`${c.top-f.top+box.y*c.height}px`;overlay.style.width=`${box.w*c.width}px`;overlay.style.height=`${box.h*c.height}px`}
  function centeredBox(r,base=currentFields()){const full=base.w>.999&&base.h>.999,area=full?{x:.07,y:.07,w:.86,h:.86}:sanitize(base);if(!r)return sanitize(area);let w=area.w,h=w/r;if(h>area.h){h=area.h;w=h*r}return sanitize({x:area.x+(area.w-w)/2,y:area.y+(area.h-h)/2,w,h})}
  function startCrop(){if(frame.hidden){root.querySelector('#status')?.replaceChildren(document.createTextNode('Open an image first.'));return}const r=currentRatio();initial=currentFields();box=centeredBox(r);active=true;overlay.hidden=false;controls.hidden=false;help.hidden=false;cropButton.textContent='Cropping…';cropButton.disabled=true;preview.style.touchAction='none';render();statusText('Move or resize the crop box, then choose Apply crop.')}
  function stopCrop(){active=false;gesture=null;overlay.hidden=true;controls.hidden=true;help.hidden=true;cropButton.textContent='Crop image';cropButton.disabled=false;preview.style.touchAction='auto'}
  function statusText(t,error=false){const s=root.querySelector('#status');if(s){s.textContent=t;s.classList.toggle('error',error)}}
  function commit(){box=sanitize(box);cropX.value=(box.x*100).toFixed(1);cropY.value=(box.y*100).toFixed(1);cropW.value=(box.w*100).toFixed(1);cropH.value=(box.h*100).toFixed(1);if(ratio)ratio.value='free';cropW.dispatchEvent(new Event('change',{bubbles:true}));stopCrop();statusText('Crop applied. The shaded preview shows the selected area. Create the image when ready.')}
  function cancelCrop(){box={...initial};stopCrop();statusText('Crop editing cancelled. Previous crop kept.')}
  function resetBox(){box=centeredBox(currentRatio());render();statusText('Crop box reset. Drag it to the area you want to keep.')}

  function pointerNorm(e){const r=canvasRect();return {x:clamp((e.clientX-r.left)/Math.max(r.width,1),0,1),y:clamp((e.clientY-r.top)/Math.max(r.height,1),0,1)}}
  function beginGesture(e,mode){if(!active)return;e.preventDefault();e.stopPropagation();const p=pointerNorm(e);gesture={mode,start:p,origin:{...box},ratio:currentRatio(),id:e.pointerId};overlay.setPointerCapture?.(e.pointerId)}
  function resizeFree(origin,p,mode){let left=origin.x,top=origin.y,right=origin.x+origin.w,bottom=origin.y+origin.h;const m=minNorm();if(mode.includes('w'))left=clamp(p.x,0,right-m.x);if(mode.includes('e'))right=clamp(p.x,left+m.x,1);if(mode.includes('n'))top=clamp(p.y,0,bottom-m.y);if(mode.includes('s'))bottom=clamp(p.y,top+m.y,1);return {x:left,y:top,w:right-left,h:bottom-top}}
  function resizeLocked(origin,p,mode,r){if(!r)return resizeFree(origin,p,mode);const hasX=/[we]/.test(mode),hasY=/[ns]/.test(mode);let anchorX=mode.includes('w')?origin.x+origin.w:mode.includes('e')?origin.x:origin.x+origin.w/2;let anchorY=mode.includes('n')?origin.y+origin.h:mode.includes('s')?origin.y:origin.y+origin.h/2;
    let w=hasX?Math.abs(p.x-anchorX):origin.w,h=hasY?Math.abs(p.y-anchorY):origin.h;
    if(hasX&&hasY){if(w/Math.max(h,.0001)>r)h=w/r;else w=h*r}else if(hasX)h=w/r;else if(hasY)w=h*r;
    const m=minNorm();w=Math.max(w,m.x);h=Math.max(h,m.y);if(w/h>r)w=h*r;else h=w/r;
    let x=mode.includes('w')?anchorX-w:mode.includes('e')?anchorX:anchorX-w/2;let y=mode.includes('n')?anchorY-h:mode.includes('s')?anchorY:anchorY-h/2;
    if(x<0){const d=-x;x=0;if(mode.includes('w'))w-=d}if(y<0){const d=-y;y=0;if(mode.includes('n'))h-=d}if(x+w>1)w=1-x;if(y+h>1)h=1-y;
    if(w/h>r)w=h*r;else h=w/r;
    if(mode.includes('w'))x=anchorX-w;else if(!mode.includes('e'))x=anchorX-w/2;if(mode.includes('n'))y=anchorY-h;else if(!mode.includes('s'))y=anchorY-h/2;
    return sanitize({x,y,w,h})}
  function moveGesture(e){if(!gesture||e.pointerId!==gesture.id)return;e.preventDefault();const p=pointerNorm(e),o=gesture.origin;if(gesture.mode==='move'){const dx=p.x-gesture.start.x,dy=p.y-gesture.start.y;box={x:clamp(o.x+dx,0,1-o.w),y:clamp(o.y+dy,0,1-o.h),w:o.w,h:o.h}}else box=resizeLocked(o,p,gesture.mode,gesture.ratio);render()}
  function endGesture(e){if(!gesture||e.pointerId!==gesture.id)return;gesture=null;try{overlay.releasePointerCapture?.(e.pointerId)}catch{}}

  cropButton.addEventListener('click',startCrop);
  overlay.addEventListener('pointerdown',e=>{const h=e.target.closest?.('.studio-crop-handle')?.dataset.handle;beginGesture(e,h||'move')});
  overlay.addEventListener('pointermove',moveGesture);overlay.addEventListener('pointerup',endGesture);overlay.addEventListener('pointercancel',endGesture);
  apply.addEventListener('click',commit);cancel.addEventListener('click',cancelCrop);reset.addEventListener('click',resetBox);
  ratio?.addEventListener('change',e=>{if(!active)return;e.stopImmediatePropagation();box=centeredBox(currentRatio(),box);render();statusText(ratio.value==='free'?'Free crop selected. Drag any edge or corner.':`${ratio.value} crop selected. Resize handles now keep that ratio.`)},true);
  root.addEventListener('click',e=>{if(!active)return;const b=e.target.closest?.('button');if(!b||controls.contains(b)||b===cropButton)return;if(['Create image','Reset image','Clear crop'].includes(b.textContent.trim())){e.preventDefault();e.stopImmediatePropagation();statusText('Apply or cancel the crop before using this action.',true)}},true);
  root.querySelector('#file-input')?.addEventListener('change',()=>{if(active)stopCrop()});
  window.addEventListener('resize',render,{passive:true});
  if('ResizeObserver' in window){resizeObserver=new ResizeObserver(render);resizeObserver.observe(preview)}
  window.addEventListener('pagehide',()=>resizeObserver?.disconnect(),{once:true});
}
