import { renderAddedText } from './added-text.js';
import { PDFDocument } from '../fortress/src/core/pdf-lib.js';
import { loadPdfjs } from '../fortress/src/rendering/pdfjs.js';
import { TesseractOcrProvider } from './tesseract-provider.js';
import { assessFlatBackground,estimateTextColor,reconstructBackground } from './background-safety.js';
import { computeOcrRenderPlan } from './render-budget.js';
import { groupOcrWords,targetsForGranularity } from './layout-model.js';
import { inferScannedTextStyle,cssFont,fitScannedWord } from './style-match.js';

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
  if(target.type==='word')return {safe:true,style:inferScannedTextStyle(baseCtx,target.bbox,target.sourceText||target.text,bg,target.style||{})};
  const members=(target.words||[]).filter(w=>/[A-Za-z]{2,}/.test(String(w.text||''))&&String(w.text||'').length>=3);
  if(!members.length)return {safe:true,style:inferScannedTextStyle(baseCtx,target.bbox,target.sourceText||target.text,bg,target.style||{})};
  const styles=members.map(w=>inferScannedTextStyle(baseCtx,w.bbox,w.text,bg,w.style||{}));
  const families=new Map();for(const st of styles)families.set(st.family,(families.get(st.family)||0)+1);
  const [family,familyCount]=[...families.entries()].sort((a,b)=>b[1]-a[1])[0];
  const weights=styles.map(st=>st.weight||400),minWeight=Math.min(...weights),maxWeight=Math.max(...weights);
  const heights=members.map(w=>Math.max(1,w.bbox.y1-w.bbox.y0));
  const medianHeight=medianNumber(heights),minHeight=Math.min(...heights),maxHeight=Math.max(...heights);
  const familyShare=familyCount/styles.length;
  if(familyShare<.85||maxWeight-minWeight>=200||maxHeight>medianHeight*1.25||minHeight<medianHeight*.68)return {safe:false,reason:'OCR_MIXED_STYLE_GROUP_UNSAFE'};
  const union=inferScannedTextStyle(baseCtx,target.bbox,target.sourceText||target.text,bg,target.style||{});
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
function fitReplacement(ctx,target,text,style,rect){
  if(target.type==='word'&&style.fontPx)return fitScannedWord(ctx,text,style,rect);
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
  let sourceBytes=null,sourceName='document.pdf',pdf=null,pageCount=0,pageIndex=0,destroyed=false,selectedTarget=null,granularity='word',ocrBusy=false;
  const pages=new Map();
  let placingText=false,pickerTargets=[];
  const reportStatus=onStatus,reportWarning=onWarning,reportError=onError;
  onStatus=message=>{status.textContent=message;status.dataset.kind='status';reportStatus(message);};
  onWarning=warning=>{status.textContent=warning.message||warning.code;status.dataset.kind='warning';reportWarning(warning);};
  onError=error=>{status.textContent=error?.message||'The scanned-page operation failed. Please try again.';status.dataset.kind='warning';reportError(error);};
  let loadingTask=null;
  const provider=new TesseractOcrProvider({onProgress:({status,progress})=>onStatus(progress==null?`OCR: ${status}`:`OCR: ${status} ${Math.round(progress*100)}%`)});

  const root=document.createElement('div');root.className='ocr-editor';
  const toolbar=document.createElement('div');toolbar.className='ocr-toolbar';
  const prev=button('Previous'),next=button('Next'),run=button('Run OCR','primary'),save=button('Save a copy','primary'),close=button('Close');
  const pageLabel=document.createElement('span');pageLabel.className='ocr-page-label';
  const mode=document.createElement('select');mode.className='ocr-granularity';mode.setAttribute('aria-label','OCR edit selection');
  const granularities=allowGroupedEditing?[['word','Word'],['line','Line'],['paragraph','Paragraph']]:[['word','Word']];
  for(const [value,label] of granularities){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}
  mode.hidden=!allowGroupedEditing;
  const add=button('Add text');add.setAttribute('aria-pressed','false');
  toolbar.append(prev,pageLabel,next,mode,run,add,save,close);
  const status=document.createElement('p');status.className='ocr-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const picker=document.createElement('select');picker.className='ocr-text-picker';picker.setAttribute('aria-label','Choose text to edit');picker.hidden=true;
  const editbar=document.createElement('div');editbar.className='ocr-editbar';editbar.hidden=true;
  const oldLabel=document.createElement('span');oldLabel.className='ocr-old-text';
  const input=document.createElement('textarea');input.rows=2;input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label','Replacement OCR text');
  const apply=button('Apply change','primary'),remove=button('Delete text'),cancel=button('Cancel');
  const format=document.createElement('span');format.className='ocr-add-format';format.hidden=true;
  const size=document.createElement('input');size.type='number';size.min='4';size.max='144';size.step='.5';size.value='12';size.setAttribute('aria-label','New text size in points');
  const color=document.createElement('input');color.type='color';color.value='#17211d';color.setAttribute('aria-label','New text colour');
  const sizeLabel=document.createElement('label');sizeLabel.append('Size (pt) ',size);format.append(sizeLabel,color);
  editbar.append(oldLabel,input,format,apply,remove,cancel);
  const stage=document.createElement('div');stage.className='ocr-stage';root.append(toolbar,status,picker,editbar,stage);container.replaceChildren(root);

  function updateToolbar(){pageLabel.textContent=`Page ${pageIndex+1} of ${pageCount||1}`;prev.disabled=pageIndex<=0;next.disabled=pageIndex>=pageCount-1;save.disabled=![...pages.values()].some(p=>p.edited);}
  function cancelEdit(){selectedTarget=null;placingText=false;root.classList.remove('ocr-placing');add.setAttribute('aria-pressed','false');editbar.hidden=true;format.hidden=true;input.value='';picker.value='';updateToolbar();}
  function revealEdit(){editbar.hidden=false;editbar.scrollIntoView?.({block:'nearest'});input.focus();input.select();}
  function selectTarget(target,state){
    if(ocrBusy)return;
    cancelEdit();selectedTarget={target,state};oldLabel.textContent=`Replace ${target.type} “${target.text}”`;input.value=target.text;input.setAttribute('aria-label','Replacement OCR text');remove.hidden=false;revealEdit();
  }
  function selectAddition(addition,state){
    if(ocrBusy)return;
    cancelEdit();selectedTarget={addition,state};oldLabel.textContent=addition.id?'Edit added text':'New text at selected position';input.value=addition.text||'';input.setAttribute('aria-label','New text');size.value=String(addition.fontSize||12);color.value=addition.color||'#17211d';format.hidden=false;remove.hidden=!addition.id;revealEdit();
  }
  function beginAdd(){
    if(ocrBusy||destroyed)return;
    if(selectedTarget){onWarning({code:'OCR_PENDING_EDIT',message:'Apply or cancel the current text edit first.'});return;}
    if(placingText){cancelEdit();onStatus('Text placement cancelled.');return;}
    placingText=true;root.classList.add('ocr-placing');add.setAttribute('aria-pressed','true');onStatus('Tap the page where you want to add text. OCR is not required. Tap Add text again to cancel.');
  }
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
    return {pageNumber:index+1,canvas,base,words:null,layout:null,edited:false,edits:[],additions:[],additionChanges:0,editedBlob:null,annotationCount:annotations.length,renderPlan:plan,pixelWidth:canvas.width,pixelHeight:canvas.height};
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
    pickerTargets=targetsForGranularity(state.layout,granularity);
    picker.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose text to edit…';picker.append(placeholder);
    for(const [i,target] of pickerTargets.entries()){
      state.overlay.append(targetButton(target,state));
      const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}. ${target.text}`;picker.append(option);
    }
    picker.hidden=!pickerTargets.length;
    for(const addition of state.additions){
      const {canvas,rect}=renderAddedText(addition,state),b=button('','ocr-added-text');
      b.setAttribute('aria-label',`Edit added text: ${addition.text}`);b.style.left=`${rect.x/state.pixelWidth*100}%`;b.style.top=`${rect.y/state.pixelHeight*100}%`;b.style.width=`${rect.width/state.pixelWidth*100}%`;b.style.height=`${rect.height/state.pixelHeight*100}%`;b.append(canvas);
      b.addEventListener('click',()=>selectAddition(addition,state));state.overlay.append(b);
    }
  }
  function targetButton(target,state){
    const b=button(target.text,'ocr-word');const w=state.canvas.width,h=state.canvas.height,bb=target.bbox;
    b.style.left=`${bb.x0/w*100}%`;b.style.top=`${bb.y0/h*100}%`;b.style.width=`${Math.max(.35,(bb.x1-bb.x0)/w*100)}%`;b.style.height=`${Math.max(.4,(bb.y1-bb.y0)/h*100)}%`;
    b.title=`${target.text} (${Math.round(target.confidence||0)}% OCR confidence, ${target.type})`;
    b.addEventListener('click',()=>selectTarget(target,state));return b;
  }

  async function renderPage(index){
    cancelEdit();await freezeOtherPages(index);stage.replaceChildren();pageIndex=index;updateToolbar();onStatus(`Rendering scanned page ${index+1}…`);
    const state=await hydrateState(index);
    const wrap=document.createElement('div');wrap.className='ocr-page-wrap';wrap.append(state.canvas);const overlay=document.createElement('div');overlay.className='ocr-overlay';wrap.append(overlay);state.overlay=overlay;renderOverlay(state);stage.append(wrap);
    wrap.addEventListener('click',event=>{
      if(!placingText)return;const rect=state.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const x=Math.max(0,Math.floor((event.clientX-rect.left)*state.pixelWidth/rect.width)),y=Math.max(0,Math.floor((event.clientY-rect.top)*state.pixelHeight/rect.height));
      selectAddition({x,y,text:'',fontSize:12,color:'#17211d'},state);
    });
    const memory=Math.round((state.renderPlan?.estimatedWorkingBytes||0)/1048576);
    onStatus(state.words?`${state.words.length} OCR words detected. ${granularity} editing active. Working canvas ~${memory} MB.`:`Scanned page ready at ${state.pixelWidth}×${state.pixelHeight}. Run OCR to detect editable text. Working canvas ~${memory} MB.`);
  }

  async function runOcr(){
    const state=pages.get(pageIndex);if(!state?.base||ocrBusy||destroyed)return;
    if(selectedTarget||placingText){onWarning({code:'OCR_PENDING_EDIT',message:'Apply or cancel the current text edit first.'});return;}
    ocrBusy=true;run.disabled=true;add.disabled=true;run.textContent='Running OCR…';let pre=null;
    try{
      onStatus(`Running OCR on page ${pageIndex+1}…`);pre=makeOcrInputCanvas(state.canvas);
      const result=await provider.recognize(pre.canvas,{minConfidence:45});if(destroyed)return;
      // Keep original style references for already replaced words when OCR is rerun.
      state.words=result.words.map(word=>{
        const edited=(state.words||[]).find(w=>w.sourceText&&w.text===word.text&&boxesOverlap(w.bbox,word.bbox));
        return edited?{...word,sourceText:edited.sourceText,bbox:{...edited.bbox}}:word;
      });rebuildLayout(state);renderOverlay(state);
      onStatus(`${state.words.length} OCR words detected. ${pre.inverted?'Dark-page OCR normalization used. ':''}${allowGroupedEditing?'Choose Word, Line, or Paragraph and click text to edit.':'Tap a highlighted word or use Choose text to edit.'}`);
      if(!state.words.length)onWarning({code:'OCR_NO_TEXT',message:'No reliable words were detected. You can still use Add text, or try a clearer scan and run OCR again.'});
    }catch(error){onError(error);}finally{releaseCanvas(pre?.canvas);ocrBusy=false;run.disabled=false;add.disabled=false;run.textContent='Run OCR';}
  }

  function removeWordsInside(state,bbox){state.words=(state.words||[]).filter(w=>!boxesOverlap(w.bbox,bbox));}
  function addSyntheticWord(state,text,bbox,confidence=100,sourceText=text){if(!text)return;state.words.push({text,sourceText,confidence,pageNum:pageIndex+1,blockNum:9999,parNum:9999,lineNum:9999,wordNum:state.words.length+1,key:`edited:${Date.now()}`,bbox:{...bbox}});}

  function applyAddition(forceDelete){
    const {addition,state}=selectedTarget;
    try{
      if(forceDelete){state.additions=state.additions.filter(item=>item.id!==addition.id);}
      else{
        const next={...addition,id:addition.id||`add:${Date.now()}:${state.additionChanges}`,text:input.value.trim(),fontSize:Number(size.value),color:color.value};
        const {canvas}=renderAddedText(next,state);releaseCanvas(canvas);
        const index=state.additions.findIndex(item=>item.id===next.id);if(index<0)state.additions.push(next);else state.additions[index]=next;
      }
      state.additionChanges++;state.edited=true;cancelEdit();renderOverlay(state);updateToolbar();onStatus(forceDelete?'Added text removed. Save a copy when finished.':'Text added to the scan. Tap it to edit, or save a copy.');
    }catch(error){onWarning({code:'OCR_ADD_TEXT_INVALID',message:error.message});}
  }

  function applyReplacement(forceDelete=false){
    if(selectedTarget?.addition){applyAddition(forceDelete);return;}
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
    let fitted=null;if(replacement){fitted=fitReplacement(workCtx,target,replacement,style,eraseRect);if(!fitted){onWarning({code:'OCR_TEXT_TOO_WIDE',message:'The replacement cannot fit this scanned-text region safely.'});return;}}
    workCtx.save();reconstructBackground(workCtx,baseCtx,safety,eraseRect);
    if(replacement){workCtx.fillStyle=`rgb(${color.r} ${color.g} ${color.b})`;workCtx.font=cssFont(style,fitted.fontPx);workCtx.textBaseline='alphabetic';workCtx.textAlign='left';const baselineStart=fitted.baseline??bb.y0+fitted.fontPx;for(let i=0;i<fitted.lines.length;i++)workCtx.fillText(fitted.lines[i],fitted.x??bb.x0,baselineStart+i*fitted.lineHeight);}
    workCtx.restore();
    state.edited=true;state.editedBlob=null;state.edits.push({type:target.type,oldText:target.text,newText:replacement,bbox:{...bb},patchRect:{...eraseRect},confidence:target.confidence,style,tone:safety.tone});
    removeWordsInside(state,bb);addSyntheticWord(state,replacement,bb,target.confidence,target.sourceText||target.text);rebuildLayout(state);cancelEdit();renderOverlay(state);updateToolbar();onStatus(replacement?'Scanned text changed locally. Save a copy when finished.':'Scanned text removed locally. Save a copy when finished.');
  }

  async function exportCopy(){
    if(!sourceBytes)return;
    if(selectedTarget||placingText||ocrBusy){onWarning({code:'OCR_PENDING_EDIT',message:'Apply or cancel the current edit and wait for OCR before saving.'});return;}
    const edited=[...pages.entries()].filter(([,s])=>s.edited);if(!edited.length){onWarning({code:'OCR_NO_EDITS',message:'No scanned-text changes have been made yet.'});return;}
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
        for(const addition of state.additions){
          const {canvas,rect}=renderAddedText(addition,state);
          try{const patch=await doc.embedPng(await blobBytes(await canvasBlob(canvas,'image/png')));copied.drawImage(patch,{x:rect.x*sx,y:size.height-(rect.y+rect.height)*sy,width:rect.width*sx,height:rect.height*sy});}
          finally{releaseCanvas(canvas);}
        }
      }
      const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));const verify=await PDFDocument.load(bytes.slice(),{ignoreEncryption:true,updateMetadata:false});if(verify.getPageCount()!==pageCount)throw new Error('OCR export page-count validation failed.');
      const blob=new Blob([bytes],{type:'application/pdf'});onExport({blob,bytes,filename:safeName(sourceName),mode:'ocr-scan',edits:edited.reduce((n,[,s])=>n+s.edits.length+s.additionChanges,0)});onStatus(`Edited scanned PDF validated — ${(bytes.length/1048576).toFixed(2)} MB download ready.`);
    }catch(error){onError(error);onStatus(error?.message||'Could not save this scanned PDF safely.');}finally{updateToolbar();}
  }

  async function open(file){
    if(destroyed)throw new Error('OCR session is closed.');
    sourceName=file?.name||'document.pdf';sourceBytes=file instanceof Uint8Array?file:new Uint8Array(await file.arrayBuffer());
    const pdfjs=await loadPdfjs();
    if(destroyed)throw new Error('OCR session is closed.');
    const task=pdfjs.getDocument({data:sourceBytes.slice(),isEvalSupported:false,useWorkerFetch:false});loadingTask=task;
    try{
      pdf=await task.promise;
      if(destroyed)throw new Error('OCR session is closed.');
      pageCount=pdf.numPages;if(!pageCount)throw new Error('This PDF has no pages.');
      await renderPage(0);return getState();
    }catch(error){try{await task.destroy();}catch{}if(loadingTask===task)loadingTask=null;pdf=null;throw error;}
  }
  function getState(){return {mode:'ocr-scan',busy:ocrBusy,hasPendingEdit:!!selectedTarget||placingText,pageIndex,pageCount,granularity,allowGroupedEditing,editedPages:[...pages.entries()].filter(([,s])=>s.edited).map(([i])=>i),editCount:[...pages.values()].reduce((n,s)=>n+s.edits.length+s.additionChanges,0),renderPlans:[...pages.entries()].map(([i,s])=>({pageIndex:i,...s.renderPlan}))};}
  async function destroy(){if(destroyed)return;destroyed=true;cancelEdit();try{await provider.terminate();}catch{}try{await loadingTask?.destroy();}catch{}loadingTask=null;pdf=null;sourceBytes=null;for(const state of pages.values()){releaseCanvas(state.canvas);releaseCanvas(state.base);}pages.clear();container.replaceChildren();}

  add.addEventListener('click',beginAdd);
  picker.addEventListener('change',()=>{const target=pickerTargets[Number(picker.value)];if(picker.value!==''&&target)selectTarget(target,pages.get(pageIndex));});
  prev.addEventListener('click',()=>pageIndex>0&&renderPage(pageIndex-1));next.addEventListener('click',()=>pageIndex<pageCount-1&&renderPage(pageIndex+1));run.addEventListener('click',runOcr);save.addEventListener('click',exportCopy);close.addEventListener('click',async()=>{await destroy();onClose();});
  apply.addEventListener('click',()=>applyReplacement(false));remove.addEventListener('click',()=>applyReplacement(true));cancel.addEventListener('click',cancelEdit);mode.addEventListener('change',()=>{granularity=mode.value;const state=pages.get(pageIndex);if(state?.layout)renderOverlay(state);onStatus(`${granularity[0].toUpperCase()+granularity.slice(1)} selection enabled.`);});
  input.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();applyReplacement(false);}else if(event.key==='Escape'){event.preventDefault();cancelEdit();}});
  updateToolbar();return {open,destroy,getState,runOcr:()=>runOcr(),save:()=>exportCopy()};
}
