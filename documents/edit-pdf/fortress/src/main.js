import { loadPdfForEditing } from './core/pdf-loader.js';
import { DocumentModel, getPageContentStreams } from './core/document-model.js';
import { applyDocumentSafety } from './core/classifier.js';
import { PdfRenderer, configurePdfWorker } from './rendering/renderer.js';
import { extractVisualText } from './rendering/text-layer.js';
import { buildLogicalBlocks } from './text/text-blocks.js';
import { mapBlocksToSources } from './mapping/source-mapper.js';
import { pdfRectToScreen, screenPointToPdf } from './utils/coordinates.js';
import { InlineEditor } from './editing/inline-editor.js';
import { createEditTransaction, createInsertTransaction } from './editing/edit-transaction.js';
import { History } from './editing/history.js';
import { ViewportController } from './mobile/viewport-controller.js';
import { exportEditedPdf } from './export/exporter.js';

export { configurePdfWorker };

const EDITABLE_TIERS=new Set(['DIRECT_EDIT','FONT_SUBSTITUTION']);
const isEditable=(block)=>EDITABLE_TIERS.has(block?.tier);

function lineHitBounds(line,block){
  const size=Math.max(1,line?.fontSize||block?.fontSize||12);
  const x=Number.isFinite(line?.minX)?line.minX:(block?.bounds?.x||0);
  const maxX=Number.isFinite(line?.maxX)?line.maxX:(x+(block?.bounds?.width||1));
  const baseline=Number.isFinite(line?.y)?line.y:(block?.bounds?.y||0);
  return {x,y:baseline-size*.30,width:Math.max(2,maxX-x),height:Math.max(4,size*1.18)};
}

function insertedHitBounds(tx){
  const size=Math.max(6,Number(tx.fontSize)||12);
  const lineHeight=Math.max(size,Number(tx.lineHeight)||size*1.2);
  const lineCount=Math.max(1,Number(tx._renderedLineCount)||String(tx.replacementUnicode||'').split('\n').length);
  const longest=Math.max(1,...String(tx.replacementUnicode||'').split('\n').map(s=>Array.from(s).length));
  const approxWidth=Math.max(28,Math.min(Number(tx._renderedWidth)||Number(tx.maxWidth)||300,longest*size*.58));
  const height=(lineCount-1)*lineHeight+size*1.2;
  return {x:tx.x,y:tx.y-(lineCount-1)*lineHeight-size*.28,width:approxWidth,height};
}

