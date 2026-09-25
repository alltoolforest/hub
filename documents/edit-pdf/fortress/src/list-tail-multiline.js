const ORIGINAL_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';

function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function isEditableBlock(block){return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';}
function isListLike(text){return /^\s*(?:\d{1,3}[.)]|[-•▪◦])\s*\S/.test(String(text||''));}

function currentBlockText(block,state){
  const tx=(state?.transactions||[]).find(item=>item.kind==='REPLACE_TEXT'&&item.blockId===block.id);
  return tx?.displayUnicode??tx?.replacementUnicode??block?.text??'';
}

function blockForHit(hit,state,layer){
  const hits=[...layer.querySelectorAll(ORIGINAL_SELECTOR)];
  const wanted=hits.indexOf(hit);
  if(wanted<0)return null;
  let cursor=0;
  for(const block of state?.analysis?.blocks||[]){
    if(!isEditableBlock(block))continue;
    const lines=block.lines?.length?block.lines:[null];
    for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
      if(cursor===wanted)return {block,line:lines[lineIndex],lineIndex};
      cursor++;
    }
  }
  return null;
}

function sourceGeometry(block){
  const line=block?.lines?.[0];
  const size=Math.max(6,Number(line?.fontSize||block?.fontSize)||12);
  const x=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x||0);
  const y=Number.isFinite(Number(line?.y))?Number(line.y):Number(block?.bounds?.y||0)+size*.30;
  return {x,y,size};
}

function lastNonEmptyLine(text){
  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean);
  return lines.at(-1)||'';
}

function findInsertedListTail(block,state){
  const base=sourceGeometry(block);
  const candidates=[];
  for(let txIndex=0;txIndex<(state?.transactions||[]).length;txIndex++){
    const tx=state.transactions[txIndex];
    if(tx?.kind!=='INSERT_TEXT'||tx.pageIndex!==block.pageIndex)continue;
    const text=lastNonEmptyLine(tx.replacementUnicode);
    if(!isListLike(text))continue;
    const size=Math.max(6,Number(tx.fontSize)||12);
    if(Math.abs(size-base.size)>Math.max(1.2,base.size*.12))continue;
    const x=Number(tx.x);
    if(!Number.isFinite(x)||Math.abs(x-base.x)>Math.max(14,base.size*1.5))continue;
    const lineHeight=Math.max(size,Number(tx.lineHeight)||size*1.2);
    const lineCount=Math.max(1,Number(tx._renderedLineCount)||String(tx.replacementUnicode||'').replace(/\r\n?/g,'\n').split('\n').length);
    const tailY=Number(tx.y)-(lineCount-1)*lineHeight;
    if(!Number.isFinite(tailY))continue;
    // PDF coordinates decrease as content moves visually down on the unrotated pages supported by the current flow engine.
    const downDistance=base.y-tailY;
    if(downDistance<=base.size*.35||downDistance>base.size*18)continue;
    candidates.push({tx,txIndex,tailY,downDistance});
  }
  candidates.sort((a,b)=>b.downDistance-a.downDistance||b.txIndex-a.txIndex);
  return candidates[0]||null;
}

function waitFor(app,selector,timeout=1800){
  const current=app.querySelector(selector);
  if(current)return Promise.resolve(current);
  return new Promise((resolve,reject)=>{
    const observer=new MutationObserver(()=>{
      const found=app.querySelector(selector);
      if(found){clearTimeout(timer);observer.disconnect();resolve(found);}
    });
    observer.observe(app,{subtree:true,childList:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Timed out waiting for Add Text editor.'));},timeout);
  });
}

export function attachListTailMultiline({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false;
  let context=null;
  let automating=false;

  function remember(event){
    if(destroyed||automating)return;
    const editor=getEditor?.();
    const state=editor?.getState?.();
    if(!state||state.addTextMode)return;
    const hit=event.target?.closest?.(ORIGINAL_SELECTOR);
    if(!hit||!app.contains(hit))return;
    const layer=hit.closest('.pdf-hit-layer');
    if(!layer)return;
    const mapped=blockForHit(hit,state,layer);
    if(mapped)context={blockId:mapped.block.id,pageIndex:state.pageIndex};
  }

  async function intercept(event){
    if(destroyed||automating)return;
    const done=event.target?.closest?.('.pdf-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-inline-editor"]');
    if(!input||!String(input.value).includes('\n'))return;
    const editor=getEditor?.();
    const state=editor?.getState?.();
    if(!editor||!state||!context||context.pageIndex!==state.pageIndex)return;
    const block=state.analysis?.blocks?.find(item=>item.id===context.blockId);
    if(!block)return;

    const lines=String(input.value).replace(/\r\n?/g,'\n').split('\n');
    const first=lines.shift()??'';
    const extra=lines.join('\n').replace(/^\n+|\n+$/g,'');
    if(!extra.trim()||normalizeText(first)!==normalizeText(currentBlockText(block,state)))return;

    const tail=findInsertedListTail(block,state);
    if(!tail)return; // Let the normal smart multiline path handle lists with no prior inserted tail.

    const layer=app.querySelector('.pdf-hit-layer');
    const insertedHits=layer?[...layer.querySelectorAll('.pdf-hit-inserted')]:[];
    const insertedTransactions=(state.transactions||[]).filter(tx=>tx.kind==='INSERT_TEXT'&&tx.pageIndex===state.pageIndex);
    const localIndex=insertedTransactions.findIndex(tx=>tx.id===tail.tx.id);
    const tailHit=localIndex>=0?insertedHits[localIndex]:null;
    if(!tailHit)return;

    event.preventDefault();
    event.stopImmediatePropagation();
    automating=true;
    try{
      editor.setMode('add-text');
      tailHit.click();
      const insertInput=await waitFor(app,'textarea[data-role="pdf-new-text-editor"]');
      insertInput.value=extra;
      insertInput.dispatchEvent(new Event('input',{bubbles:true}));
      const insertDone=app.querySelector('.pdf-insert-done');
      if(!insertDone)throw new Error('Add Text confirmation control is unavailable.');
      insertDone.click();
    }catch(error){
      console.warn('List tail multiline append failed:',error);
      input.disabled=false;
      input.focus();
    }finally{
      setTimeout(()=>{automating=false;},0);
    }
  }

  app.addEventListener('pointerup',remember,true);
  app.addEventListener('click',remember,true);
  app.addEventListener('click',intercept,true);

  return {destroy(){
    destroyed=true;context=null;
    app.removeEventListener('pointerup',remember,true);
    app.removeEventListener('click',remember,true);
    app.removeEventListener('click',intercept,true);
  }};
}
