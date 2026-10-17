import { applyToPoint } from './utils/matrices.js';

const ORIGINAL_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const ANY_TEXT_SELECTOR=`${ORIGINAL_SELECTOR},.pdf-hit-inserted`;
const SYNTHETIC_FLAG=Symbol('alltoolforest-smart-line-v7');

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function isEditableBlock(block){return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';}
function isListLike(text){return /^\s*(?:\d{1,3}[.)]|[-•▪◦])\s*\S/.test(String(text||''));}
function listNumber(text){const m=String(text||'').match(/^\s*(\d{1,3})[.)]\s*/);return m?Number(m[1]):null;}
function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}

function blockStyle(block){
  const raw=[block?.fontName,block?.lines?.[0]?.fontName,block?.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  return {
    fontFamily:/courier|mono/.test(raw)?'mono':(/times|serif|roman/.test(raw)?'serif':'sans'),
    fontSize:clamp(Number(block?.lines?.[0]?.fontSize||block?.fontSize)||12,6,72),
    bold:/bold|black|semibold|demi/.test(raw),
    italic:/italic|oblique/.test(raw),
  };
}

function txStyle(tx){
  return {
    fontFamily:['serif','sans','mono'].includes(tx?.fontFamily)?tx.fontFamily:'serif',
    fontSize:clamp(Number(tx?.fontSize)||12,6,72),
    bold:!!tx?.bold,
    italic:!!tx?.italic,
  };
}

function sameStyle(a,b){
  if(!a?.style||!b?.style)return false;
  return a.style.fontFamily===b.style.fontFamily&&a.style.bold===b.style.bold&&a.style.italic===b.style.italic&&Math.abs(a.style.fontSize-b.style.fontSize)<=Math.max(.8,a.style.fontSize*.09);
}

function currentBlockText(block,state){
  const tx=(state?.transactions||[]).find(item=>item.kind==='REPLACE_TEXT'&&item.blockId===block.id);
  return tx?.displayUnicode??tx?.replacementUnicode??block?.text??'';
}

function txVisualY(tx,state,txIndex){
  let y=Number(tx?.y);
  if(!Number.isFinite(y))return null;
  const size=Math.max(6,Number(tx.fontSize)||12);
  for(const metric of state?.reflowMetrics||[]){
    if(metric?.pageIndex!==tx.pageIndex||!(Number(metric.delta)>0))continue;
    if(Number(metric.sequenceIndex)<=txIndex)continue;
    const top=y+size*.9;
    if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta)||0;
  }
  return y;
}

function blockVisualY(block,state){
  const line=block?.lines?.[0];
  let y=Number(line?.y);
  if(!Number.isFinite(y))return null;
  const top=Number(block?.bounds?.y||0)+Number(block?.bounds?.height||0);
  for(const metric of state?.reflowMetrics||[]){
    if(metric?.pageIndex!==block.pageIndex||!(Number(metric.delta)>0))continue;
    if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta)||0;
  }
  return y;
}

