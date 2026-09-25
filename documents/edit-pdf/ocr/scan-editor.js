import { PDFDocument } from '../fortress/src/core/pdf-lib.js';
import { loadPdfjs } from '../fortress/src/rendering/pdfjs.js';
import { TesseractOcrProvider } from './tesseract-provider.js';
import { assessFlatBackground,estimateTextColor } from './background-safety.js';

function button(label,className=''){
  const b=document.createElement('button');
  b.type='button';
  b.textContent=label;
  b.className=className;
  return b;
}

function canvasToPngBytes(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(async blob=>{
    if(!blob)return reject(new Error('Could not encode the edited scan.'));
    resolve(new Uint8Array(await blob.arrayBuffer()));
  },'image/png'));
}

function safeName(name){
  const base=String(name||'document.pdf').replace(/\.pdf$/i,'');
  return `${base}-edited-scan.pdf`;
}

export function createScannedPdfEditor({container,onStatus=()=>{},onWarning=()=>{},onError=()=>{},onExport=()=>{},onClose=()=>{}}={}){
  if(!container)throw new Error('OCR editor container is required.');

  let sourceBytes=null;
  let sourceName='document.pdf';
  let pdf=null;
  let pageCount=0;
  let pageIndex=0;
  let destroyed=false;
  let selectedWord=null;
  const pages=new Map();

  const provider=new TesseractOcrProvider({
    onProgress:({status,progress})=>onStatus(progress==null?`OCR: ${status}`:`OCR: ${status} ${Math.round(progress*100)}%`),
  });

  const root=document.createElement('div');
  root.className='ocr-editor';
  const toolbar=document.createElement('div');
  toolbar.className='ocr-toolbar';
  const prev=button('Previous');
  const next=button('Next');
  const run=button('Run OCR','primary');
  const save=button('Save a copy','primary');
  const close=button('Close');
  const pageLabel=document.createElement('span');
  pageLabel.className='ocr-page-label';
  toolbar.append(prev,pageLabel,next,run,save,close);

  const editbar=document.createElement('div');
  editbar.className='ocr-editbar';
  editbar.hidden=true;
  const oldLabel=document.createElement('span');
  oldLabel.className='ocr-old-text';
  const input=document.createElement('input');
  input.type='text';
  input.autocomplete='off';
  input.spellcheck=false;
  input.setAttribute('aria-label','Replacement OCR text');
  const apply=button('Apply change','primary');
  const cancel=button('Cancel');
  editbar.append(oldLabel,input,apply,cancel);

  const stage=document.createElement('div');
  stage.className='ocr-stage';
  root.append(toolbar,editbar,stage);
  container.replaceChildren(root);

  function updateToolbar(){
    pageLabel.textContent=`Page ${pageIndex+1} of ${pageCount||1}`;
    prev.disabled=pageIndex<=0;
    next.disabled=pageIndex>=pageCount-1;
    save.disabled=![...pages.values()].some(p=>p.edited);
  }

  function cancelEdit(){
    selectedWord=null;
    editbar.hidden=true;
    input.value='';
  }

  function wordButton(word,state){
    const b=button(word.text,'ocr-word');
    const w=state.canvas.width,h=state.canvas.height,bb=word.bbox;
    b.style.left=`${bb.x0/w*100}%`;
    b.style.top=`${bb.y0/h*100}%`;
    b.style.width=`${Math.max(.35,(bb.x1-bb.x0)/w*100)}%`;
    b.style.height=`${Math.max(.4,(bb.y1-bb.y0)/h*100)}%`;
    b.title=`${word.text} (${Math.round(word.confidence)}% OCR confidence)`;
    b.addEventListener('click',()=>{
      selectedWord={word,state,button:b};
      oldLabel.textContent=`Replace “${word.text}”`;
      input.value=word.text;
      editbar.hidden=false;
      input.focus();
      input.select();
    });
    return b;
  }

  async function renderPage(index){
    cancelEdit();
    stage.replaceChildren();
    pageIndex=index;
    updateToolbar();
    let state=pages.get(index);

    if(!state){
      onStatus(`Rendering scanned page ${index+1}…`);
      const page=await pdf.getPage(index+1);
      const viewport=page.getViewport({scale:2.15});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      canvas.className='ocr-canvas';
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      await page.render({canvasContext:ctx,viewport}).promise;
      const base=document.createElement('canvas');
      base.width=canvas.width;
      base.height=canvas.height;
      base.getContext('2d').drawImage(canvas,0,0);
      state={page,canvas,base,words:null,edited:false,edits:[]};
      pages.set(index,state);
    }

    const wrap=document.createElement('div');
    wrap.className='ocr-page-wrap';
    wrap.append(state.canvas);
    const overlay=document.createElement('div');
    overlay.className='ocr-overlay';
    wrap.append(overlay);
    state.overlay=overlay;
    if(state.words)for(const word of state.words)overlay.append(wordButton(word,state));
    stage.append(wrap);
    onStatus(state.words?`${state.words.length} OCR words detected. Click a word to edit.`:'Scanned page ready. Run OCR to detect editable words.');
  }

  async function runOcr(){
    const state=pages.get(pageIndex);
    if(!state)return;
    run.disabled=true;
    try{
      onStatus(`Running OCR on page ${pageIndex+1}…`);
      const result=await provider.recognize(state.base,{minConfidence:45});
      state.words=result.words;
      await renderPage(pageIndex);
      if(!state.words.length)onWarning({code:'OCR_NO_TEXT',message:'No reliable text was detected on this scanned page.'});
    }catch(error){
      onError(error);
      onStatus(error?.message||'OCR failed on this page.');
    }finally{
      run.disabled=false;
    }
  }

  function restoreWordArea(state,bb,pad){
    const x=Math.max(0,Math.floor(bb.x0-pad));
    const y=Math.max(0,Math.floor(bb.y0-pad));
    const width=Math.min(state.canvas.width-x,Math.ceil(bb.x1-bb.x0+pad*2));
    const height=Math.min(state.canvas.height-y,Math.ceil(bb.y1-bb.y0+pad*2));
    state.canvas.getContext('2d').drawImage(state.base,x,y,width,height,x,y,width,height);
  }

  function applyReplacement(){
    if(!selectedWord)return;
    const replacement=input.value.trim();
    if(!replacement){
      onWarning({code:'OCR_EMPTY_REPLACEMENT',message:'Replacement text cannot be empty in this first OCR editing version.'});
      return;
    }

    const {word,state,button:b}=selectedWord;
    const baseCtx=state.base.getContext('2d',{willReadFrequently:true});
    const workCtx=state.canvas.getContext('2d',{willReadFrequently:true});
    const safety=assessFlatBackground(baseCtx,word.bbox);
    if(!safety.safe){
      onWarning({code:safety.reason,message:'This scanned text is on a complex background or boundary, so it was not changed.'});
      return;
    }

    const bb=word.bbox;
    const pad=Math.max(2,Math.round((bb.y1-bb.y0)*.10));
    const bg=safety.fillColor;
    const color=estimateTextColor(baseCtx,bb,bg);
    const x=Math.max(0,Math.floor(bb.x0-pad));
    const y=Math.max(0,Math.floor(bb.y0-pad));
    const eraseWidth=Math.min(state.canvas.width-x,Math.ceil(bb.x1-bb.x0+pad*2));
    const eraseHeight=Math.min(state.canvas.height-y,Math.ceil(bb.y1-bb.y0+pad*2));

    workCtx.save();
    workCtx.fillStyle=`rgb(${bg.r} ${bg.g} ${bg.b})`;
    workCtx.fillRect(x,y,eraseWidth,eraseHeight);
    const originalHeight=Math.max(7,bb.y1-bb.y0);
    let fontPx=Math.max(7,originalHeight*.88);
    workCtx.font=`${fontPx}px Arial,Helvetica,sans-serif`;
    let width=workCtx.measureText(replacement).width;
    const maxWidth=Math.max(6,(bb.x1-bb.x0)*1.12);
    if(width>maxWidth){
      fontPx=Math.max(6,fontPx*(maxWidth/width));
      workCtx.font=`${fontPx}px Arial,Helvetica,sans-serif`;
      width=workCtx.measureText(replacement).width;
    }

    if(width>maxWidth*1.03||fontPx<originalHeight*.55){
      workCtx.restore();
      restoreWordArea(state,bb,pad);
      onWarning({code:'OCR_TEXT_TOO_WIDE',message:'The replacement is too wide to fit this scanned-text region safely.'});
      return;
    }

    workCtx.fillStyle=`rgb(${color.r} ${color.g} ${color.b})`;
    workCtx.textBaseline='alphabetic';
    workCtx.fillText(replacement,bb.x0,bb.y1-Math.max(1,originalHeight*.10));
    workCtx.restore();

    state.edited=true;
    state.edits.push({oldText:word.text,newText:replacement,bbox:{...bb},confidence:word.confidence});
    word.text=replacement;
    b.textContent=replacement;
    b.title=`${replacement} (edited OCR text)`;
    cancelEdit();
    updateToolbar();
    onStatus('Scanned text changed locally. Save a copy when finished.');
  }

  async function exportCopy(){
    if(!sourceBytes)return;
    const edited=[...pages.entries()].filter(([,s])=>s.edited);
    if(!edited.length){
      onWarning({code:'OCR_NO_EDITS',message:'No scanned-text changes have been made yet.'});
      return;
    }

    save.disabled=true;
    try{
      onStatus('Building edited scanned PDF…');
      const doc=await PDFDocument.load(sourceBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
      for(const [idx,state] of edited){
        const pngBytes=await canvasToPngBytes(state.canvas);
        const image=await doc.embedPng(pngBytes);
        const page=doc.getPage(idx);
        const size=page.getSize();
        page.drawImage(image,{x:0,y:0,width:size.width,height:size.height});
      }
      const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
      const verify=await PDFDocument.load(bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
      if(verify.getPageCount()!==pageCount)throw new Error('OCR export page-count validation failed.');
      const blob=new Blob([bytes],{type:'application/pdf'});
      onExport({blob,bytes,filename:safeName(sourceName),mode:'ocr-scan',edits:edited.reduce((n,[,s])=>n+s.edits.length,0)});
      onStatus('Edited scanned PDF validated — download ready.');
    }catch(error){
      onError(error);
      onStatus(error?.message||'Could not save this scanned PDF safely.');
    }finally{
      updateToolbar();
    }
  }

  async function open(file){
    sourceName=file?.name||'document.pdf';
    sourceBytes=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());
    const pdfjs=await loadPdfjs();
    const task=pdfjs.getDocument({data:sourceBytes.slice(),isEvalSupported:false,useWorkerFetch:false});
    pdf=await task.promise;
    pageCount=pdf.numPages;
    if(!pageCount)throw new Error('This PDF has no pages.');
    await renderPage(0);
    return getState();
  }

  function getState(){
    return {
      mode:'ocr-scan',
      pageIndex,
      pageCount,
      editedPages:[...pages.entries()].filter(([,s])=>s.edited).map(([i])=>i),
      editCount:[...pages.values()].reduce((n,s)=>n+s.edits.length,0),
    };
  }

  async function destroy(){
    if(destroyed)return;
    destroyed=true;
    cancelEdit();
    try{await provider.terminate();}catch{}
    try{await pdf?.destroy?.();}catch{}
    pages.clear();
    container.replaceChildren();
  }

  prev.addEventListener('click',()=>pageIndex>0&&renderPage(pageIndex-1));
  next.addEventListener('click',()=>pageIndex<pageCount-1&&renderPage(pageIndex+1));
  run.addEventListener('click',runOcr);
  save.addEventListener('click',exportCopy);
  close.addEventListener('click',async()=>{await destroy();onClose();});
  apply.addEventListener('click',applyReplacement);
  cancel.addEventListener('click',cancelEdit);
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();applyReplacement();}
    else if(event.key==='Escape'){event.preventDefault();cancelEdit();}
  });
  updateToolbar();

  return {open,destroy,getState,runOcr:()=>runOcr(),save:()=>exportCopy()};
}
