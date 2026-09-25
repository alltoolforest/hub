import { PDFDocument } from '../fortress/src/core/pdf-lib.js';
import { loadPdfjs } from '../fortress/src/rendering/pdfjs.js';
import { TesseractOcrProvider } from './tesseract-provider.js';
import { assessFlatBackground,estimateTextColor,reconstructBackground } from './background-safety.js';
import { computeOcrRenderPlan } from './render-budget.js';
import { groupOcrWords,targetsForGranularity } from './layout-model.js';
import { inferScannedTextStyle,cssFont } from './style-match.js';

function button(label,className=''){const b=document.createElement('button');b.type='button';b.textContent=label;b.className=className;return b;}
function canvasBlob(canvas,type='image/jpeg',quality=.9){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode the edited scan.')),type,quality));}
function canvasRegionBlob(canvas,rect,type='image/png',quality=.92){
  const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y));
  const width=Math.max(1,Math.min(canvas.width-x,Math.ceil(rect.width))),height=Math.max(1,Math.min(canvas.height-y,Math.ceil(rect.height)));
  const patch=document.createElement('canvas');patch.width=width;patch.height=height;patch.getContext('2d').drawImage(canvas,x,y,width,height,0,0,width,height);
  return new Promise((resolve,reject)=>patch.toBlob(blob=>{patch.width=1;patch.height=1;blob?resolve(blob):reject(new Error('Could not encode the edited scan patch.'));},type,quality));
}
async function blobBytes(blob){return new Uint8Array(await blob.arrayBuffer());}
function safeName(name){const base=String(name||'document.pdf').replace(/\.pdf$/i,'');return `${base}-edited-scan.pdf`;}
function boxesOverlap(a,b){return a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;}
function medianNumber(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function groupReplacementStyle(baseCtx,target,bg){
  if(target.type==='word')return {safe:true,style:inferScannedTextStyle(baseCtx,target.bbox,target.text,bg,target.style||{})};
  const members=(target.words||[]).filter(w=>/[A-Za-z]{2,}/.test(String(w.text||''))&&String(w.text||'').length>=3);
  if(!members.length)return {safe:true,style:inferScannedTextStyle(baseCtx,target.bbox,target.text,bg,target.style||{})};
  const styles=members.map(w=>inferScannedTextStyle(baseCtx,w.bbox,w.text,bg,w.style||{}));
  const families=new Map();for(const st of styles)families.set(st.family,(families.get(st.family)||0)+1);
  const [family,familyCount]=[...families.entries()].sort((a,b)=>b[1]-a[1])[0];
  const weights=styles.map(st=>st.weight||400),minWeight=Math.min(...weights),maxWeight=Math.max(...weights);
  const heights=members.map(w=>Math.max(1,w.bbox.y1-w.bbox.y0));
  const medianHeight=medianNumber(heights),minHeight=Math.min(...heights),maxHeight=Math.max(...heights);
  const familyShare=familyCount/styles.length;
  if(familyShare<.85||maxWeight-minWeight>=200||maxHeight>medianHeight*1.25||minHeight<medianHeight*.68)return {safe:false,reason:'OCR_MIXED_STYLE_GROUP_UNSAFE'};
  const union=inferScannedTextStyle(baseCtx,target.bbox,target.text,bg,target.style||{});
  return {safe:true,style:{...union,family,weight:medianNumber(weights),italic:false}};
}

function makeOcrInputCanvas(source){
  const out=document.createElement('canvas');out.width=source.width;out.height=source.height;
  const src=source.getContext('2d',{willReadFrequently:true}),dst=out.getContext('2d',{willReadFrequently:true});
  const image=src.getImageData(0,0,source.width,source.height),d=image.data;
  let sum=0,n=0,dark=0;const stride=Math.max(4,Math.floor(Math.sqrt((source.width*source.height)/45000)));
  for(let y=0;y<source.height;y+=stride)for(let x=0;x<source.width;x+=stride){const i=(y*source.width+x)*4,l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];sum+=l;n++;if(l<140)dark++;}
  const mean=sum/Math.max(1,n),darkFraction=dark/Math.max(1,n),invert=mean<118||darkFraction>.50;
  for(let i=0;i<d.length;i+=4){let g=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];g=Math.max(0,Math.min(255,(g-128)*1.18+128));if(invert)g=255-g;d[i]=d[i+1]=d[i+2]=g;}
  dst.putImageData(image,0,0);return {canvas:out,inverted:invert,meanLuminance:mean,darkFraction};
}