function buildVisualLines(state,layer){
  const matrix=layer?.__matrix;
  if(!matrix)return [];
  const entries=[];
  const scale=Math.max(Math.hypot(matrix[2]||0,matrix[3]||1),.1);

  for(const block of state?.analysis?.blocks||[]){
    if(!isEditableBlock(block))continue;
    const style=blockStyle(block);
    const text=currentBlockText(block,state);
    const lines=block.lines?.length?block.lines:[null];
    for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
      const line=lines[lineIndex];
      let y=Number(line?.y);
      if(!Number.isFinite(y))y=blockVisualY(block,state);
      else{
        const top=Number(block?.bounds?.y||0)+Number(block?.bounds?.height||0);
        for(const metric of state?.reflowMetrics||[]){
          if(metric?.pageIndex!==block.pageIndex||!(Number(metric.delta)>0))continue;
          if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta)||0;
        }
      }
      if(!Number.isFinite(y))continue;
      const x=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x||0);
      const maxX=Number.isFinite(Number(line?.maxX))?Number(line.maxX):x+Number(block?.bounds?.width||1);
      const p=applyToPoint(matrix,x,y),pr=applyToPoint(matrix,maxX,y);
      const fontPx=Math.max(8,style.fontSize*scale);
      entries.push({kind:'original',key:`block:${block.id}:${lineIndex}`,block,lineIndex,text:line?.text||text,style,xPdf:x,yPdf:y,left:Math.min(p.x,pr.x),right:Math.max(p.x,pr.x),baselineY:p.y,top:p.y-fontPx*.92,bottom:p.y+fontPx*.30,fontPx,pageIndex:block.pageIndex});
    }
  }

  const transactions=state?.transactions||[];
  for(let txIndex=0;txIndex<transactions.length;txIndex++){
    const tx=transactions[txIndex];
    if(tx?.kind!=='INSERT_TEXT'||tx.pageIndex!==state.pageIndex)continue;
    const style=txStyle(tx);
    const baseY=txVisualY(tx,state,txIndex);
    if(!Number.isFinite(baseY))continue;
    const lineHeight=Math.max(style.fontSize,Number(tx.lineHeight)||style.fontSize*1.2);
    const renderedCount=Math.max(1,Number(tx._renderedLineCount)||String(tx.replacementUnicode||'').replace(/\r\n?/g,'\n').split('\n').length);
    const textLines=String(tx.replacementUnicode||'').replace(/\r\n?/g,'\n').split('\n');
    const x=Number(tx.x)||0;
    const width=Math.max(28,Number(tx._renderedWidth)||Number(tx.maxWidth)||300);
    const fontPx=Math.max(8,style.fontSize*scale);
    for(let lineIndex=0;lineIndex<renderedCount;lineIndex++){
      const y=baseY-lineIndex*lineHeight;
      const p=applyToPoint(matrix,x,y),pr=applyToPoint(matrix,x+width,y);
      entries.push({kind:'inserted',key:`tx:${tx.id}:${lineIndex}`,tx,txIndex,lineIndex,text:textLines[Math.min(lineIndex,textLines.length-1)]||tx.replacementUnicode||'',style,xPdf:x,yPdf:y,left:Math.min(p.x,pr.x),right:Math.max(p.x,pr.x),baselineY:p.y,top:p.y-fontPx*.92,bottom:p.y+fontPx*.30,fontPx,pageIndex:tx.pageIndex});
    }
  }
  entries.sort((a,b)=>a.baselineY-b.baselineY||a.left-b.left);
  return entries;
}

function referenceForHit(hit,state,layer,entries){
  if(hit?.classList?.contains('pdf-hit-inserted')){
    const insertedHits=[...layer.querySelectorAll('.pdf-hit-inserted')];
    const index=insertedHits.indexOf(hit);
    if(index<0)return null;
    const txs=(state.transactions||[]).filter(tx=>tx.kind==='INSERT_TEXT'&&tx.pageIndex===state.pageIndex);
    const tx=txs[index];
    if(!tx)return null;
    return entries.filter(entry=>entry.kind==='inserted'&&entry.tx?.id===tx.id).at(-1)||null;
  }
  const originalHits=[...layer.querySelectorAll(ORIGINAL_SELECTOR)];
  const wanted=originalHits.indexOf(hit);
  if(wanted<0)return null;
  let cursor=0;
  for(const block of state.analysis?.blocks||[]){
    if(!isEditableBlock(block))continue;
    const lines=block.lines?.length?block.lines:[null];
    for(let i=0;i<lines.length;i++){
      if(cursor===wanted)return entries.find(entry=>entry.kind==='original'&&entry.block?.id===block.id&&entry.lineIndex===i)||null;
      cursor++;
    }
  }
  return null;
}

function referenceFromBlankClick(layer,event,entries){
  const rect=layer.getBoundingClientRect();
  const clickX=event.clientX-rect.left,clickY=event.clientY-rect.top;
  const candidates=[];
  for(const entry of entries){
    const vertical=clickY-entry.baselineY;
    if(vertical<entry.fontPx*.08||vertical>entry.fontPx*5.2)continue;
    const horizontal=clickX<entry.left?entry.left-clickX:(clickX>entry.right?clickX-entry.right:0);
    if(horizontal>Math.max(entry.fontPx*4.5,72))continue;
    candidates.push({entry,vertical,horizontal,list:isListLike(entry.text)});
  }
  if(!candidates.length)return null;
  const pool=candidates.some(item=>item.list)?candidates.filter(item=>item.list):candidates;
  pool.sort((a,b)=>(a.vertical+a.horizontal*.18)-(b.vertical+b.horizontal*.18));
  return pool[0]?.entry||null;
}

