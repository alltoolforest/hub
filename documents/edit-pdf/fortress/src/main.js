import { loadPdfForEditing } from './core/pdf-loader.js';
import { DocumentModel, getPageContentStreams } from './core/document-model.js';
import { applyDocumentSafety } from './core/classifier.js';
import { PdfRenderer, configurePdfWorker } from './rendering/renderer.js';
import { extractVisualText } from './rendering/text-layer.js';
import { buildLogicalBlocks } from './text/text-blocks.js';
import { mapBlocksToSources } from './mapping/source-mapper.js';
import { pdfRectToScreen } from './utils/coordinates.js';
import { InlineEditor } from './editing/inline-editor.js';
import { createEditTransaction } from './editing/edit-transaction.js';
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

export function createAdvancedPdfTextEngine({container,workerUrl,onStatus=()=>{},onWarning=()=>{},onError=()=>{},onChange=()=>{},onExport=()=>{}}={}){
  if(!container)throw new Error('container is required');
  if(workerUrl)configurePdfWorker(workerUrl);
  let originalBytes=null,pdfDoc=null,model=null,renderer=null,previewRenderer=null,fileName='document.pdf',pageIndex=0,zoom=1,analysis=null;
  let previewToken=0;
  const txByBlock=new Map();
  const history=new History(40);

  container.innerHTML='';
  container.classList.add('pdf-fortress-host');
  const root=document.createElement('div');root.className='pdf-fortress';
  const top=document.createElement('div');top.className='pdf-fortress-top';
  const back=button('Close','Close document');
  const name=document.createElement('div');name.className='pdf-fortress-name';name.textContent=fileName;
  const undo=button('Undo','Undo');
  const redo=button('Redo','Redo');
  const save=button('Save a copy','Save a copy','primary');
  top.append(back,name,undo,redo,save);
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

  function button(text,label,kind=''){
    const b=document.createElement('button');
    b.type='button';b.textContent=text;b.setAttribute('aria-label',label);b.className=`pdf-btn ${kind==='primary'?'pdf-btn-primary':''}`;
    return b;
  }
  function setStatus(msg,kind=''){status.textContent=msg||'';status.dataset.kind=kind;onStatus(msg);}
  function updateHistory(){undo.disabled=!history.state.canUndo;redo.disabled=!history.state.canRedo;}
  function updatePageLabel(){pageLabel.textContent=pdfDoc?`${pageIndex+1} / ${pdfDoc.getPageCount()}`:'—';}
  function currentText(block){return txByBlock.get(block.id)?.replacementUnicode??block.text;}

  async function open(file){
    try{
      setStatus('Reading document…');
      let bytes;
      if(file instanceof Uint8Array)bytes=file;
      else if(file instanceof ArrayBuffer)bytes=new Uint8Array(file);
      else{bytes=new Uint8Array(await file.arrayBuffer());fileName=file.name||fileName;}
      name.textContent=fileName;
      previewToken++;
      previewRenderer?.destroy();previewRenderer=null;
      renderer?.destroy();
      const loaded=await loadPdfForEditing(bytes);
      originalBytes=loaded.originalBytes;
      pdfDoc=loaded.pdfDoc;
      model=new DocumentModel(pdfDoc);
      renderer=new PdfRenderer(originalBytes);
      await renderer.load();
      pageIndex=0;zoom=1;txByBlock.clear();history.undoStack=[];history.redoStack=[];updateHistory();
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
    if(announce)setStatus(editable?`${editable} editable text region${editable===1?'':'s'} — click text to edit`:'No safely editable text detected on this page');
    return analysis;
  }

  async function renderPage({announce=true}={}){
    inline?.cancel();
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

    for(const block of analysis.blocks){
      if(!isEditable(block))continue;
      const lines=block.lines?.length?block.lines:[{text:block.text,...block.bounds,minX:block.bounds?.x,maxX:(block.bounds?.x||0)+(block.bounds?.width||1),y:(block.bounds?.y||0)+(block.fontSize||12)*.3,fontSize:block.fontSize||12}];
      for(const line of lines){
        const rect=pdfRectToScreen(r.matrix,lineHitBounds(line,block));
        const hit=document.createElement('button');
        hit.type='button';
        hit.className=`pdf-hit pdf-hit-${block.tier.toLowerCase()}`;
        Object.assign(hit.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,4)}px`,height:`${Math.max(rect.height,4)}px`});
        hit.title='Click to edit text';
        hit.setAttribute('aria-label',`Edit text: ${currentText(block).slice(0,100)}`);
        hit.addEventListener('click',(evt)=>beginEdit(block,layer,r.matrix,evt));
        layer.append(hit);
      }
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
    inline?.cancel();
    const existing=txByBlock.get(block.id);
    const editBlock={...block,text:existing?.replacementUnicode??block.text};
    inline=new InlineEditor(layer,{onCommit:(_b,text)=>queueEdit(block,text),onCompositionBlocked:()=>setStatus('Finish text composition before Done.','warning')});
    const rect=layer.getBoundingClientRect();
    const tap=existing?null:{x:evt.clientX-rect.left,y:evt.clientY-rect.top};
    const input=inline.begin(editBlock,matrix,tap);
    viewportCtl.watch(input);
    const done=document.createElement('button');done.className='pdf-done';done.textContent='Done';done.type='button';
    done.addEventListener('click',async()=>{
      done.disabled=true;
      const result=await inline.commit();
      if(result?.blocked){done.disabled=false;if(result.error)setStatus(result.error.code||result.error.message,'error');return;}
      viewportCtl.stop();done.remove();
    });
    layer.append(done);
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

  async function saveCopy(){
    if(!originalBytes)throw new Error('No PDF open');
    try{
      setStatus('Validating edited PDF…');
      const result=await exportEditedPdf(originalBytes,[...txByBlock.values()]);
      setStatus('Edited PDF validated');
      onExport({...result,filename:fileName.replace(/\.pdf$/i,'')+'-edited.pdf'});
      return result;
    }catch(e){setStatus(e.code||e.message,'error');onError(e);throw e;}
  }

  function setMode(){/* reserved for isolated integration */}
  async function undoAction(){if(history.undo()){updateHistory();await refreshPreviewFromCommittedState('Undone');}}
  async function redoAction(){if(history.redo()){updateHistory();await refreshPreviewFromCommittedState('Redone');}}
  function destroy(){previewToken++;inline?.cancel();previewRenderer?.destroy();renderer?.destroy();container.innerHTML='';originalBytes=null;pdfDoc=null;model=null;analysis=null;previewRenderer=null;}

  back.addEventListener('click',destroy);
  undo.addEventListener('click',()=>undoAction().catch(()=>{}));
  redo.addEventListener('click',()=>redoAction().catch(()=>{}));
  save.addEventListener('click',()=>saveCopy().catch(()=>{}));
  prev.addEventListener('click',async()=>{if(pageIndex>0){pageIndex--;await renderPage();}});
  next.addEventListener('click',async()=>{if(pdfDoc&&pageIndex<pdfDoc.getPageCount()-1){pageIndex++;await renderPage();}});
  zoomOut.addEventListener('click',async()=>{zoom=Math.max(.6,zoom-.15);await renderPage();});
  zoomIn.addEventListener('click',async()=>{zoom=Math.min(2,zoom+.15);await renderPage();});
  updateHistory();updatePageLabel();

  return {open,analyzePage,beginEdit:(blockId)=>{const b=analysis?.blocks.find(x=>x.id===blockId);if(!b)throw new Error('Unknown block');return b;},setMode,undo:undoAction,redo:redoAction,save:saveCopy,destroy,getState:()=>({pageIndex,analysis,transactions:[...txByBlock.values()],flags:model?.flags,hasPreview:!!previewRenderer})};
}