function wrapText(ctx,text,maxWidth){
  const words=String(text).split(/\s+/).filter(Boolean),lines=[];let line='';
  for(const word of words){const trial=line?`${line} ${word}`:word;if(!line||ctx.measureText(trial).width<=maxWidth)line=trial;else{lines.push(line);line=word;}}
  if(line)lines.push(line);return lines.length?lines:[''];
}
function fitReplacement(ctx,target,text,style){
  const bb=target.bbox,width=Math.max(4,bb.x1-bb.x0),height=Math.max(5,bb.y1-bb.y0);
  const memberHeights=(target.words||[]).map(w=>w.bbox.y1-w.bbox.y0).filter(v=>v>0).sort((a,b)=>a-b);
  const medianH=memberHeights.length?memberHeights[Math.floor(memberHeights.length/2)]:height;
  const initial=Math.max(7,medianH*1.15),min=Math.max(6,initial*.54);
  for(let fontPx=initial;fontPx>=min;fontPx-=.5){
    ctx.font=cssFont(style,fontPx);let lines;
    if(target.type==='paragraph')lines=wrapText(ctx,text,width*1.02);else lines=[text];
    const lineHeight=fontPx*1.16;
    const measured=Math.max(0,...lines.map(line=>ctx.measureText(line).width));
    if(measured<=width*1.10&&lines.length*lineHeight<=height*1.18)return {fontPx,lines,lineHeight};
  }
  return null;
}

async function drawBlobToCanvas(blob,canvas){
  if(globalThis.createImageBitmap){const bitmap=await createImageBitmap(blob);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return;}
  const url=URL.createObjectURL(blob);try{await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);resolve();};img.onerror=reject;img.src=url;});}finally{URL.revokeObjectURL(url);}
}

