const PAGE_LAYER='.pdf-hit-layer';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function activeLayer(app,event){
  const direct=event?.target?.closest?.(PAGE_LAYER);
  if(direct&&app.contains(direct))return direct;
  const hit=event?.target?.closest?.('.pdf-hit');
  const fromHit=hit?.closest?.(PAGE_LAYER);
  if(fromHit&&app.contains(fromHit))return fromHit;
  return app.querySelector(PAGE_LAYER);
}

function isMultilineExistingEdit(app,event){
  if(!event?.target?.closest?.('.pdf-done'))return false;
  const input=app.querySelector('textarea[data-role="pdf-inline-editor"]');
  return !!input&&String(input.value||'').includes('\n');
}

function restoreVisualEditor(layer,originalHeight,originalStyleHeight){
  layer.style.height=originalStyleHeight;

  const input=layer.querySelector('textarea[data-role="pdf-new-text-editor"]');
  if(!input)return;

  const currentTop=Number.parseFloat(input.style.top)||input.offsetTop||0;
  const maxVisualTop=Math.max(4,originalHeight-96);
  const visualTop=clamp(currentTop,4,maxVisualTop);
  if(Math.abs(visualTop-currentTop)>.5)input.style.top=`${visualTop}px`;

  const actions=layer.querySelector('.pdf-insert-actions');
  if(actions){
    const h=Math.max(80,input.offsetHeight||112);
    const actionTop=Math.min(Math.max(4,originalHeight-48),visualTop+h+6);
    actions.style.top=`${Math.max(4,actionTop)}px`;
  }
}

/**
 * Near the bottom of a PDF page, main.js keeps the Add Text textarea visible by
 * clamping its CSS top position to pageHeight - 96. The same clamped value is
 * currently reused as the PDF insertion anchor. That makes text intended for a
 * lower line jump upward.
 *
 * This bridge temporarily increases only the hit-layer layout height while the
 * click anchor is captured. The PDF engine therefore receives the real click
 * position. On the next task the layer height is restored and only the textarea
 * UI is moved upward for visibility. PDF coordinates and editor UI coordinates
 * are thereby decoupled without changing the text engine or reflow engine.
 */
export function attachInsertAnchorBridge({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false;
  let active=null;
  let timer=null;

  function prime(event){
    if(destroyed||active)return;
    const state=getEditor?.()?.getState?.();
    const isAddClick=!!state?.addTextMode&&!!event?.target?.closest?.(`${PAGE_LAYER},.pdf-hit`);
    const isMultilineDone=isMultilineExistingEdit(app,event);
    if(!isAddClick&&!isMultilineDone)return;

    const layer=activeLayer(app,event);
    if(!layer)return;
    const originalHeight=Math.max(1,layer.clientHeight||Number.parseFloat(layer.style.height)||1);
    const originalStyleHeight=layer.style.height;
    const expansion=Math.max(180,Math.min(320,originalHeight*.28));
    layer.style.height=`${originalHeight+expansion}px`;
    active={layer,originalHeight,originalStyleHeight};

    timer=setTimeout(()=>{
      const current=active;
      active=null;
      timer=null;
      if(!current||destroyed)return;
      restoreVisualEditor(current.layer,current.originalHeight,current.originalStyleHeight);
    },0);
  }

  app.addEventListener('click',prime,true);

  return {
    destroy(){
      destroyed=true;
      app.removeEventListener('click',prime,true);
      if(timer){clearTimeout(timer);timer=null;}
      if(active){
        active.layer.style.height=active.originalStyleHeight;
        active=null;
      }
    }
  };
}
