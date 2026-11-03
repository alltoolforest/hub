import { attachSmartLineInsertion as attachV6 } from './smart-line-insertion-v6.js?release=2026-11-03-upward-flow';

const ORIGINAL_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const EDITABLE_TIERS=new Set(['DIRECT_EDIT','FONT_SUBSTITUTION']);

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
      const legacy=hits[cursor++];const tagged=hits.some(item=>item.dataset.blockId);const hit=tagged?hits.find(item=>item.dataset.blockId===block.id&&Number(item.dataset.lineIndex)===lineIndex):legacy;
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

export function attachSmartLineInsertion(options){
  const {app,getEditor}=options||{};
  if(!app)throw new Error('Edit PDF app element is required');

  let destroyed=false;
  let redirecting=false;

  function state(){return getEditor?.()?.getState?.()||null;}

  function redirectAddTextToParagraphTail(event){
    if(destroyed||redirecting)return;
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

  // Existing-text Enter edits belong to the native atomic replacement path.
  // Never commit a prefix and append the remainder as a second operation.
  app.addEventListener('click',redirectAddTextToParagraphTail,true);

  const base=attachV6(options);

  return {
    async prepareDocument(fileOrBytes){return base?.prepareDocument?.(fileOrBytes);},
    getPreparedPages(){return base?.getPreparedPages?.()||[];},
    refreshFlowedHitRegions(){return base?.refreshFlowedHitRegions?.();},
    destroy(){
      destroyed=true;
      app.removeEventListener('click',redirectAddTextToParagraphTail,true);
      base?.destroy?.();
    },
  };
}