function estimateSpacing(reference,entries){
  if(reference.kind==='inserted'){
    const h=Number(reference.tx?.lineHeight);
    if(Number.isFinite(h)&&h>0){
      const scale=reference.fontPx/Math.max(reference.style.fontSize,1);
      return Math.max(reference.fontPx*.95,h*scale);
    }
  }
  const peers=entries.filter(entry=>entry.key!==reference.key&&sameStyle(entry,reference)&&Math.abs(entry.left-reference.left)<=Math.max(8,reference.fontPx*.65)&&Math.abs(entry.baselineY-reference.baselineY)<=reference.fontPx*8);
  const ys=[reference.baselineY,...peers.map(entry=>entry.baselineY)].sort((a,b)=>a-b);
  const gaps=[];
  for(let i=1;i<ys.length;i++){
    const gap=ys[i]-ys[i-1];
    if(gap>=reference.fontPx*.82&&gap<=reference.fontPx*2.6)gaps.push(gap);
  }
  if(!gaps.length)return reference.fontPx*1.2;
  gaps.sort((a,b)=>a-b);
  return gaps[Math.floor(gaps.length/2)];
}

function findCurrentListTail(reference,entries){
  if(!reference||!isListLike(reference.text))return reference;
  let tail=reference;
  let expected=listNumber(reference.text);
  const candidates=entries.filter(entry=>entry.key!==reference.key&&entry.baselineY>reference.baselineY+.5&&isListLike(entry.text)&&sameStyle(entry,reference)&&Math.abs(entry.left-reference.left)<=Math.max(10,reference.fontPx*.8)).sort((a,b)=>a.baselineY-b.baselineY);
  for(const entry of candidates){
    const gap=entry.baselineY-tail.baselineY;
    if(gap>reference.fontPx*3.0)break;
    const number=listNumber(entry.text);
    if(expected!=null){
      if(number!==expected+1)continue;
      expected=number;
    }
    tail=entry;
  }
  return tail;
}

function insertionPoint(reference,entries){
  const spacingPx=estimateSpacing(reference,entries);
  const targetBaselineY=reference.baselineY+spacingPx;
  const editorFontPx=Math.max(16,reference.fontPx);
  return {x:reference.left,y:targetBaselineY-editorFontPx*.88,baselineY:targetBaselineY,style:reference.style,referenceKey:reference.key};
}

function ensureSizeOption(select,value){
  const exact=Math.round(clamp(value,6,72)*100)/100;
  let option=[...select.options].find(item=>Math.abs(Number(item.value)-exact)<.0001);
  if(!option){option=new Option(`${exact} pt`,String(exact));select.append(option);}
  return String(exact);
}

function applyStyle(app,style){
  const tools=app.querySelector('.pdf-format-tools');
  if(!tools||!style)return;
  const selects=[...tools.querySelectorAll('select.pdf-format-select')];
  const family=selects.find(item=>!item.classList.contains('pdf-size-select'));
  const size=tools.querySelector('.pdf-size-select');
  const precision=tools.querySelector('.pdf-precision-size-input');
  const toggles=[...tools.querySelectorAll('.pdf-format-toggle')];
  const bold=toggles.find(item=>item.getAttribute('aria-label')==='Bold text');
  const italic=toggles.find(item=>item.getAttribute('aria-label')==='Italic text');
  if(family){family.value=style.fontFamily;family.dispatchEvent(new Event('change',{bubbles:true}));}
  if(size){size.value=ensureSizeOption(size,style.fontSize);size.dispatchEvent(new Event('change',{bubbles:true}));}
  if(precision){precision.value=String(Math.round(style.fontSize*100)/100);precision.dispatchEvent(new Event('input',{bubbles:true}));}
  for(const [button,active] of [[bold,style.bold],[italic,style.italic]]){
    if(!button)continue;
    button.setAttribute('aria-pressed',String(!!active));
    button.classList.toggle('is-active',!!active);
  }
}

function selectedFontSize(app){
  const precise=Number(app.querySelector('.pdf-precision-size-input')?.value);
  if(Number.isFinite(precise)&&precise>=6&&precise<=72)return precise;
  const selected=Number(app.querySelector('.pdf-size-select')?.value);
  return Number.isFinite(selected)?clamp(selected,6,72):12;
}