export function createAdvancedPdfTextEngine({container,workerUrl,onStatus=()=>{},onWarning=()=>{},onError=()=>{},onChange=()=>{},onExport=()=>{}}={}){
  if(!container)throw new Error('container is required');
  if(workerUrl)configurePdfWorker(workerUrl);
  let originalBytes=null,pdfDoc=null,model=null,renderer=null,previewRenderer=null,fileName='document.pdf',pageIndex=0,zoom=1,analysis=null;
  let previewToken=0;
  let addTextMode=false;
  const txByBlock=new Map();
  const history=new History(40);

  container.innerHTML='';
  container.classList.add('pdf-fortress-host');
  const root=document.createElement('div');root.className='pdf-fortress';
  const top=document.createElement('div');top.className='pdf-fortress-top';
  const back=button('Close','Close document');
  const name=document.createElement('div');name.className='pdf-fortress-name';name.textContent=fileName;
  const addText=button('Add text','Add new text or paragraph');
  addText.classList.add('pdf-add-text-button');
  const insertTools=document.createElement('div');insertTools.className='pdf-insert-tools';insertTools.hidden=true;
  const familySelect=document.createElement('select');familySelect.className='pdf-format-select';familySelect.setAttribute('aria-label','New text font family');
  familySelect.append(new Option('Serif','serif'),new Option('Sans','sans'));
  const sizeSelect=document.createElement('select');sizeSelect.className='pdf-format-select pdf-size-select';sizeSelect.setAttribute('aria-label','New text font size');
  for(const size of [8,10,11,12,14,16,18,20,24,28,32])sizeSelect.append(new Option(`${size} pt`,String(size),false,size===12));
  const bold=button('B','Bold new text');bold.classList.add('pdf-format-toggle');bold.setAttribute('aria-pressed','false');
  insertTools.append(familySelect,sizeSelect,bold);
  const undo=button('Undo','Undo');
  const redo=button('Redo','Redo');
  const save=button('Save a copy','Save a copy','primary');
  top.append(back,name,addText,insertTools,undo,redo,save);
  const docArea=document.createElement('div');docArea.className='pdf-fortress-doc';
  const footer=document.createElement('div');footer.className='pdf-fortress-footer';
  const prev=button('‹','Previous page');
  const pageLabel=document.createElement('span');
  const next=button('›','Next page');
  const zoomOut=button('−','Zoom out');
  const zoomIn=button('+','Zoom in');
  const status=document.createElement('div');status.className='pdf-fortress-status';status.setAttribute('role','status');
  footer.append(prev,pageLabel,next,zoomOut,zoomIn,status);
  root.append(top,docArea,footer);
  container.append(root);
  const viewportCtl=new ViewportController(docArea);
  let inline=null;
  let insertEditorCleanup=null;

  function button(text,label,kind=''){
    const b=document.createElement('button');
    b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.className=`pdf-btn ${kind==='primary'?'pdf-btn-primary':''}`;
    return b;
  }
  function setStatus(msg,kind=''){status.textContent=msg||'';status.dataset.kind=kind;onStatus(msg);}
  function updateHistory(){undo.disabled=!history.state.canUndo;redo.disabled=!history.state.canRedo;}
  function updatePageLabel(){pageLabel.textContent=pdfDoc?`${pageIndex+1} / ${pdfDoc.getPageCount()}`:'—';}
  function currentText(block){return txByBlock.get(block.id)?.replacementUnicode??block.text;}
  function newTextStyle(){return {fontFamily:familySelect.value==='sans'?'sans':'serif',fontSize:Number(sizeSelect.value)||12,bold:bold.getAttribute('aria-pressed')==='true'};}

  function setAddTextMode(enabled,{announce=true}={}){
    addTextMode=!!enabled;
    addText.classList.toggle('is-active',addTextMode);
    addText.setAttribute('aria-pressed',String(addTextMode));
    insertTools.hidden=!addTextMode;
    docArea.classList.toggle('pdf-add-text-mode',addTextMode);
    if(announce)setStatus(addTextMode?'Add Text is on — click anywhere on the PDF to place a text box.':'Click existing text to edit, or choose Add text for a new paragraph.');
  }

  async function open(file){
    try{
      setStatus('Reading document…');
      let bytes;
      if(file instanceof Uint8Array)bytes=file;
      else if(file instanceof ArrayBuffer)bytes=new Uint8Array(file);
      else{bytes=new Uint8Array(await file.arrayBuffer());fileName=file.name||fileName;}
      name.textContent=fileName;
      previewToken++;
      insertEditorCleanup?.();insertEditorCleanup=null;
      previewRenderer?.destroy();previewRenderer=null;
      renderer?.destroy();
      const loaded=await loadPdfForEditing(bytes);
      originalBytes=loaded.originalBytes;
      pdfDoc=loaded.pdfDoc;
      model=new DocumentModel(pdfDoc);
      renderer=new PdfRenderer(originalBytes);
      await renderer.load();
      pageIndex=0;zoom=1;txByBlock.clear();history.undoStack=[];history.redoStack=[];updateHistory();setAddTextMode(false,{announce:false});
      await renderPage();
      return {pageCount:loaded.pageCount,flags:model.flags};
    }catch(e){setStatus(e.message,'error');onError(e);throw e;}
  }

  async function analyzePage(index=pageIndex,{announce=true}={}){
    if(!pdfDoc)throw new Error('No PDF open');
    if(announce)setStatus('Finding editable text…');
    const visual=await extractVisualText(renderer,index);
    const blocks=buildLogicalBlocks(visual.items,{pageIndex:index,pageRotation:model.page(index).rotation});
    const streams=getPageContentStreams(pdfDoc,index);
    const mapped=mapBlocksToSources(pdfDoc,index,streams,blocks);
    const safe=applyDocumentSafety(mapped.blocks,model.flags);
    analysis={pageIndex:index,blocks:safe,sourceRuns:mapped.sourceRuns,streams};
    const editable=safe.filter(isEditable).length;
    if(announce)setStatus(editable?`${editable} editable text region${editable===1?'':'s'} — click text to edit, or use Add text`:'No safely editable existing text detected — Add text is still available');
    return analysis;
  }

  async function renderPage({announce=true}={}){
    inline?.cancel();
    insertEditorCleanup?.();insertEditorCleanup=null;
    docArea.innerHTML='';
    updatePageLabel();
    const wrap=document.createElement('div');wrap.className='pdf-page-wrap';
    const canvas=document.createElement('canvas');canvas.className='pdf-page-canvas';
    const layer=document.createElement('div');layer.className='pdf-hit-layer';
    wrap.append(canvas,layer);docArea.append(wrap);
    const displayRenderer=previewRenderer||renderer;
    const info=await displayRenderer.pageInfo(pageIndex);
    const fit=Math.min(Math.max((docArea.clientWidth-24)/Math.max(info.width,1),.25),2.5);
    const scale=fit*zoom;
    const r=await displayRenderer.render(pageIndex,canvas,{scale});
    wrap.style.width=`${r.cssWidth}px`;wrap.style.height=`${r.cssHeight}px`;layer.style.width=`${r.cssWidth}px`;layer.style.height=`${r.cssHeight}px`;
    analysis=await analyzePage(pageIndex,{announce});
    layer.__matrix=r.matrix;

    layer.addEventListener('click',(evt)=>{
      if(!addTextMode||evt.target!==layer)return;
      beginInsertEditor(layer,r.matrix,evt).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
    });

    for(const block of analysis.blocks){
      if(!isEditable(block))continue;
      const lines=block.lines?.length?block.lines:[{text:block.text,...block.bounds,minX:block.bounds?.x,maxX:(block.bounds?.x||0)+(block.bounds?.width||1),y:(block.bounds?.y||0)+(block.fontSize||12)*.3,fontSize:block.fontSize||12}];
      for(const line of lines){
        const rect=pdfRectToScreen(r.matrix,lineHitBounds(line,block));
        const hit=document.createElement('button');
        hit.type='button';
        hit.className=`pdf-hit pdf-hit-${block.tier.toLowerCase()}`;
        Object.assign(hit.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,4)}px`,height:`${Math.max(rect.height,4)}px`});
        hit.title=addTextMode?'Place new text here':'Click to edit text';
        hit.setAttribute('aria-label',`Edit text: ${currentText(block).slice(0,100)}`);
        hit.addEventListener('click',(evt)=>{
          evt.stopPropagation();
          if(addTextMode)beginInsertEditor(layer,r.matrix,evt).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
          else beginEdit(block,layer,r.matrix,evt);
        });
        layer.append(hit);
      }
    }

    for(const tx of txByBlock.values()){
      if(tx.kind!=='INSERT_TEXT'||tx.pageIndex!==pageIndex)continue;
      const rect=pdfRectToScreen(r.matrix,insertedHitBounds(tx));
      const hit=document.createElement('button');
      hit.type='button';hit.className='pdf-hit pdf-hit-inserted';hit.title=addTextMode?'Place new text here':'Click to edit added text';
      Object.assign(hit.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,12)}px`,height:`${Math.max(rect.height,12)}px`});
      hit.setAttribute('aria-label',`Edit added text: ${tx.replacementUnicode.slice(0,100)}`);
      hit.addEventListener('click',(evt)=>{
        evt.stopPropagation();
        if(addTextMode)beginInsertEditor(layer,r.matrix,evt).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
        else beginInsertEditor(layer,r.matrix,evt,tx).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
      });
      layer.append(hit);
    }
  }

  async function buildPreviewForTransactions(transactions){
    if(!transactions.length)return null;
    return exportEditedPdf(originalBytes,transactions,{validate:false});
  }

  async function replacePreviewRenderer(bytes){
    const next=new PdfRenderer(bytes);
    await next.load();
    previewRenderer?.destroy();
    previewRenderer=next;
  }

  async function refreshPreviewFromCommittedState(message='Edit applied — continue editing or Save a copy.'){
    const token=++previewToken;
    try{
      if(!txByBlock.size){
        previewRenderer?.destroy();previewRenderer=null;
        await renderPage({announce:false});
        if(token===previewToken)setStatus(message);
        return;
      }
      setStatus('Applying edits…');
      const result=await buildPreviewForTransactions([...txByBlock.values()]);
      if(token!==previewToken)return;
      await replacePreviewRenderer(result.bytes);
      if(token!==previewToken)return;
      await renderPage({announce:false});
      if(token===previewToken)setStatus(message);
    }catch(e){
      if(token===previewToken){setStatus(e.code||e.message,'error');onError(e);}
      throw e;
    }
  }

  function beginEdit(block,layer,matrix,evt){
    insertEditorCleanup?.();insertEditorCleanup=null;
    inline?.cancel();
    const existing=txByBlock.get(block.id);
    const editBlock={...block,text:existing?.replacementUnicode??block.text};
    inline=new InlineEditor(layer,{onCommit:(_b,text)=>queueEdit(block,text),onCompositionBlocked:()=>setStatus('Finish text composition before Done.','warning')});
    const rect=layer.getBoundingClientRect();
    const tap=existing?null:{x:evt.clientX-rect.left,y:evt.clientY-rect.top};
    const input=inline.begin(editBlock,matrix,tap);
    viewportCtl.watch(input);
    const done=document.createElement('button');done.className='pdf-done';done.textContent='Done';done.type='button';
    const inputLeft=input.offsetLeft,inputTop=input.offsetTop,inputWidth=input.offsetWidth,inputHeight=input.offsetHeight;
    const buttonWidth=72,gap=6;
    let doneLeft=inputLeft+inputWidth+gap;
    let doneTop=Math.max(4,inputTop);
    if(doneLeft+buttonWidth>layer.clientWidth-4){
      doneLeft=Math.min(Math.max(4,inputLeft),Math.max(4,layer.clientWidth-buttonWidth-4));
      doneTop=inputTop+inputHeight+gap;
    }
    Object.assign(done.style,{left:`${doneLeft}px`,top:`${doneTop}px`,right:'auto'});
    done.addEventListener('click',async()=>{
      done.disabled=true;
      const result=await inline.commit();
      if(result?.blocked){done.disabled=false;if(result.error)setStatus(result.error.code||result.error.message,'error');return;}
      viewportCtl.stop();done.remove();
    });
    layer.append(done);
  }

  async function beginInsertEditor(layer,matrix,evt,existingTx=null){
    evt?.preventDefault?.();
    inline?.cancel();
    insertEditorCleanup?.();insertEditorCleanup=null;
    const layerRect=layer.getBoundingClientRect();
    const style=existingTx?{fontFamily:existingTx.fontFamily,fontSize:existingTx.fontSize,bold:existingTx.bold}:newTextStyle();
    if(existingTx){
      familySelect.value=style.fontFamily||'serif';
      sizeSelect.value=String(style.fontSize||12);
      bold.setAttribute('aria-pressed',String(!!style.bold));
      bold.classList.toggle('is-active',!!style.bold);
    }
    const clickX=Math.max(4,Math.min(layer.clientWidth-4,(evt?.clientX??layerRect.left+12)-layerRect.left));
    const clickY=Math.max(4,Math.min(layer.clientHeight-4,(evt?.clientY??layerRect.top+12)-layerRect.top));
    const desiredWidth=existingTx?Math.max(180,Math.min(440,(existingTx._renderedWidth||existingTx.maxWidth||300)*Math.max(Math.abs(matrix[0]||1),.1))):Math.min(420,Math.max(180,layer.clientWidth-clickX-12));
    const left=Math.min(clickX,Math.max(4,layer.clientWidth-desiredWidth-6));
    const topPos=Math.min(clickY,Math.max(4,layer.clientHeight-96));
    const input=document.createElement('textarea');
    input.dataset.role='pdf-new-text-editor';input.setAttribute('aria-label',existingTx?'Edit added PDF text':'Type new PDF text');input.spellcheck=true;input.value=existingTx?.replacementUnicode||'';
    const screenFont=Math.max(16,(Number(style.fontSize)||12)*Math.max(Math.abs(matrix[3]||1),.8));
    Object.assign(input.style,{position:'absolute',left:`${left}px`,top:`${topPos}px`,width:`${desiredWidth}px`,height:'112px',minHeight:'80px',fontSize:`${screenFont}px`,fontFamily:style.fontFamily==='sans'?'Arial, sans-serif':'Times New Roman, serif',fontWeight:style.bold?'700':'400',lineHeight:'1.2',padding:'7px 8px',border:'2px solid var(--pdf-editor-focus,#2563eb)',borderRadius:'6px',background:'rgba(255,255,255,.985)',color:'var(--pdf-editor-text,#111)',zIndex:'90',resize:'vertical',boxSizing:'border-box',touchAction:'manipulation'});
    const actions=document.createElement('div');actions.className='pdf-insert-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='pdf-insert-cancel';cancel.textContent='Cancel';
    const done=document.createElement('button');done.type='button';done.className='pdf-insert-done';done.textContent='Done';
    actions.append(cancel,done);layer.append(input,actions);
    const actionTop=Math.min(layer.clientHeight-48,topPos+input.offsetHeight+6);
    const actionLeft=Math.min(Math.max(4,left),Math.max(4,layer.clientWidth-150));
    Object.assign(actions.style,{left:`${actionLeft}px`,top:`${actionTop}px`});
    input.focus();if(existingTx)try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
    viewportCtl.watch(input);

    let closed=false;
    const cleanup=()=>{
      if(closed)return;closed=true;
      input.removeEventListener('keydown',onKeyDown);input.remove();actions.remove();viewportCtl.stop();
      if(insertEditorCleanup===cleanup)insertEditorCleanup=null;
    };
    insertEditorCleanup=cleanup;
    const onKeyDown=(event)=>{
      if(event.key==='Escape'){event.preventDefault();cleanup();setStatus('Add text cancelled.');}
      else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();done.click();}
    };
    input.addEventListener('keydown',onKeyDown);
    cancel.addEventListener('click',(event)=>{event.stopPropagation();cleanup();setStatus('Add text cancelled.');});
    done.addEventListener('click',async(event)=>{
      event.stopPropagation();
      const text=input.value;
      if(!text.trim()){setStatus('Type some text before pressing Done.','warning');input.focus();return;}
      done.disabled=true;cancel.disabled=true;input.disabled=true;
      try{
        const activeStyle=newTextStyle();
        let tx;
        if(existingTx){
          tx=createInsertTransaction({pageIndex:existingTx.pageIndex,text,x:existingTx.x,y:existingTx.y,fontSize:activeStyle.fontSize,bold:activeStyle.bold,fontFamily:activeStyle.fontFamily,lineHeight:activeStyle.fontSize*1.2,maxWidth:existingTx.maxWidth||existingTx._renderedWidth||300});
          tx.id=existingTx.id;
        }else{
          const scaleY=Math.max(Math.abs(matrix[3]||1),.1);
          const baselineScreenY=topPos+Math.max(16,activeStyle.fontSize*scaleY)*.88;
          const p=screenPointToPdf(matrix,left,baselineScreenY);
          const p2=screenPointToPdf(matrix,left+desiredWidth,baselineScreenY);
          const pdfWidth=Math.max(40,Math.hypot(p2.x-p.x,p2.y-p.y));
          tx=createInsertTransaction({pageIndex,text,x:p.x,y:p.y,fontSize:activeStyle.fontSize,bold:activeStyle.bold,fontFamily:activeStyle.fontFamily,lineHeight:activeStyle.fontSize*1.2,maxWidth:pdfWidth});
        }
        await queueInsertion(tx,existingTx);
        cleanup();setAddTextMode(false,{announce:false});setStatus(existingTx?'Added text updated — continue editing or Save a copy.':'New text added — continue editing or Save a copy.');
      }catch(error){done.disabled=false;cancel.disabled=false;input.disabled=false;input.focus();setStatus(error.code||error.message,'error');onError(error);}
    });
  }

  async function queueEdit(block,newText){
    const old=txByBlock.get(block.id);
    const tx=createEditTransaction({pageIndex:block.pageIndex,block,replacementUnicode:newText});
    tx.originalUnicode=old?.originalUnicode??block.text;
    tx.status='COMMITTED';
    const nextMap=new Map(txByBlock);
    nextMap.set(block.id,tx);
    setStatus('Applying edit…');
    const preview=await buildPreviewForTransactions([...nextMap.values()]);
    const nextRenderer=new PdfRenderer(preview.bytes);
    await nextRenderer.load();

    txByBlock.set(block.id,tx);
    history.push({
      undo:()=>{if(old)txByBlock.set(block.id,old);else txByBlock.delete(block.id);onChange([...txByBlock.values()]);},
      redo:()=>{txByBlock.set(block.id,tx);onChange([...txByBlock.values()]);}
    });
    updateHistory();onChange([...txByBlock.values()]);
    previewToken++;
    previewRenderer?.destroy();
    previewRenderer=nextRenderer;
    await renderPage({announce:false});
    setStatus('Edit applied — continue editing or Save a copy.');
  }

  async function queueInsertion(tx,old=null){
    const nextMap=new Map(txByBlock);nextMap.set(tx.id,tx);
    setStatus(old?'Updating added text…':'Adding text…');
    const preview=await buildPreviewForTransactions([...nextMap.values()]);
    const nextRenderer=new PdfRenderer(preview.bytes);await nextRenderer.load();
    txByBlock.set(tx.id,tx);
    history.push({
      undo:()=>{if(old)txByBlock.set(tx.id,old);else txByBlock.delete(tx.id);onChange([...txByBlock.values()]);},
      redo:()=>{txByBlock.set(tx.id,tx);onChange([...txByBlock.values()]);}
    });
    updateHistory();onChange([...txByBlock.values()]);previewToken++;
    previewRenderer?.destroy();previewRenderer=nextRenderer;
    await renderPage({announce:false});
  }

  async function saveCopy(){
    if(!originalBytes)throw new Error('No PDF open');
    try{
      setStatus('Validating edited PDF…');
      const result=await exportEditedPdf(originalBytes,[...txByBlock.values()]);
      setStatus('Edited PDF validated — download ready.');
      onExport({...result,filename:fileName.replace(/\.pdf$/i,'')+'-edited.pdf'});
      return result;
    }catch(e){
      let message=e.code||e.message;
      if(e.code==='EXPORT_VALIDATION_FAILED'){
        if(e.validation?.structural&&!e.validation.structural.ok)message='Save failed: the generated PDF structure did not reopen correctly.';
        else if(e.validation?.render&&!e.validation.render.ok)message='Save failed: the edited page could not be rendered safely.';
        else if(e.validation?.extraction&&!e.validation.extraction.ok)message='Save failed: the new text could not be verified in the exported PDF.';
      }
      setStatus(message,'error');onError(e);throw e;
    }
  }

  function setMode(mode){setAddTextMode(mode==='add-text');}
  async function undoAction(){if(history.undo()){updateHistory();await refreshPreviewFromCommittedState('Undone');}}
  async function redoAction(){if(history.redo()){updateHistory();await refreshPreviewFromCommittedState('Redone');}}
  function destroy(){previewToken++;insertEditorCleanup?.();insertEditorCleanup=null;inline?.cancel();previewRenderer?.destroy();renderer?.destroy();container.innerHTML='';originalBytes=null;pdfDoc=null;model=null;analysis=null;previewRenderer=null;}

  addText.addEventListener('click',()=>setAddTextMode(!addTextMode));
  bold.addEventListener('click',()=>{const active=bold.getAttribute('aria-pressed')!=='true';bold.setAttribute('aria-pressed',String(active));bold.classList.toggle('is-active',active);});
  back.addEventListener('click',destroy);
  undo.addEventListener('click',()=>undoAction().catch(()=>{}));
  redo.addEventListener('click',()=>redoAction().catch(()=>{}));
  save.addEventListener('click',()=>saveCopy().catch(()=>{}));
  prev.addEventListener('click',async()=>{if(pageIndex>0){pageIndex--;await renderPage();}});
  next.addEventListener('click',async()=>{if(pdfDoc&&pageIndex<pdfDoc.getPageCount()-1){pageIndex++;await renderPage();}});
  zoomOut.addEventListener('click',async()=>{zoom=Math.max(.6,zoom-.15);await renderPage();});
  zoomIn.addEventListener('click',async()=>{zoom=Math.min(2,zoom+.15);await renderPage();});
  updateHistory();updatePageLabel();

  return {open,analyzePage,beginEdit:(blockId)=>{const b=analysis?.blocks.find(x=>x.id===blockId);if(!b)throw new Error('Unknown block');return b;},setMode,undo:undoAction,redo:redoAction,save:saveCopy,destroy,getState:()=>({pageIndex,analysis,transactions:[...txByBlock.values()],flags:model?.flags,hasPreview:!!previewRenderer,addTextMode})};
}
