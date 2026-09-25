import { attachSmartLineInsertion as attachV6 } from './smart-line-insertion-v6.js';

const ORIGINAL_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const EDITABLE_TIERS=new Set(['DIRECT_EDIT','FONT_SUBSTITUTION']);

function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function isEditable(block){return EDITABLE_TIERS.has(block?.tier);}
function isListLike(text){return /^\s*(?:\d{1,3}[.)]|[-•▪◦])\s*\S/.test(String(text||''));}
function familyOf(block){
  const raw=[block?.fontName,block?.lines?.[0]?.fontName,block?.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  return /courier|mono/.test(raw)?'mono':(/times|serif|roman/.test(raw)?'serif':'sans');
}
function blockStyle(block){
  const raw=[block?.fontName,block?.lines?.[0]?.fontName,block?.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  return {
    family:familyOf(block),
    size:Math.max(6,Number(block?.lines?.[0]?.fontSize||block?.fontSize)||12),
    bold:/bold|black|semibold|demi/.test(raw),
    italic:/italic|oblique/.test(raw),
  };
}
function sameStyle(a,b){
  if(!a||!b)return false;
  return a.family===b.family&&a.bold===b.bold&&a.italic===b.italic&&Math.abs(a.size-b.size)<=Math.max(1.25,a.size*.12);
}
function currentBlockText(block,state){
  const tx=(state?.transactions||[]).find(item=>item.kind==='REPLACE_TEXT'&&item.blockId===block.id);
  return tx?.displayUnicode??tx?.replacementUnicode??block?.text??'';
}

function recordsForPage(app,state){
  const hits=[...app.querySelectorAll(ORIGINAL_SELECTOR)];
  const records=[];
  let cursor=0;
  for(const block of state?.analysis?.blocks||[]){
    if(!isEditable(block))continue;
    const lines=block.lines?.length?block.lines:[null];
    const style=blockStyle(block);
    for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
      const hit=hits[cursor++];
      if(!hit)continue;
      const rect=hit.getBoundingClientRect();
      records.push({block,lineIndex,hit,rect,style,text:lines[lineIndex]?.text||currentBlockText(block,state)});
    }
  }
  records.sort((a,b)=>a.rect.top-b.rect.top||a.rect.left-b.rect.left);
  return records;
}

function paragraphTail(record,records){
  if(!record||isListLike(record.text))return record;
  let tail=record;
  const startIndex=records.indexOf(record);
  if(startIndex<0)return record;
  for(let i=startIndex+1;i<records.length;i++){
    const next=records[i];
    if(isListLike(next.text)||!sameStyle(tail.style,next.style))break;
    const fontPx=Math.max(8,tail.rect.height,next.rect.height);
    const vertical=next.rect.top-tail.rect.top;
    const leftDelta=Math.abs(next.rect.left-tail.rect.left);
    if(vertical<fontPx*.45||vertical>fontPx*1.95)break;
    if(leftDelta>Math.max(18,fontPx*1.45))break;
    tail=next;
  }
  return tail;
}

function recordForHit(hit,records){return records.find(record=>record.hit===hit)||null;}
function recordForBlockId(blockId,records){return records.find(record=>record.block?.id===blockId)||null;}

function waitUntil(test,timeout=4200,interval=35){
  return new Promise((resolve,reject)=>{
    const started=performance.now();
    const tick=()=>{
      let value=null;
      try{value=test();}catch{}
      if(value)return resolve(value);
      if(performance.now()-started>=timeout)return reject(new Error('Timed out waiting for the PDF edit to finish.'));
      setTimeout(tick,interval);
    };
    tick();
  });
}

export function attachSmartLineInsertion(options){
  const {app,getEditor}=options||{};
  if(!app)throw new Error('Edit PDF app element is required');

  let destroyed=false;
  let redirecting=false;
  let automating=false;
  let lastExisting=null;

  function state(){return getEditor?.()?.getState?.()||null;}

  function rememberExisting(event){
    if(destroyed||automating)return;
    const s=state();
    if(!s||s.addTextMode)return;
    const hit=event.target?.closest?.(ORIGINAL_SELECTOR);
    if(!hit||!app.contains(hit))return;
    const records=recordsForPage(app,s);
    const record=recordForHit(hit,records);
    if(record?.block)lastExisting={blockId:record.block.id,pageIndex:s.pageIndex};
  }

  function redirectAddTextToParagraphTail(event){
    if(destroyed||redirecting||automating)return;
    const s=state();
    if(!s?.addTextMode)return;
    if(event.target?.closest?.('textarea,.pdf-done,.pdf-insert-actions,.pdf-format-tools'))return;
    const hit=event.target?.closest?.(ORIGINAL_SELECTOR);
    if(!hit||!app.contains(hit))return;
    const records=recordsForPage(app,s);
    const record=recordForHit(hit,records);
    const tail=paragraphTail(record,records);
    if(!record||!tail||tail.hit===hit)return;

    event.preventDefault();
    event.stopImmediatePropagation();
    redirecting=true;
    try{tail.hit.click();}
    finally{queueMicrotask(()=>{redirecting=false;});}
  }

  async function appendAfterCommittedLine({blockId,pageIndex,extra}){
    try{
      await waitUntil(()=>!app.querySelector('textarea[data-role="pdf-inline-editor"]'));
      const editor=getEditor?.();
      let s=state();
      if(!editor||!s||s.pageIndex!==pageIndex)return;
      const committed=(s.transactions||[]).some(tx=>tx.kind==='REPLACE_TEXT'&&tx.blockId===blockId);
      if(!committed)return;

      const layer=await waitUntil(()=>app.querySelector('.pdf-hit-layer'));
      s=state();
      const records=recordsForPage(app,s);
      let reference=recordForBlockId(blockId,records);
      if(!reference)return;
      reference=paragraphTail(reference,records);
      if(!reference?.hit)return;

      editor.setMode('add-text');
      redirecting=true;
      try{reference.hit.click();}
      finally{queueMicrotask(()=>{redirecting=false;});}

      const insertInput=await waitUntil(()=>app.querySelector('textarea[data-role="pdf-new-text-editor"]'));
      insertInput.value=extra;
      insertInput.dispatchEvent(new Event('input',{bubbles:true}));
      const insertDone=app.querySelector('.pdf-insert-done');
      if(!insertDone)throw new Error('The Add Text confirmation control is unavailable.');
      insertDone.click();
      await waitUntil(()=>!app.querySelector('textarea[data-role="pdf-new-text-editor"]'));
    }catch(error){
      console.warn('Paragraph-tail append failed:',error);
    }finally{
      automating=false;
    }
  }

  function splitMultilineEdit(event){
    if(destroyed||automating)return;
    const done=event.target?.closest?.('.pdf-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-inline-editor"]');
    if(!input||!String(input.value).includes('\n'))return;
    const s=state();
    if(!s||!lastExisting||lastExisting.pageIndex!==s.pageIndex)return;
    const block=s.analysis?.blocks?.find(item=>item.id===lastExisting.blockId);
    if(!block)return;

    const parts=String(input.value).replace(/\r\n?/g,'\n').split('\n');
    const first=parts.shift()??'';
    const extra=parts.join('\n').replace(/^\n+|\n+$/g,'');
    if(!extra.trim())return;

    // A PDF source line is still replaced as one line. Everything after the
    // first explicit newline is routed through the same Add Text/reflow path.
    input.value=first;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    automating=true;
    const pending={blockId:block.id,pageIndex:s.pageIndex,extra};
    setTimeout(()=>appendAfterCommittedLine(pending),0);
    // Do not stop propagation: the existing editor now commits only `first`.
    // The older v7 multiline interceptor sees no newline and stays out of the way.
  }

  // Register these capture handlers BEFORE v6/v7 so paragraph redirects and
  // multiline splitting happen before the existing smart-line listeners.
  app.addEventListener('pointerup',rememberExisting,true);
  app.addEventListener('click',rememberExisting,true);
  app.addEventListener('click',redirectAddTextToParagraphTail,true);
  app.addEventListener('click',splitMultilineEdit,true);

  const base=attachV6(options);

  return {
    async prepareDocument(fileOrBytes){return base?.prepareDocument?.(fileOrBytes);},
    getPreparedPages(){return base?.getPreparedPages?.()||[];},
    refreshFlowedHitRegions(){return base?.refreshFlowedHitRegions?.();},
    destroy(){
      destroyed=true;
      app.removeEventListener('pointerup',rememberExisting,true);
      app.removeEventListener('click',rememberExisting,true);
      app.removeEventListener('click',redirectAddTextToParagraphTail,true);
      app.removeEventListener('click',splitMultilineEdit,true);
      base?.destroy?.();
    },
  };
}