function measureVisualRows(input,text,fontPx){
  const usable=Math.max(40,input.clientWidth-18);
  const canvas=measureVisualRows.canvas||(measureVisualRows.canvas=document.createElement('canvas'));
  const ctx=canvas.getContext('2d');
  if(!ctx)return Math.max(1,String(text||'').split(/\r?\n/).length);
  const cs=getComputedStyle(input);
  ctx.font=`${cs.fontStyle||'normal'} ${cs.fontWeight||'400'} ${Math.max(8,fontPx)}px ${cs.fontFamily||'serif'}`;
  let rows=0;
  for(const source of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
    if(!source){rows++;continue;}
    let line='';
    const words=source.split(/\s+/);
    for(const word of words){
      const candidate=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(candidate).width>usable){rows++;line=word;}
      else line=candidate;
    }
    if(line)rows++;
  }
  return Math.max(1,rows);
}

function blocksFromVerticalStart(state,entries,startTop){
  const ids=new Set();
  for(const entry of entries){
    if(entry.kind!=='original'||!entry.block)continue;
    if(entry.top>=startTop-.5)ids.add(entry.block.id);
  }
  return (state.analysis?.blocks||[]).filter(block=>ids.has(block.id));
}

function classifyInsertion(app,state,input,layer,anchor){
  if(!anchor||anchor.pageIndex!==state.pageIndex||anchor.layer!==layer)return null;
  const entries=buildVisualLines(state,layer);
  if(!entries.length)return null;
  const matrix=layer.__matrix;
  const scale=Math.max(Math.hypot(matrix?.[2]||0,matrix?.[3]||1),.1);
  const fontSize=selectedFontSize(app);
  const fontPx=Math.max(16,fontSize*scale);
  const lineHeight=Math.max(fontPx,fontPx*1.2);
  const baselineY=anchor.baselineY??(anchor.top+fontPx*.88);
  const rows=measureVisualRows(input,input.value,fontPx);
  const insertedTop=baselineY-fontPx*.92;
  const insertedBottom=baselineY+(rows-1)*lineHeight+fontPx*.30;
  const insertedLeft=anchor.left;
  const insertedRight=anchor.left+Math.max(40,input.clientWidth||180);
  const safety=Math.max(3,fontPx*.22);

  const relevant=entries.filter(entry=>entry.key!==anchor.referenceKey&&overlap(insertedLeft,insertedRight,entry.left,entry.right)>=Math.min(8,Math.max(1,entry.right-entry.left)*.2));
  const collisions=relevant.filter(entry=>overlap(insertedTop,insertedBottom,entry.top,entry.bottom)>.5).sort((a,b)=>a.top-b.top);
  if(collisions.length){
    const startTop=Math.min(...collisions.map(entry=>entry.top));
    return {fits:false,distance:0,belowBlocks:blocksFromVerticalStart(state,entries,startTop)};
  }

  const below=relevant.filter(entry=>entry.top>=insertedBottom-.5).sort((a,b)=>a.top-b.top);
  const nearest=below[0]||null;
  if(!nearest)return {passthrough:true};
  const distance=nearest.top-insertedBottom;
  if(distance>=safety)return {fits:true,distance,belowBlocks:[]};
  return {fits:false,distance,belowBlocks:blocksFromVerticalStart(state,entries,nearest.top)};
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
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Timed out waiting for the text editor.'));},timeout);
  });
}

