import { applyToPoint } from './utils/matrices.js';

const EDITABLE_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const SYNTHETIC_FLAG=Symbol('alltoolforest-smart-line-click');

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function normalizeText(value){return String(value||'').replace(/\s+/g,' ').trim();}
function isEditableBlock(block){return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';}

function inferBlockStyle(block){
  const raw=[block?.fontName,block?.lines?.[0]?.fontName,block?.sourceRuns?.[0]?.fontContext?.baseFont]
    .filter(Boolean).join(' ').toLowerCase();
  const fontFamily=/courier|mono/.test(raw)?'mono':(/times|serif|roman/.test(raw)?'serif':'sans');
  const bold=/bold|black|semibold|demi/.test(raw);
  const italic=/italic|oblique/.test(raw);
  const fontSize=clamp(Number(block?.lines?.[0]?.fontSize||block?.fontSize)||12,6,72);
  return {fontFamily,fontSize,bold,italic};
}

function currentBlockText(block,state){
  const tx=(state?.transactions||[]).find(item=>item.kind==='REPLACE_TEXT'&&item.blockId===block.id);
  return tx?.displayUnicode??tx?.replacementUnicode??block.text??'';
}

function visualLine(block,state){
  const line=block?.lines?.[0];
  if(!line)return null;
  let y=Number(line.y);
  if(!Number.isFinite(y))return null;
  const top=Number(block?.bounds?.y||0)+Number(block?.bounds?.height||0);
  for(const metric of state?.reflowMetrics||[]){
    if(metric?.pageIndex!==block.pageIndex||!(Number(metric.delta)>0))continue;
    if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta)||0;
  }
  const x=Number.isFinite(Number(line.minX))?Number(line.minX):Number(block?.bounds?.x||0);
  const maxX=Number.isFinite(Number(line.maxX))?Number(line.maxX):x+Number(block?.bounds?.width||1);
  return {x,y,maxX,fontSize:Number(line.fontSize)||Number(block.fontSize)||12};
}

function blockForHit(hit,state){
  const layer=hit?.closest?.('.pdf-hit-layer');
  if(!layer||!state?.analysis?.blocks)return null;
  const hits=[...layer.querySelectorAll(EDITABLE_SELECTOR)];
  const wanted=hits.indexOf(hit);
  if(wanted<0)return null;
  let cursor=0;
  for(const block of state.analysis.blocks){
    if(!isEditableBlock(block))continue;
    const lines=block.lines?.length?block.lines:[null];
    for(const line of lines){
      if(cursor===wanted)return {block,line,hit};
      cursor++;
    }
  }
  return null;
}

function sameStyle(a,b){
  const sa=inferBlockStyle(a),sb=inferBlockStyle(b);
  return sa.fontFamily===sb.fontFamily&&sa.bold===sb.bold&&sa.italic===sb.italic&&Math.abs(sa.fontSize-sb.fontSize)<=Math.max(.8,sa.fontSize*.09);
}

function estimateLineSpacing(reference,state){
  const ref=visualLine(reference,state);
  if(!ref)return inferBlockStyle(reference).fontSize*1.2;
  const gaps=[];
  const tolerance=Math.max(4,ref.fontSize*.55);
  const peers=[];
  for(const block of state?.analysis?.blocks||[]){
    if(block.id===reference.id||!isEditableBlock(block)||!sameStyle(reference,block))continue;
    const line=visualLine(block,state);
    if(!line||Math.abs(line.x-ref.x)>tolerance)continue;
    if(Math.abs(line.y-ref.y)>ref.fontSize*7)continue;
    peers.push(line);
  }
  const ys=[ref.y,...peers.map(item=>item.y)].sort((a,b)=>b-a);
  for(let i=1;i<ys.length;i++){
    const gap=ys[i-1]-ys[i];
    if(gap>=ref.fontSize*.85&&gap<=ref.fontSize*2.4)gaps.push(gap);
  }
  if(!gaps.length)return ref.fontSize*1.2;
  gaps.sort((a,b)=>a-b);
  return gaps[Math.floor(gaps.length/2)];
}

function isListLike(text){return /^\s*(?:\d{1,3}[.)]|[-•▪◦])\s*\S/.test(String(text||''));}

function findReferenceFromBlankClick(layer,event,state){
  const matrix=layer?.__matrix;
  if(!matrix||!state?.analysis?.blocks?.length)return null;
  const rect=layer.getBoundingClientRect();
  const clickX=event.clientX-rect.left;
  const clickY=event.clientY-rect.top;
  const candidates=[];
  for(const block of state.analysis.blocks){
    if(!isEditableBlock(block))continue;
    const line=visualLine(block,state);
    if(!line)continue;
    const style=inferBlockStyle(block);
    const p=applyToPoint(matrix,line.x,line.y);
    const pRight=applyToPoint(matrix,line.maxX,line.y);
    const scale=Math.max(Math.hypot(matrix[2]||0,matrix[3]||1),.1);
    const fontPx=Math.max(8,style.fontSize*scale);
    const vertical=clickY-p.y;
    if(vertical<fontPx*.10||vertical>fontPx*4.2)continue;
    const minX=Math.min(p.x,pRight.x),maxX=Math.max(p.x,pRight.x);
    const horizontal=clickX<minX?minX-clickX:(clickX>maxX?clickX-maxX:0);
    if(horizontal>Math.max(fontPx*4,64))continue;
    candidates.push({block,vertical,horizontal,fontPx,list:isListLike(currentBlockText(block,state)),bold:style.bold});
  }
  if(!candidates.length)return null;
  const listCandidates=candidates.filter(item=>item.list);
  const pool=listCandidates.length?listCandidates:candidates;
  pool.sort((a,b)=>{
    const av=a.vertical+a.horizontal*.22+(a.bold? a.fontPx*.8:0);
    const bv=b.vertical+b.horizontal*.22+(b.bold? b.fontPx*.8:0);
    return av-bv;
  });
  return pool[0]?.block||null;
}