export function createScannedPdfEditor({container,onStatus=()=>{},onWarning=()=>{},onError=()=>{},onExport=()=>{},onClose=()=>{},allowGroupedEditing=false}={}){
  if(!container)throw new Error('OCR editor container is required.');
  let sourceBytes=null,sourceName='document.pdf',pdf=null,pageCount=0,pageIndex=0,destroyed=false,selectedTarget=null,granularity='word';
  const pages=new Map();
  const provider=new TesseractOcrProvider({onProgress:({status,progress})=>onStatus(progress==null?`OCR: ${status}`:`OCR: ${status} ${Math.round(progress*100)}%`)});

  const root=document.createElement('div');root.className='ocr-editor';
  const toolbar=document.createElement('div');toolbar.className='ocr-toolbar';
  const prev=button('Previous'),next=button('Next'),run=button('Run OCR','primary'),save=button('Save a copy','primary'),close=button('Close');
  const pageLabel=document.createElement('span');pageLabel.className='ocr-page-label';
  const mode=document.createElement('select');mode.className='ocr-granularity';mode.setAttribute('aria-label','OCR edit selection');
  const granularities=allowGroupedEditing?[['word','Word'],['line','Line'],['paragraph','Paragraph']]:[['word','Word']];
  for(const [value,label] of granularities){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}
  mode.hidden=!allowGroupedEditing;
  toolbar.append(prev,pageLabel,next,mode,run,save,close);
  const editbar=document.createElement('div');editbar.className='ocr-editbar';editbar.hidden=true;
  const oldLabel=document.createElement('span');oldLabel.className='ocr-old-text';
  const input=document.createElement('textarea');input.rows=2;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Replacement OCR text');
  const apply=button('Apply change','primary'),remove=button('Delete text'),cancel=button('Cancel');
  editbar.append(oldLabel,input,apply,remove,cancel);
  const stage=document.createElement('div');stage.className='ocr-stage';root.append(toolbar,editbar,stage);container.replaceChildren(root);

  function updateToolbar(){pageLabel.textContent=`Page ${pageIndex+1} of ${pageCount||1}`;prev.disabled=pageIndex<=0;next.disabled=pageIndex>=pageCount-1;save.disabled=![...pages.values()].some(p=>p.edited);}
  function cancelEdit(){selectedTarget=null;editbar.hidden=true;input.value='';}
  function releaseCanvas(canvas){if(canvas){canvas.width=1;canvas.height=1;}}

  async function freezeOtherPages(exceptIndex){
    for(const [idx,state] of pages){if(idx===exceptIndex||!state.canvas)continue;
      if(state.edited){state.editedBlob=await canvasBlob(state.canvas,'image/jpeg',.88);state.pixelWidth=state.canvas.width;state.pixelHeight=state.canvas.height;}
      releaseCanvas(state.canvas);releaseCanvas(state.base);state.canvas=null;state.base=null;state.overlay=null;
      if(!state.edited&&!state.words)pages.delete(idx);
    }
  }

  async function createPageState(index){
    const page=await pdf.getPage(index+1),unit=page.getViewport({scale:1}),plan=computeOcrRenderPlan(unit.width,unit.height),viewport=page.getViewport({scale:plan.scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.className='ocr-canvas';
    const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport}).promise;
    const base=document.createElement('canvas');base.width=canvas.width;base.height=canvas.height;base.getContext('2d').drawImage(canvas,0,0);
    const annotations=await page.getAnnotations({intent:'display'});
    return {pageNumber:index+1,canvas,base,words:null,layout:null,edited:false,edits:[],editedBlob:null,annotationCount:annotations.length,renderPlan:plan,pixelWidth:canvas.width,pixelHeight:canvas.height};
  }

  async function hydrateState(index){
    let state=pages.get(index);
    if(!state){state=await createPageState(index);pages.set(index,state);return state;}
    if(state.canvas)return state;
    const fresh=await createPageState(index);state.canvas=fresh.canvas;state.base=fresh.base;state.renderPlan=fresh.renderPlan;state.pixelWidth=fresh.pixelWidth;state.pixelHeight=fresh.pixelHeight;
    if(state.editedBlob)await drawBlobToCanvas(state.editedBlob,state.canvas);
    return state;
  }

  function rebuildLayout(state){state.layout=groupOcrWords(state.words||[]);}
  function renderOverlay(state){
    if(!state.overlay)return;state.overlay.replaceChildren();
    for(const target of targetsForGranularity(state.layout,granularity))state.overlay.append(targetButton(target,state));
  }
  function targetButton(target,state){
    const b=button(target.text,'ocr-word');const w=state.canvas.width,h=state.canvas.height,bb=target.bbox;
    b.style.left=`${bb.x0/w*100}%`;b.style.top=`${bb.y0/h*100}%`;b.style.width=`${Math.max(.35,(bb.x1-bb.x0)/w*100)}%`;b.style.height=`${Math.max(.4,(bb.y1-bb.y0)/h*100)}%`;
    b.title=`${target.text} (${Math.round(target.confidence||0)}% OCR confidence, ${target.type})`;
    b.addEventListener('click',()=>{selectedTarget={target,state};oldLabel.textContent=`Replace ${target.type} “${target.text}”`;input.value=target.text;editbar.hidden=false;input.focus();input.select();});return b;
  }

  async function renderPage(index){
    cancelEdit();await freezeOtherPages(index);stage.replaceChildren();pageIndex=index;updateToolbar();onStatus(`Rendering scanned page ${index+1}…`);
    const state=await hydrateState(index);
    const wrap=document.createElement('div');wrap.className='ocr-page-wrap';wrap.append(state.canvas);const overlay=document.createElement('div');overlay.className='ocr-overlay';wrap.append(overlay);state.overlay=overlay;renderOverlay(state);stage.append(wrap);
    const memory=Math.round((state.renderPlan?.estimatedWorkingBytes||0)/1048576);
    onStatus(state.words?`${state.words.length} OCR words detected. ${granularity} editing active. Working canvas ~${memory} MB.`:`Scanned page ready at ${state.pixelWidth}×${state.pixelHeight}. Run OCR to detect editable text. Working canvas ~${memory} MB.`);
  }

  async function runOcr(){
    const state=pages.get(pageIndex);if(!state?.base)return;run.disabled=true;
    try{
      onStatus(`Running OCR on page ${pageIndex+1}…`);const pre=makeOcrInputCanvas(state.base);
      const result=await provider.recognize(pre.canvas,{minConfidence:45});releaseCanvas(pre.canvas);
      state.words=result.words;state.layout=result.layout;renderOverlay(state);
      onStatus(`${state.words.length} OCR words detected. ${pre.inverted?'Dark-page OCR normalization used. ':''}${allowGroupedEditing?'Choose Word, Line, or Paragraph and click text to edit.':'Click a recognized word to edit.'}`);
      if(!state.words.length)onWarning({code:'OCR_NO_TEXT',message:'No reliable text was detected on this scanned page.'});
    }catch(error){onError(error);onStatus(error?.message||'OCR failed on this page.');}finally{run.disabled=false;}
  }

  function removeWordsInside(state,bbox){state.words=(state.words||[]).filter(w=>!boxesOverlap(w.bbox,bbox));}
  function addSyntheticWord(state,text,bbox,confidence=100){if(!text)return;state.words.push({text,confidence,pageNum:pageIndex+1,blockNum:9999,parNum:9999,lineNum:9999,wordNum:state.words.length+1,key:`edited:${Date.now()}`,bbox:{...bbox}});}

  function applyReplacement(forceDelete=false){
    if(!selectedTarget)return;const replacement=forceDelete?'':input.value.trim();const {target,state}=selectedTarget;
    const baseCtx=state.base.getContext('2d',{willReadFrequently:true}),workCtx=state.canvas.getContext('2d',{willReadFrequently:true});
    const safety=assessFlatBackground(baseCtx,target.bbox);
    if(!safety.safe){onWarning({code:safety.reason,message:'This scanned text is on a complex background that cannot be reconstructed safely yet.'});return;}
    const bb=target.bbox,pad=Math.max(2,Math.round((bb.y1-bb.y0)*.09));
    const x=Math.max(0,Math.floor(bb.x0-pad)),y=Math.max(0,Math.floor(bb.y0-pad));
    const eraseWidth=Math.min(state.canvas.width-x,Math.ceil(bb.x1-bb.x0+pad*2)),eraseHeight=Math.min(state.canvas.height-y,Math.ceil(bb.y1-bb.y0+pad*2));
    const eraseRect={x,y,width:eraseWidth,height:eraseHeight},bg=safety.fillColor,color=estimateTextColor(baseCtx,bb,bg);
    const styleCheck=groupReplacementStyle(baseCtx,target,bg);
    if(replacement&&!styleCheck.safe){onWarning({code:styleCheck.reason,message:'This line or paragraph uses mixed text styles. Edit the individual words instead to preserve the scan faithfully.'});return;}
    const style=styleCheck.style;
    let fitted=null;if(replacement){fitted=fitReplacement(workCtx,target,replacement,style);if(!fitted){onWarning({code:'OCR_TEXT_TOO_WIDE',message:'The replacement cannot fit this scanned-text region safely.'});return;}}
    workCtx.save();reconstructBackground(workCtx,baseCtx,safety,eraseRect);
    if(replacement){workCtx.fillStyle=`rgb(${color.r} ${color.g} ${color.b})`;workCtx.font=cssFont(style,fitted.fontPx);workCtx.textBaseline='alphabetic';const baselineStart=bb.y0+fitted.fontPx;for(let i=0;i<fitted.lines.length;i++)workCtx.fillText(fitted.lines[i],bb.x0,baselineStart+i*fitted.lineHeight);}
    workCtx.restore();
    state.edited=true;state.editedBlob=null;state.edits.push({type:target.type,oldText:target.text,newText:replacement,bbox:{...bb},patchRect:{...eraseRect},confidence:target.confidence,style,tone:safety.tone});
    removeWordsInside(state,bb);addSyntheticWord(state,replacement,bb,target.confidence);rebuildLayout(state);cancelEdit();renderOverlay(state);updateToolbar();onStatus(replacement?'Scanned text changed locally. Save a copy when finished.':'Scanned text removed locally. Save a copy when finished.');
  }

  async function exportCopy(){
    if(!sourceBytes)return;const edited=[...pages.entries()].filter(([,s])=>s.edited);if(!edited.length){onWarning({code:'OCR_NO_EDITS',message:'No scanned-text changes have been made yet.'});return;}
    save.disabled=true;
    try{
      onStatus('Building size-controlled edited scanned PDF…');const sourceDoc=await PDFDocument.load(sourceBytes.slice(),{ignoreEncryption:true,updateMetadata:false});const doc=await PDFDocument.create();
      const editedMap=new Map(edited);
      for(let idx=0;idx<pageCount;idx++){
        const [copied]=await doc.copyPages(sourceDoc,[idx]);doc.addPage(copied);
        const state=editedMap.get(idx);if(!state)continue;
        if(!state.canvas)await hydrateState(idx);
        const size=copied.getSize(),sx=size.width/state.canvas.width,sy=size.height/state.canvas.height;
        for(const edit of state.edits){
          const rect=edit.patchRect||{x:edit.bbox.x0,y:edit.bbox.y0,width:edit.bbox.x1-edit.bbox.x0,height:edit.bbox.y1-edit.bbox.y0};
          const patchBlob=await canvasRegionBlob(state.canvas,rect,'image/png');
          const patch=await doc.embedPng(await blobBytes(patchBlob));
          copied.drawImage(patch,{x:rect.x*sx,y:size.height-(rect.y+rect.height)*sy,width:rect.width*sx,height:rect.height*sy});
        }
      }
      const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));const verify=await PDFDocument.load(bytes.slice(),{ignoreEncryption:true,updateMetadata:false});if(verify.getPageCount()!==pageCount)throw new Error('OCR export page-count validation failed.');
      const blob=new Blob([bytes],{type:'application/pdf'});onExport({blob,bytes,filename:safeName(sourceName),mode:'ocr-scan',edits:edited.reduce((n,[,s])=>n+s.edits.length,0)});onStatus(`Edited scanned PDF validated — ${(bytes.length/1048576).toFixed(2)} MB download ready.`);
    }catch(error){onError(error);onStatus(error?.message||'Could not save this scanned PDF safely.');}finally{updateToolbar();}
  }

  async function open(file){sourceName=file?.name||'document.pdf';sourceBytes=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());const pdfjs=await loadPdfjs();const task=pdfjs.getDocument({data:sourceBytes.slice(),isEvalSupported:false,useWorkerFetch:false});pdf=await task.promise;pageCount=pdf.numPages;if(!pageCount)throw new Error('This PDF has no pages.');await renderPage(0);return getState();}
  function getState(){return {mode:'ocr-scan',pageIndex,pageCount,granularity,allowGroupedEditing,editedPages:[...pages.entries()].filter(([,s])=>s.edited).map(([i])=>i),editCount:[...pages.values()].reduce((n,s)=>n+s.edits.length,0),renderPlans:[...pages.entries()].map(([i,s])=>({pageIndex:i,...s.renderPlan}))};}
  async function destroy(){if(destroyed)return;destroyed=true;cancelEdit();try{await provider.terminate();}catch{}try{await pdf?.destroy?.();}catch{}for(const state of pages.values()){releaseCanvas(state.canvas);releaseCanvas(state.base);}pages.clear();container.replaceChildren();}

  prev.addEventListener('click',()=>pageIndex>0&&renderPage(pageIndex-1));next.addEventListener('click',()=>pageIndex<pageCount-1&&renderPage(pageIndex+1));run.addEventListener('click',runOcr);save.addEventListener('click',exportCopy);close.addEventListener('click',async()=>{await destroy();onClose();});
  apply.addEventListener('click',()=>applyReplacement(false));remove.addEventListener('click',()=>applyReplacement(true));cancel.addEventListener('click',cancelEdit);mode.addEventListener('change',()=>{granularity=mode.value;const state=pages.get(pageIndex);if(state?.layout)renderOverlay(state);onStatus(`${granularity[0].toUpperCase()+granularity.slice(1)} selection enabled.`);});
  input.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();applyReplacement(false);}else if(event.key==='Escape'){event.preventDefault();cancelEdit();}});
  updateToolbar();return {open,destroy,getState,runOcr:()=>runOcr(),save:()=>exportCopy()};
}
