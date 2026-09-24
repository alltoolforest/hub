const MIN_SIZE=6;
const MAX_SIZE=72;
const QUICK_STEP=0.5;

function clampSize(value){
  const n=Number(value);
  if(!Number.isFinite(n))return 12;
  return Math.max(MIN_SIZE,Math.min(MAX_SIZE,n));
}

function tidySize(value){
  return Math.round(clampSize(value)*100)/100;
}

function formatSize(value){
  const n=tidySize(value);
  return Number.isInteger(n)?String(n):String(n).replace(/0+$/,'').replace(/\.$/,'');
}

function isEditableBlock(block){
  return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';
}

function ensureSelectOption(select,value){
  const text=formatSize(value);
  let option=[...select.options].find(o=>Math.abs(Number(o.value)-Number(text))<0.0001);
  if(!option){
    option=new Option(`${text} pt`,text);
    option.dataset.precisionSize='true';
    select.append(option);
  }
  return text;
}

function blockForExistingHit(target,state){
  const layer=target.closest('.pdf-hit-layer');
  if(!layer||!state?.analysis?.blocks)return null;
  const hits=[...layer.querySelectorAll('.pdf-hit-direct_edit,.pdf-hit-font_substitution')];
  const wanted=hits.indexOf(target);
  if(wanted<0)return null;
  let cursor=0;
  for(const block of state.analysis.blocks){
    if(!isEditableBlock(block))continue;
    const lines=block.lines?.length?block.lines:[null];
    for(const line of lines){
      if(cursor===wanted)return {block,line};
      cursor++;
    }
  }
  return null;
}

function sizeForTarget(target,editor){
  const state=editor?.getState?.();
  if(!state)return null;

  if(target.classList.contains('pdf-hit-inserted')){
    const layer=target.closest('.pdf-hit-layer');
    const hits=layer?[...layer.querySelectorAll('.pdf-hit-inserted')]:[];
    const index=hits.indexOf(target);
    if(index<0)return null;
    const inserted=(state.transactions||[]).filter(tx=>tx.kind==='INSERT_TEXT'&&tx.pageIndex===state.pageIndex);
    const tx=inserted[index];
    return tx?.fontSize?tidySize(tx.fontSize):null;
  }

  const match=blockForExistingHit(target,state);
  if(!match)return null;
  const tx=(state.transactions||[]).find(item=>item.kind==='REPLACE_TEXT'&&item.blockId===match.block.id);
  if(tx?.fontSize)return tidySize(tx.fontSize);
  const detected=match.line?.fontSize??match.block?.fontSize;
  return Number.isFinite(Number(detected))?tidySize(detected):null;
}

export function attachPrecisionFontSize({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false;
  let precisionInput=null;
  let nativeSelect=null;

  function syncNative(value,{dispatch=true}={}){
    if(!nativeSelect)return;
    const exact=tidySize(value);
    nativeSelect.value=ensureSelectOption(nativeSelect,exact);
    if(precisionInput&&document.activeElement!==precisionInput)precisionInput.value=formatSize(exact);
    if(dispatch)nativeSelect.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function applyInputValue({normalize=false}={}){
    if(!precisionInput)return;
    const raw=precisionInput.value;
    if(raw===''||raw==='-'||raw==='.')return;
    const n=Number(raw);
    if(!Number.isFinite(n))return;
    const exact=tidySize(n);
    if(normalize)precisionInput.value=formatSize(exact);
    syncNative(exact);
  }

  function nudge(delta){
    if(!precisionInput)return;
    const base=Number(precisionInput.value)||Number(nativeSelect?.value)||12;
    const next=tidySize(base+delta);
    precisionInput.value=formatSize(next);
    syncNative(next);
    precisionInput.focus({preventScroll:true});
    try{precisionInput.select();}catch{}
  }

  function ensureControls(){
    if(destroyed)return;
    const tools=app.querySelector('.pdf-format-tools');
    const select=tools?.querySelector('.pdf-size-select');
    if(!tools||!select)return;
    nativeSelect=select;
    if(tools.querySelector('.pdf-precision-size')){
      precisionInput=tools.querySelector('.pdf-precision-size-input');
      return;
    }

    select.classList.add('pdf-size-select-native');
    select.setAttribute('aria-hidden','true');
    select.tabIndex=-1;

    const wrap=document.createElement('div');
    wrap.className='pdf-precision-size';
    wrap.setAttribute('role','group');
    wrap.setAttribute('aria-label','Font size');

    const minus=document.createElement('button');
    minus.type='button';
    minus.className='pdf-size-step';
    minus.textContent='−';
    minus.setAttribute('aria-label','Decrease font size by 0.5 point');

    const input=document.createElement('input');
    input.type='number';
    input.className='pdf-precision-size-input';
    input.min=String(MIN_SIZE);
    input.max=String(MAX_SIZE);
    input.step='0.1';
    input.inputMode='decimal';
    input.setAttribute('aria-label','Font size in points');
    input.value=formatSize(Number(select.value)||12);

    const unit=document.createElement('span');
    unit.className='pdf-size-unit';
    unit.textContent='pt';
    unit.setAttribute('aria-hidden','true');

    const plus=document.createElement('button');
    plus.type='button';
    plus.className='pdf-size-step';
    plus.textContent='+';
    plus.setAttribute('aria-label','Increase font size by 0.5 point');

    minus.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();nudge(-QUICK_STEP);});
    plus.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();nudge(QUICK_STEP);});
    input.addEventListener('input',()=>applyInputValue());
    input.addEventListener('change',()=>applyInputValue({normalize:true}));
    input.addEventListener('blur',()=>applyInputValue({normalize:true}));
    input.addEventListener('keydown',event=>{
      if(event.key==='ArrowUp'){event.preventDefault();nudge(0.1);}
      else if(event.key==='ArrowDown'){event.preventDefault();nudge(-0.1);}
    });

    wrap.append(minus,input,unit,plus);
    select.insertAdjacentElement('afterend',wrap);
    precisionInput=input;
  }

  function restoreExactSize(target){
    const editor=getEditor?.();
    if(!editor)return;
    const exact=sizeForTarget(target,editor);
    if(exact==null)return;
    queueMicrotask(()=>{
      if(destroyed)return;
      ensureControls();
      if(!precisionInput||!nativeSelect)return;
      precisionInput.value=formatSize(exact);
      syncNative(exact);
    });
  }

  function onPointerCapture(event){
    const target=event.target?.closest?.('.pdf-hit-direct_edit,.pdf-hit-font_substitution,.pdf-hit-inserted');
    if(target&&app.contains(target))restoreExactSize(target);
  }

  const observer=new MutationObserver(()=>ensureControls());
  observer.observe(app,{childList:true,subtree:true});
  app.addEventListener('click',onPointerCapture,true);
  app.addEventListener('pointerup',onPointerCapture,true);
  ensureControls();

  return {
    destroy(){
      destroyed=true;
      observer.disconnect();
      app.removeEventListener('click',onPointerCapture,true);
      app.removeEventListener('pointerup',onPointerCapture,true);
    }
  };
}