export function attachSmartLineInsertion({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false,automating=false,lastExisting=null,pendingAnchor=null;
  function state(){return getEditor?.()?.getState?.()||null;}

  function rememberExisting(event){
    if(destroyed||automating)return;
    const s=state();
    if(!s||s.addTextMode)return;
    const hit=event.target?.closest?.(ORIGINAL_SELECTOR);
    if(!hit||!app.contains(hit))return;
    const layer=hit.closest('.pdf-hit-layer');
    const entries=buildVisualLines(s,layer);
    const ref=referenceForHit(hit,s,layer,entries);
    if(ref?.block)lastExisting={blockId:ref.block.id,pageIndex:s.pageIndex};
  }

  function dispatchSnapped(layer,point,s){
    const rect=layer.getBoundingClientRect();
    const x=clamp(point.x,4,Math.max(4,layer.clientWidth-8));
    const y=clamp(point.y,4,Math.max(4,layer.clientHeight-96));
    pendingAnchor={layer,pageIndex:s.pageIndex,left:x,top:y,baselineY:point.baselineY,referenceKey:point.referenceKey,capturedAt:performance.now()};
    const evt=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:rect.left+x,clientY:rect.top+y,view:window});
    Object.defineProperty(evt,SYNTHETIC_FLAG,{value:true});
    layer.dispatchEvent(evt);
  }

  function onAddTextCapture(event){
    if(destroyed||automating||event[SYNTHETIC_FLAG])return;
    const s=state();
    if(!s?.addTextMode)return;
    const layer=event.target?.closest?.('.pdf-hit-layer');
    if(!layer||!app.contains(layer))return;
    if(event.target?.closest?.('textarea,.pdf-done,.pdf-insert-actions,.pdf-format-tools'))return;
    const entries=buildVisualLines(s,layer);
    if(!entries.length)return;
    const hit=event.target?.closest?.(ANY_TEXT_SELECTOR);
    let reference=hit?referenceForHit(hit,s,layer,entries):referenceFromBlankClick(layer,event,entries);
    if(!reference)return;
    reference=findCurrentListTail(reference,entries);
    const point=insertionPoint(reference,entries);
    event.preventDefault();event.stopImmediatePropagation();
    applyStyle(app,point.style);
    queueMicrotask(()=>dispatchSnapped(layer,point,s));
  }

  function onInsertDoneCapture(event){
    if(destroyed)return;
    const done=event.target?.closest?.('.pdf-insert-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-new-text-editor"]');
    const layer=app.querySelector('.pdf-hit-layer');
    const s=state();
    if(!input||!layer||!s?.analysis?.blocks?.length)return;
    const anchor=pendingAnchor&&performance.now()-pendingAnchor.capturedAt<120000?pendingAnchor:null;
    const classification=classifyInsertion(app,s,input,layer,anchor);
    if(!classification||classification.passthrough)return;
    const original=s.analysis.blocks;
    s.analysis.blocks=classification.fits?[]:classification.belowBlocks;
    queueMicrotask(()=>{if(s.analysis)s.analysis.blocks=original;});
    setTimeout(()=>{pendingAnchor=null;},0);
  }

  async function convertMultilineEdit(event){
    if(destroyed||automating)return;
    const done=event.target?.closest?.('.pdf-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-inline-editor"]');
    if(!input||!String(input.value).includes('\n'))return;
    const s=state();
    if(!s||!lastExisting||lastExisting.pageIndex!==s.pageIndex)return;
    const block=s.analysis?.blocks?.find(item=>item.id===lastExisting.blockId);
    if(!block)return;
    const lines=String(input.value).replace(/\r\n?/g,'\n').split('\n');
    const first=lines.shift()??'';
    const extra=lines.join('\n').replace(/^\n+|\n+$/g,'');
    if(!extra.trim()||normalizeText(first)!==normalizeText(currentBlockText(block,s)))return;

    event.preventDefault();event.stopImmediatePropagation();automating=true;
    try{
      const editor=getEditor?.();
      const layer=app.querySelector('.pdf-hit-layer');
      if(!editor||!layer)throw new Error('The PDF page is not ready for line insertion.');
      const entries=buildVisualLines(s,layer);
      let reference=entries.find(entry=>entry.kind==='original'&&entry.block?.id===block.id);
      if(!reference)throw new Error('Could not determine the edited line position.');
      reference=findCurrentListTail(reference,entries);
      const point=insertionPoint(reference,entries);
      applyStyle(app,point.style);
      editor.setMode('add-text');
      dispatchSnapped(layer,point,s);
      const insertInput=await waitFor(app,'textarea[data-role="pdf-new-text-editor"]');
      insertInput.value=extra;
      insertInput.dispatchEvent(new Event('input',{bubbles:true}));
      const insertDone=app.querySelector('.pdf-insert-done');
      if(!insertDone)throw new Error('The Add Text confirmation control is unavailable.');
      insertDone.click();
    }catch(error){console.warn('Unified line insertion:',error);}
    finally{setTimeout(()=>{automating=false;},0);}
  }

  app.addEventListener('pointerup',rememberExisting,true);
  app.addEventListener('click',rememberExisting,true);
  app.addEventListener('click',onAddTextCapture,true);
  app.addEventListener('click',onInsertDoneCapture,true);
  app.addEventListener('click',convertMultilineEdit,true);

  return {destroy(){
    destroyed=true;pendingAnchor=null;
    app.removeEventListener('pointerup',rememberExisting,true);
    app.removeEventListener('click',rememberExisting,true);
    app.removeEventListener('click',onAddTextCapture,true);
    app.removeEventListener('click',onInsertDoneCapture,true);
    app.removeEventListener('click',convertMultilineEdit,true);
  }};
}