function ensureSizeOption(select,value){
  const exact=Math.round(clamp(value,6,72)*100)/100;
  let option=[...select.options].find(item=>Math.abs(Number(item.value)-exact)<.0001);
  if(!option){option=new Option(`${exact} pt`,String(exact));select.append(option);}
  return String(exact);
}

function applyReferenceStyle(app,block){
  const style=inferBlockStyle(block);
  const tools=app.querySelector('.pdf-format-tools');
  if(!tools)return style;
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
  return style;
}

function insertionPointForReference(layer,block,state){
  const matrix=layer?.__matrix;
  const line=visualLine(block,state);
  if(!matrix||!line)return null;
  const style=inferBlockStyle(block);
  const spacingPdf=estimateLineSpacing(block,state);
  const referenceScreen=applyToPoint(matrix,line.x,line.y);
  const verticalScale=Math.max(Math.hypot(matrix[2]||0,matrix[3]||1),.1);
  const spacingPx=Math.max(style.fontSize*.95,spacingPdf)*verticalScale;
  const targetBaselineY=referenceScreen.y+spacingPx;
  const editorFontPx=Math.max(16,style.fontSize*verticalScale);
  const top=targetBaselineY-editorFontPx*.88;
  return {x:referenceScreen.x,y:top,baselineY:targetBaselineY,spacing:spacingPdf,style};
}

function dispatchSnappedClick(layer,point){
  const rect=layer.getBoundingClientRect();
  const x=clamp(point.x,4,Math.max(4,layer.clientWidth-8));
  const y=clamp(point.y,4,Math.max(4,layer.clientHeight-96));
  const synthetic=new MouseEvent('click',{bubbles:true,cancelable:true,clientX:rect.left+x,clientY:rect.top+y,view:window});
  Object.defineProperty(synthetic,SYNTHETIC_FLAG,{value:true});
  layer.dispatchEvent(synthetic);
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
  let destroyed=false;
  let lastExisting=null;
  let automating=false;

  function state(){return getEditor?.()?.getState?.()||null;}

  function rememberExistingContext(event){
    if(automating)return;
    const editor=getEditor?.();
    const s=editor?.getState?.();
    if(!s||s.addTextMode)return;
    const hit=event.target?.closest?.(EDITABLE_SELECTOR);
    if(!hit||!app.contains(hit))return;
    const match=blockForHit(hit,s);
    if(match)lastExisting={blockId:match.block.id,pageIndex:s.pageIndex,originalText:currentBlockText(match.block,s)};
  }

  function onAddTextClickCapture(event){
    if(destroyed||automating||event[SYNTHETIC_FLAG])return;
    const editor=getEditor?.();
    const s=editor?.getState?.();
    if(!s?.addTextMode)return;
    const layer=event.target?.closest?.('.pdf-hit-layer');
    if(!layer||!app.contains(layer))return;
    if(event.target?.closest?.('textarea,.pdf-done,.pdf-insert-actions,.pdf-format-tools'))return;

    const hit=event.target?.closest?.(EDITABLE_SELECTOR);
    const direct=hit?blockForHit(hit,s)?.block:null;
    const reference=direct||findReferenceFromBlankClick(layer,event,s);
    if(!reference)return;
    const point=insertionPointForReference(layer,reference,s);
    if(!point)return;

    event.preventDefault();
    event.stopImmediatePropagation();
    applyReferenceStyle(app,reference);
    queueMicrotask(()=>dispatchSnappedClick(layer,point));
  }

  async function convertMultilineEditToInsertion(event){
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
    const current=currentBlockText(block,s);
    if(!extra.trim()||normalizeText(first)!==normalizeText(current))return;

    event.preventDefault();
    event.stopImmediatePropagation();
    automating=true;
    try{
      const editor=getEditor?.();
      const layer=app.querySelector('.pdf-hit-layer');
      if(!editor||!layer)throw new Error('The PDF page is not ready for line insertion.');
      const point=insertionPointForReference(layer,block,s);
      if(!point)throw new Error('Could not determine the next aligned line position.');
      applyReferenceStyle(app,block);
      editor.setMode('add-text');
      dispatchSnappedClick(layer,point);
      const insertInput=await waitFor(app,'textarea[data-role="pdf-new-text-editor"]');
      insertInput.value=extra;
      insertInput.dispatchEvent(new Event('input',{bubbles:true}));
      const insertDone=app.querySelector('.pdf-insert-done');
      if(!insertDone)throw new Error('The Add Text confirmation control is unavailable.');
      insertDone.click();
    }catch(error){
      console.warn('Smart line insertion fallback:',error);
    }finally{
      setTimeout(()=>{automating=false;},0);
    }
  }

  app.addEventListener('pointerup',rememberExistingContext,true);
  app.addEventListener('click',rememberExistingContext,true);
  app.addEventListener('click',onAddTextClickCapture,true);
  app.addEventListener('click',convertMultilineEditToInsertion,true);

  return {
    destroy(){
      destroyed=true;
      app.removeEventListener('pointerup',rememberExistingContext,true);
      app.removeEventListener('click',rememberExistingContext,true);
      app.removeEventListener('click',onAddTextClickCapture,true);
      app.removeEventListener('click',convertMultilineEditToInsertion,true);
    }
  };
}
