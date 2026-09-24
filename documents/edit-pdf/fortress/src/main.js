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
import { planInsertionReflow } from './layout/reflow-planner.js';

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

function inferBlockStyle(block){
  const raw=[block?.fontName,block?.lines?.[0]?.fontName,block?.sourceRuns?.[0]?.fontContext?.baseFont].filter(Boolean).join(' ').toLowerCase();
  const fontFamily=/courier|mono/.test(raw)?'mono':(/times|serif|roman/.test(raw)?'serif':'sans');
  const bold=/bold|black|semibold|demi/.test(raw);
  const italic=/italic|oblique/.test(raw);
  const fontSize=Math.max(6,Math.min(72,Number(block?.lines?.[0]?.fontSize||block?.fontSize)||12));
  return {fontFamily,fontSize,bold,italic};
}

function stylesDiffer(a,b){
  return a.fontFamily!==b.fontFamily||Math.abs(Number(a.fontSize)-Number(b.fontSize))>.15||!!a.bold!==!!b.bold||!!a.italic!==!!b.italic;
}

function shiftBlock(block,dy){
  if(!dy)return block;
  return {
    ...block,
    bounds:block.bounds?{...block.bounds,y:block.bounds.y+dy}:block.bounds,
    lines:(block.lines||[]).map(line=>({
      ...line,
      y:Number.isFinite(line.y)?line.y+dy:line.y,
      bounds:line.bounds?{...line.bounds,y:line.bounds.y+dy}:line.bounds,
      runs:(line.runs||[]).map(run=>({...run,y:Number.isFinite(run.y)?run.y+dy:run.y})),
    })),
  };
}

export function createAdvancedPdfTextEngine({container,workerUrl,onStatus=()=>{},onWarning=()=>{},onError=()=>{},onChange=()=>{},onExport=()=>{}}={}){
  if(!container)throw new Error('container is required');
  if(workerUrl)configurePdfWorker(workerUrl);
  let originalBytes=null,pdfDoc=null,model=null,renderer=null,previewRenderer=null,fileName='document.pdf',pageIndex=0,zoom=1,analysis=null;
  let previewToken=0;
  let addTextMode=false;
  let activeTextInput=null;
  let activeInputScale=1;
  let formatContext='none';
  let currentPageGeometry=null;
  let previewReflowMetrics=[];
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
  const formatTools=document.createElement('div');formatTools.className='pdf-insert-tools pdf-format-tools';formatTools.hidden=true;
  const familySelect=document.createElement('select');familySelect.className='pdf-format-select';familySelect.setAttribute('aria-label','Text font family');
  familySelect.append(new Option('Serif','serif'),new Option('Sans','sans'),new Option('Mono','mono'));
  const sizeSelect=document.createElement('select');sizeSelect.className='pdf-format-select pdf-size-select';sizeSelect.setAttribute('aria-label','Text font size');
  for(const size of [6,8,9,10,11,12,14,16,18,20,24,28,32,36,48,60,72])sizeSelect.append(new Option(`${size} pt`,String(size),false,size===12));
  const bold=button('B','Bold text');bold.classList.add('pdf-format-toggle');bold.setAttribute('aria-pressed','false');
  const italic=button('I','Italic text');italic.classList.add('pdf-format-toggle','pdf-format-italic');italic.setAttribute('aria-pressed','false');
  formatTools.append(familySelect,sizeSelect,bold,italic);
  const undo=button('Undo','Undo');
  const redo=button('Redo','Redo');
  const save=button('Save a copy','Save a copy','primary');
  top.append(back,name,addText,formatTools,undo,redo,save);
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

  function overflowCountsBySourcePage(){
    const counts=new Map();
    for(const metric of previewReflowMetrics||[]){
      const source=Number(metric?.pageIndex);
      const count=Math.max(0,Number(metric?.overflowPageCount)||0);
      if(Number.isInteger(source)&&source>=0&&count>0)counts.set(source,(counts.get(source)||0)+count);
    }
    return counts;
  }

  function previewPageDescriptors(){
    const originalCount=pdfDoc?.getPageCount?.()||0;
    const counts=overflowCountsBySourcePage();
    const pages=[];
    for(let sourcePageIndex=0;sourcePageIndex<originalCount;sourcePageIndex++){
      pages.push({kind:'source',sourcePageIndex});
      const overflowCount=counts.get(sourcePageIndex)||0;
      for(let continuationIndex=0;continuationIndex<overflowCount;continuationIndex++){
        pages.push({kind:'continuation',sourcePageIndex,continuationIndex});
      }
    }
    const actualPreviewCount=Number(previewRenderer?.doc?.numPages)||pages.length;
    while(pages.length<actualPreviewCount)pages.push({kind:'continuation',sourcePageIndex:null,continuationIndex:pages.length});
    return pages.slice(0,actualPreviewCount);
  }

  function activePageDescriptors(){
    if(previewRenderer)return previewPageDescriptors();
    const count=pdfDoc?.getPageCount?.()||0;
    return Array.from({length:count},(_,sourcePageIndex)=>({kind:'source',sourcePageIndex}));
  }

  function activePageCount(){return activePageDescriptors().length;}
  function currentPageDescriptor(){return activePageDescriptors()[pageIndex]||null;}
  function currentSourcePageIndex(){const d=currentPageDescriptor();return d?.kind==='source'?d.sourcePageIndex:null;}
  function updatePageLabel(){const count=activePageCount();pageLabel.textContent=count?`${pageIndex+1} / ${count}`:'—';}
  function currentText(block){const tx=txByBlock.get(block.id);return tx?.displayUnicode??tx?.replacementUnicode??block.text;}
  function currentFormatStyle(){return {fontFamily:['serif','sans','mono'].includes(familySelect.value)?familySelect.value:'serif',fontSize:Number(sizeSelect.value)||12,bold:bold.getAttribute('aria-pressed')==='true',italic:italic.getAttribute('aria-pressed')==='true'};}
  function metricsForPage(index=currentSourcePageIndex()){return Number.isInteger(index)?previewReflowMetrics.filter(m=>m.pageIndex===index&&Number(m.delta)>0).sort((a,b)=>a.sequenceIndex-b.sequenceIndex):[];}

  function visualBlock(block){
    let out=block;
    for(const metric of metricsForPage(block.pageIndex)){
      const top=(out.bounds?.y||0)+(out.bounds?.height||0);
      if(top<=Number(metric.cutY)+.75)out=shiftBlock(out,-Number(metric.delta||0));
    }
    return out;
  }

  function visualInsertedTransaction(tx){
    const all=[...txByBlock.values()];
    const txIndex=all.findIndex(item=>item.id===tx.id);
    let y=Number(tx.y)||0;
    const size=Math.max(6,Number(tx.fontSize)||12);
    for(const metric of metricsForPage(tx.pageIndex)){
      if(Number(metric.sequenceIndex)<=txIndex)continue;
      const top=y+size*.9;
      if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta||0);
    }
    return {...tx,y};
  }

  function setToggle(buttonEl,active){
    buttonEl.setAttribute('aria-pressed',String(!!active));
    buttonEl.classList.toggle('is-active',!!active);
  }

  function setFormatControls(style,{context='none',show=true}={}){
    familySelect.value=['serif','sans','mono'].includes(style?.fontFamily)?style.fontFamily:'serif';
    const requested=Math.max(6,Math.min(72,Number(style?.fontSize)||12));
    const available=[...sizeSelect.options].map(o=>Number(o.value));
    const nearest=available.reduce((best,n)=>Math.abs(n-requested)<Math.abs(best-requested)?n:best,available[0]);
    sizeSelect.value=String(nearest);
    setToggle(bold,!!style?.bold);
    setToggle(italic,!!style?.italic);
    formatContext=context;
    formatTools.hidden=!show;
    updateActiveInputFormatting();
  }

  function hideFormatToolsIfIdle(){
    if(addTextMode)return;
    formatContext='none';
    formatTools.hidden=true;
    activeTextInput=null;
    activeInputScale=1;
  }

  function updateActiveInputFormatting(){
    if(!activeTextInput)return;
    const style=currentFormatStyle();
    activeTextInput.style.fontFamily=style.fontFamily==='sans'?'Arial, sans-serif':(style.fontFamily==='mono'?'Courier New, monospace':'Times New Roman, serif');
    activeTextInput.style.fontWeight=style.bold?'700':'400';
    activeTextInput.style.fontStyle=style.italic?'italic':'normal';
    activeTextInput.style.fontSize=`${Math.max(16,style.fontSize*Math.max(activeInputScale,.1))}px`;
  }

  function setAddTextMode(enabled,{announce=true}={}){
    addTextMode=!!enabled;
    addText.classList.toggle('is-active',addTextMode);
    addText.setAttribute('aria-pressed',String(addTextMode));
    docArea.classList.toggle('pdf-add-text-mode',addTextMode);
    if(addTextMode){
      if(formatContext==='none')setFormatControls({fontFamily:'serif',fontSize:12,bold:false,italic:false},{context:'insert-new',show:true});
      else formatTools.hidden=false;
    }else if(!activeTextInput){
      hideFormatToolsIfIdle();
    }
    if(announce){
      if(currentPageDescriptor()?.kind==='continuation'&&addTextMode)setStatus('This is an automatically generated continuation page. Edit the source content on the preceding page.','warning');
      else setStatus(addTextMode?'Add Text is on — choose formatting, then click anywhere on the PDF.':'Click existing text to edit and format it, or choose Add text for a new paragraph.');
    }
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
      pageIndex=0;zoom=1;txByBlock.clear();history.undoStack=[];history.redoStack=[];updateHistory();
      activeTextInput=null;formatContext='none';formatTools.hidden=true;previewReflowMetrics=[];currentPageGeometry=null;setAddTextMode(false,{announce:false});
      await renderPage();
      return {pageCount:loaded.pageCount,flags:model.flags};
    }catch(e){setStatus(e.message,'error');onError(e);throw e;}
  }

  async function analyzePage(index,{announce=true}={}){
    if(!pdfDoc)throw new Error('No PDF open');
    if(!Number.isInteger(index)||index<0||index>=pdfDoc.getPageCount())throw new Error('Source PDF page is unavailable');
    if(announce)setStatus('Finding editable text…');
    const visual=await extractVisualText(renderer,index);
    const blocks=buildLogicalBlocks(visual.items,{pageIndex:index,pageRotation:model.page(index).rotation});
    const streams=getPageContentStreams(pdfDoc,index);
    const mapped=mapBlocksToSources(pdfDoc,index,streams,blocks);
    const safe=applyDocumentSafety(mapped.blocks,model.flags);
    analysis={pageIndex:index,blocks:safe,sourceRuns:mapped.sourceRuns,streams};
    const editable=safe.filter(isEditable).length;
    if(announce)setStatus(editable?`${editable} editable text region${editable===1?'':'s'} — click text to edit and format`:'No safely editable existing text detected — Add text is still available');
    return analysis;
  }

  async function renderPage({announce=true}={}){
    inline?.cancel();
    insertEditorCleanup?.();insertEditorCleanup=null;
    activeTextInput=null;activeInputScale=1;
    if(!addTextMode){formatContext='none';formatTools.hidden=true;}
    const count=activePageCount();
    if(count&&pageIndex>=count)pageIndex=count-1;
    if(pageIndex<0)pageIndex=0;
    docArea.innerHTML='';
    updatePageLabel();
    const descriptor=currentPageDescriptor();
    const wrap=document.createElement('div');wrap.className='pdf-page-wrap';
    const canvas=document.createElement('canvas');canvas.className='pdf-page-canvas';
    const layer=document.createElement('div');layer.className='pdf-hit-layer';
    wrap.append(canvas,layer);docArea.append(wrap);
    const displayRenderer=previewRenderer||renderer;
    const info=await displayRenderer.pageInfo(pageIndex);
    currentPageGeometry={width:info.width,height:info.height,rotation:info.rotation};
    const fit=Math.min(Math.max((docArea.clientWidth-24)/Math.max(info.width,1),.25),2.5);
    const scale=fit*zoom;
    const r=await displayRenderer.render(pageIndex,canvas,{scale});
    wrap.style.width=`${r.cssWidth}px`;wrap.style.height=`${r.cssHeight}px`;layer.style.width=`${r.cssWidth}px`;layer.style.height=`${r.cssHeight}px`;
    layer.__matrix=r.matrix;

    if(descriptor?.kind==='continuation'){
      analysis={pageIndex:null,blocks:[],sourceRuns:[],streams:[]};
      if(announce)setStatus(`Continuation page from page ${(descriptor.sourcePageIndex??0)+1} — overflow content continues here automatically.`);
      layer.addEventListener('click',(evt)=>{
        if(addTextMode&&evt.target===layer)setStatus('This continuation page is generated automatically. Edit or add content on the source page instead.','warning');
      });
      return;
    }

    const sourcePageIndex=descriptor?.sourcePageIndex;
    analysis=await analyzePage(sourcePageIndex,{announce});

    layer.addEventListener('click',(evt)=>{
      if(!addTextMode||evt.target!==layer)return;
      beginInsertEditor(layer,r.matrix,evt).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
    });

    for(const block of analysis.blocks){
      if(!isEditable(block))continue;
      const existingTx=txByBlock.get(block.id);
      if(existingTx?.expandedInsertId)continue;
      const shown=visualBlock(block);
      const lines=shown.lines?.length?shown.lines:[{text:shown.text,...shown.bounds,minX:shown.bounds?.x,maxX:(shown.bounds?.x||0)+(shown.bounds?.width||1),y:(shown.bounds?.y||0)+(shown.fontSize||12)*.3,fontSize:shown.fontSize||12}];
      for(const line of lines){
        const rect=pdfRectToScreen(r.matrix,lineHitBounds(line,shown));
        const hit=document.createElement('button');
        hit.type='button';
        hit.className=`pdf-hit pdf-hit-${block.tier.toLowerCase()}`;
        Object.assign(hit.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,4)}px`,height:`${Math.max(rect.height,4)}px`});
        hit.title=addTextMode?'Place new text here':'Click to edit and format text';
        hit.setAttribute('aria-label',`Edit text: ${currentText(block).slice(0,100)}`);
        hit.addEventListener('click',(evt)=>{
          evt.stopPropagation();
          if(addTextMode)beginInsertEditor(layer,r.matrix,evt).catch(error=>{setStatus(error.code||error.message,'error');onError(error);});
          else beginEdit(block,shown,layer,r.matrix,evt);
        });
        layer.append(hit);
      }
    }

    for(const tx of txByBlock.values()){
      if(tx.kind!=='INSERT_TEXT'||tx.pageIndex!==sourcePageIndex)continue;
      const shownTx=visualInsertedTransaction(tx);
      const rect=pdfRectToScreen(r.matrix,insertedHitBounds(shownTx));
      const hit=document.createElement('button');
      hit.type='button';hit.className='pdf-hit pdf-hit-inserted';hit.title=addTextMode?'Place new text here':'Click to edit and format added text';
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
    return exportEditedPdf(originalBytes,transactions,{validate:false,preview:true});
  }

  async function replacePreviewRenderer(result){
    const next=new PdfRenderer(result.bytes);
    await next.load();
    previewRenderer?.destroy();
    previewRenderer=next;
    previewReflowMetrics=result.reflowMetrics||[];
  }

  async function refreshPreviewFromCommittedState(message='Edit applied — continue editing or Save a copy.'){
    const token=++previewToken;
    try{
      if(!txByBlock.size){
        previewRenderer?.destroy();previewRenderer=null;previewReflowMetrics=[];
        await renderPage({announce:false});
        if(token===previewToken)setStatus(message);
        return;
      }
      setStatus('Applying edits…');
      const result=await buildPreviewForTransactions([...txByBlock.values()]);
      if(token!==previewToken)return;
      await replacePreviewRenderer(result);
      if(token!==previewToken)return;
      await renderPage({announce:false});
      if(token===previewToken)setStatus(message);
    }catch(e){
      if(token===previewToken){setStatus(e.code||e.message,'error');onError(e);}
      throw e;
    }
  }

  function beginEdit(sourceBlock,shownBlock,layer,matrix,evt){
    insertEditorCleanup?.();insertEditorCleanup=null;
    inline?.cancel();
    const existing=txByBlock.get(sourceBlock.id);
    const originalStyle=inferBlockStyle(sourceBlock);
    const existingStyle=existing?.fontSize?{fontFamily:existing.fontFamily||originalStyle.fontFamily,fontSize:existing.fontSize,bold:existing.bold??originalStyle.bold,italic:existing.italic??originalStyle.italic}:originalStyle;
    setFormatControls(existingStyle,{context:'existing',show:true});
    const editBlock={...shownBlock,text:existing?.displayUnicode??existing?.replacementUnicode??sourceBlock.text,fontSize:existingStyle.fontSize};
    inline=new InlineEditor(layer,{onCommit:(_b,text)=>queueEdit(sourceBlock,text,currentFormatStyle()),onCompositionBlocked:()=>setStatus('Finish text composition before Done.','warning')});
    const rect=layer.getBoundingClientRect();
    const tap=existing?null:{x:evt.clientX-rect.left,y:evt.clientY-rect.top};
    const input=inline.begin(editBlock,matrix,tap);
    activeTextInput=input;activeInputScale=Math.max(Math.abs(matrix[3]||1),.1);updateActiveInputFormatting();
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
      if(result?.blocked){done.disabled=false;if(result.error)setStatus(result.error.message||result.error.code,'error');return;}
      viewportCtl.stop();activeTextInput=null;done.remove();hideFormatToolsIfIdle();
    });
    layer.append(done);
    setStatus('Edit the text and use the formatting controls above, then press Done.');
  }

  async function beginInsertEditor(layer,matrix,evt,existingTx=null){
    evt?.preventDefault?.();
    const descriptor=currentPageDescriptor();
    if(!existingTx&&descriptor?.kind!=='source')throw Object.assign(new Error('Add text is not available directly on an automatically generated continuation page.'),{code:'CONTINUATION_PAGE_READONLY'});
    const sourcePageIndex=existingTx?.pageIndex??descriptor?.sourcePageIndex;
    if(!Number.isInteger(sourcePageIndex))throw Object.assign(new Error('Source page is unavailable for editing.'),{code:'SOURCE_PAGE_UNAVAILABLE'});
    inline?.cancel();
    insertEditorCleanup?.();insertEditorCleanup=null;
    const layerRect=layer.getBoundingClientRect();
    const style=existingTx?{fontFamily:existingTx.fontFamily||'serif',fontSize:existingTx.fontSize||12,bold:!!existingTx.bold,italic:!!existingTx.italic}:currentFormatStyle();
    setFormatControls(style,{context:existingTx?'insert-existing':'insert-new',show:true});
    const clickX=Math.max(4,Math.min(layer.clientWidth-4,(evt?.clientX??layerRect.left+12)-layerRect.left));
    const clickY=Math.max(4,Math.min(layer.clientHeight-4,(evt?.clientY??layerRect.top+12)-layerRect.top));
    const desiredWidth=existingTx?Math.max(180,Math.min(440,(existingTx._renderedWidth||existingTx.maxWidth||300)*Math.max(Math.abs(matrix[0]||1),.1))):Math.min(420,Math.max(180,layer.clientWidth-clickX-12));
    const left=Math.min(clickX,Math.max(4,layer.clientWidth-desiredWidth-6));
    const topPos=Math.min(clickY,Math.max(4,layer.clientHeight-96));
    const input=document.createElement('textarea');
    input.dataset.role='pdf-new-text-editor';input.setAttribute('aria-label',existingTx?'Edit added PDF text':'Type new PDF text');input.spellcheck=true;input.value=existingTx?.replacementUnicode||'';
    Object.assign(input.style,{position:'absolute',left:`${left}px`,top:`${topPos}px`,width:`${desiredWidth}px`,height:'112px',minHeight:'80px',lineHeight:'1.2',padding:'7px 8px',border:'2px solid var(--pdf-editor-focus,#2563eb)',borderRadius:'6px',background:'rgba(255,255,255,.985)',color:'var(--pdf-editor-text,#111)',zIndex:'90',resize:'vertical',boxSizing:'border-box',touchAction:'manipulation'});
    const actions=document.createElement('div');actions.className='pdf-insert-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='pdf-insert-cancel';cancel.textContent='Cancel';
    const done=document.createElement('button');done.type='button';done.className='pdf-insert-done';done.textContent='Done';
    actions.append(cancel,done);layer.append(input,actions);
    activeTextInput=input;activeInputScale=Math.max(Math.abs(matrix[3]||1),.1);updateActiveInputFormatting();
    const actionTop=Math.min(layer.clientHeight-48,topPos+input.offsetHeight+6);
    const actionLeft=Math.min(Math.max(4,left),Math.max(4,layer.clientWidth-150));
    Object.assign(actions.style,{left:`${actionLeft}px`,top:`${actionTop}px`});
    input.focus();if(existingTx)try{input.setSelectionRange(input.value.length,input.value.length);}catch{}
    viewportCtl.watch(input);

    let closed=false;
    const cleanup=()=>{
      if(closed)return;closed=true;
      input.removeEventListener('keydown',onKeyDown);input.remove();actions.remove();viewportCtl.stop();
      activeTextInput=null;activeInputScale=1;
      if(insertEditorCleanup===cleanup)insertEditorCleanup=null;
      hideFormatToolsIfIdle();
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
        const activeStyle=currentFormatStyle();
        let tx;
        if(existingTx){
          tx=createInsertTransaction({pageIndex:existingTx.pageIndex,text,x:existingTx.x,y:existingTx.y,fontSize:activeStyle.fontSize,bold:activeStyle.bold,italic:activeStyle.italic,fontFamily:activeStyle.fontFamily,lineHeight:activeStyle.fontSize*1.2,maxWidth:existingTx.maxWidth||existingTx._renderedWidth||300,reflowPlan:existingTx.reflowPlan});
          tx.id=existingTx.id;
        }else{
          const scaleY=Math.max(Math.abs(matrix[3]||1),.1);
          const baselineScreenY=topPos+Math.max(16,activeStyle.fontSize*scaleY)*.88;
          const p=screenPointToPdf(matrix,left,baselineScreenY);
          const p2=screenPointToPdf(matrix,left+desiredWidth,baselineScreenY);
          const pdfWidth=Math.max(40,Math.hypot(p2.x-p.x,p2.y-p.y));
          const geometry=currentPageGeometry||{width:Math.max(p.x+pdfWidth,1),height:Math.max(p.y+activeStyle.fontSize*4,1),rotation:model?.page(sourcePageIndex)?.rotation||0};
          const reflowPlan=planInsertionReflow({
            blocks:analysis?.blocks||[],
            x:p.x,
            y:p.y,
            maxWidth:pdfWidth,
            fontSize:activeStyle.fontSize,
            pageWidth:geometry.width,
            pageHeight:geometry.height,
            pageRotation:geometry.rotation,
            existingMetrics:metricsForPage(sourcePageIndex),
          });
          tx=createInsertTransaction({pageIndex:sourcePageIndex,text,x:p.x,y:p.y,fontSize:activeStyle.fontSize,bold:activeStyle.bold,italic:activeStyle.italic,fontFamily:activeStyle.fontFamily,lineHeight:activeStyle.fontSize*1.2,maxWidth:pdfWidth,reflowPlan});
        }
        const preview=await queueInsertion(tx,existingTx);
        cleanup();setAddTextMode(false,{announce:false});
        const metric=preview?.reflowMetrics?.find(m=>m.transactionId===tx.id&&Number(m.delta)>0);
        if(existingTx)setStatus(metric?.overflowPageCount?'Added text updated — lower content reflowed onto a continuation page.':(metric?'Added text updated — lower content moved down automatically.':'Added text updated — continue editing or Save a copy.'));
        else setStatus(metric?.overflowPageCount?'New text added — lower content continued onto the next page.':(metric?'New text added — lower content moved down automatically.':'New text added — existing spacing was sufficient.'));
      }catch(error){done.disabled=false;cancel.disabled=false;input.disabled=false;input.focus();setStatus(error.code||error.message,'error');onError(error);}
    });
  }

  function growthNeedsParagraphFallback(error,block,newText,selectedStyle,originalStyle){
    if(!error||!['LAYOUT_COLLISION','TEXT_OVERFLOW'].includes(error.code))return false;
    if(error.code==='TEXT_OVERFLOW')return true;
    const oldLength=Math.max(1,Array.from(String(block.text||'').replace(/\s+/g,'')).length);
    const newLength=Array.from(String(newText||'').replace(/\s+/g,'')).length;
    const sizeRatio=(Number(selectedStyle?.fontSize)||originalStyle.fontSize)/Math.max(originalStyle.fontSize,1);
    return String(newText||'').includes('\n')||(newLength>oldLength*1.12&&sizeRatio<=1.20);
  }

  function expansionGeometryForBlock(block,selectedStyle){
    const geometry=currentPageGeometry;
    if(!geometry||Number(geometry.rotation||0)!==0||!analysis?.blocks?.length)return null;
    const shown=visualBlock(block);
    const line=shown.lines?.[0];
    const originalStyle=inferBlockStyle(block);
    const size=Math.max(6,Math.min(72,Number(selectedStyle?.fontSize)||originalStyle.fontSize));
    const x=Number.isFinite(line?.minX)?line.minX:Number(shown.bounds?.x);
    const baseline=Number.isFinite(line?.y)?line.y:(Number(shown.bounds?.y)||0)+size*.30;
    const ownRight=Number.isFinite(line?.maxX)?line.maxX:x+Number(shown.bounds?.width||0);
    if(![x,baseline,ownRight].every(Number.isFinite)||ownRight<=x)return null;

    const nearbyRights=[];
    for(const candidate of analysis.blocks){
      if(candidate.id===block.id||!isEditable(candidate))continue;
      const cStyle=inferBlockStyle(candidate);
      if(cStyle.fontFamily!==originalStyle.fontFamily||cStyle.bold!==originalStyle.bold||cStyle.italic!==originalStyle.italic)continue;
      if(Math.abs(cStyle.fontSize-originalStyle.fontSize)>Math.max(1.25,originalStyle.fontSize*.12))continue;
      const visual=visualBlock(candidate);
      const cLine=visual.lines?.[0];
      const cBaseline=Number.isFinite(cLine?.y)?cLine.y:(Number(visual.bounds?.y)||0)+cStyle.fontSize*.30;
      if(Math.abs(cBaseline-baseline)>size*4.2)continue;
      const cX=Number.isFinite(cLine?.minX)?cLine.minX:Number(visual.bounds?.x);
      if(!Number.isFinite(cX)||Math.abs(cX-x)>Math.max(12,size*1.4))continue;
      const cRight=Number.isFinite(cLine?.maxX)?cLine.maxX:cX+Number(visual.bounds?.width||0);
      if(Number.isFinite(cRight)&&cRight>cX)nearbyRights.push(cRight);
    }

    const rightMargin=Math.max(18,geometry.width*.055);
    const pageRight=Math.max(x+40,geometry.width-rightMargin);
    const inferredRight=Math.min(pageRight,Math.max(ownRight,...nearbyRights));
    const maxWidth=Math.max(ownRight-x,inferredRight-x);
    if(maxWidth<Math.max(140,geometry.width*.38)||x>geometry.width*.30)return null;

    const reflowPlan=planInsertionReflow({
      blocks:analysis.blocks.filter(candidate=>candidate.id!==block.id),
      x,
      y:Number.isFinite(Number(shown.bounds?.y))?Number(shown.bounds.y):baseline-size*.30,
      maxWidth,
      fontSize:size,
      pageWidth:geometry.width,
      pageHeight:geometry.height,
      pageRotation:geometry.rotation,
      existingMetrics:metricsForPage(block.pageIndex),
    });
    if(!reflowPlan.enabled&&reflowPlan.reason!=='NO_CONTENT_BELOW_INSERTION')return null;
    return {x,y:baseline,maxWidth,size,reflowPlan};
  }

  function paragraphExpansionError(cause=null){
    return Object.assign(new Error('This replacement needs more space than the PDF can safely provide here. Shorten the text or use Add text.'),{code:'LAYOUT_COLLISION',cause});
  }

  async function queueExpandedEdit(block,newText,selectedStyle,originalStyle,old,cause){
    const geometry=expansionGeometryForBlock(block,selectedStyle);
    if(!geometry)throw paragraphExpansionError(cause);

    const clearTx=createEditTransaction({pageIndex:block.pageIndex,block,replacementUnicode:'',style:{...originalStyle,styleChanged:false}});
    clearTx.originalUnicode=old?.originalUnicode??block.text;
    clearTx.status='COMMITTED';

    const insertTx=createInsertTransaction({
      pageIndex:block.pageIndex,
      text:newText,
      x:geometry.x,
      y:geometry.y,
      fontSize:geometry.size,
      bold:!!selectedStyle.bold,
      italic:!!selectedStyle.italic,
      fontFamily:selectedStyle.fontFamily,
      lineHeight:geometry.size*1.2,
      maxWidth:geometry.maxWidth,
      reflowPlan:geometry.reflowPlan,
    });
    clearTx.expandedInsertId=insertTx.id;
    clearTx.displayUnicode=newText;
    insertTx.expandedFromBlockId=block.id;

    const oldInsertId=old?.expandedInsertId||null;
    const oldInsert=oldInsertId?txByBlock.get(oldInsertId):null;
    const nextMap=new Map(txByBlock);
    if(oldInsertId)nextMap.delete(oldInsertId);
    nextMap.set(block.id,clearTx);
    nextMap.set(insertTx.id,insertTx);
    setStatus('Replacement needs more space — checking safe paragraph reflow…');

    let preview;
    try{preview=await buildPreviewForTransactions([...nextMap.values()]);}
    catch(error){throw paragraphExpansionError(error);}

    const metric=preview?.reflowMetrics?.find(item=>item.transactionId===insertTx.id);
    if(geometry.reflowPlan.enabled&&!metric)throw paragraphExpansionError(cause);

    const nextRenderer=new PdfRenderer(preview.bytes);
    await nextRenderer.load();

    if(oldInsertId)txByBlock.delete(oldInsertId);
    txByBlock.set(block.id,clearTx);
    txByBlock.set(insertTx.id,insertTx);
    history.push({
      undo:()=>{
        txByBlock.delete(insertTx.id);
        if(old)txByBlock.set(block.id,old);else txByBlock.delete(block.id);
        if(oldInsert)txByBlock.set(oldInsert.id,oldInsert);
        onChange([...txByBlock.values()]);
      },
      redo:()=>{
        if(oldInsert)txByBlock.delete(oldInsert.id);
        txByBlock.set(block.id,clearTx);
        txByBlock.set(insertTx.id,insertTx);
        onChange([...txByBlock.values()]);
      }
    });
    updateHistory();onChange([...txByBlock.values()]);previewToken++;
    previewRenderer?.destroy();previewRenderer=nextRenderer;previewReflowMetrics=preview.reflowMetrics||[];
    await renderPage({announce:false});
    if(metric?.overflowPageCount)setStatus('Paragraph expanded safely — overflow moved onto the next continuation page and later original pages shifted forward.');
    else if(Number(metric?.delta)>0)setStatus('Paragraph expanded safely — content below moved down automatically.');
    else setStatus('Paragraph expanded safely within the available spacing.');
  }

  async function queueEdit(block,newText,selectedStyle){
    const old=txByBlock.get(block.id);
    const originalStyle=inferBlockStyle(block);
    const style={...selectedStyle,styleChanged:stylesDiffer(selectedStyle,originalStyle)};
    const tx=createEditTransaction({pageIndex:block.pageIndex,block,replacementUnicode:newText,style});
    tx.originalUnicode=old?.originalUnicode??block.text;
    tx.status='COMMITTED';
    const nextMap=new Map(txByBlock);
    nextMap.set(block.id,tx);
    setStatus(style.styleChanged?'Applying text and formatting…':'Applying edit…');

    let preview;
    let nextRenderer;
    try{
      preview=await buildPreviewForTransactions([...nextMap.values()]);
      nextRenderer=new PdfRenderer(preview.bytes);
      await nextRenderer.load();
    }catch(error){
      if(growthNeedsParagraphFallback(error,block,newText,selectedStyle,originalStyle)){
        return queueExpandedEdit(block,newText,selectedStyle,originalStyle,old,error);
      }
      throw error;
    }

    txByBlock.set(block.id,tx);
    history.push({
      undo:()=>{if(old)txByBlock.set(block.id,old);else txByBlock.delete(block.id);onChange([...txByBlock.values()]);},
      redo:()=>{txByBlock.set(block.id,tx);onChange([...txByBlock.values()]);}
    });
    updateHistory();onChange([...txByBlock.values()]);
    previewToken++;
    previewRenderer?.destroy();
    previewRenderer=nextRenderer;
    previewReflowMetrics=preview.reflowMetrics||[];
    await renderPage({announce:false});
    setStatus(style.styleChanged?'Text and formatting applied — continue editing or Save a copy.':'Edit applied — continue editing or Save a copy.');
  }

  async function queueInsertion(tx,old=null){
    const nextMap=new Map(txByBlock);nextMap.set(tx.id,tx);
    setStatus(old?'Updating added text…':'Adding text and checking page flow…');
    const preview=await buildPreviewForTransactions([...nextMap.values()]);
    const nextRenderer=new PdfRenderer(preview.bytes);await nextRenderer.load();
    txByBlock.set(tx.id,tx);
    history.push({
      undo:()=>{if(old)txByBlock.set(tx.id,old);else txByBlock.delete(tx.id);onChange([...txByBlock.values()]);},
      redo:()=>{txByBlock.set(tx.id,tx);onChange([...txByBlock.values()]);}
    });
    updateHistory();onChange([...txByBlock.values()]);previewToken++;
    previewRenderer?.destroy();previewRenderer=nextRenderer;previewReflowMetrics=preview.reflowMetrics||[];
    await renderPage({announce:false});
    return preview;
  }

  async function saveCopy(){
    if(!originalBytes)throw new Error('No PDF open');
    try{
      setStatus('Validating edited PDF…');
      const result=await exportEditedPdf(originalBytes,[...txByBlock.values()]);
      setStatus(result.overflowPageCount?`Edited PDF validated — ${result.overflowPageCount} continuation page${result.overflowPageCount===1?'':'s'} added.`:'Edited PDF validated — download ready.');
      onExport({...result,filename:fileName.replace(/\.pdf$/i,'')+'-edited.pdf'});
      return result;
    }catch(e){
      let message=e.code||e.message;
      if(e.code==='EXPORT_VALIDATION_FAILED'){
        if(e.validation?.structural&&!e.validation.structural.ok)message='Save failed: the generated PDF structure did not reopen correctly.';
        else if(e.validation?.render&&!e.validation.render.ok)message='Save failed: the edited page could not be rendered safely.';
        else if(e.validation?.extraction&&!e.validation.extraction.ok)message='Save failed: the new text could not be verified in the exported PDF.';
      }else if(e.code==='LAYOUT_COLLISION'){
        message='The replacement needs more room than this PDF region can safely provide. Shorten the text, reduce the font size, or use Add text.';
      }else if(e.code==='INSERT_TEXT_OVERFLOW'){
        message='This paragraph starts too close to the bottom edge to fit safely. Place it slightly higher and try again.';
      }
      setStatus(message,'error');onError(e);throw e;
    }
  }

  function setMode(mode){setAddTextMode(mode==='add-text');}
  async function undoAction(){if(history.undo()){updateHistory();await refreshPreviewFromCommittedState('Undone');}}
  async function redoAction(){if(history.redo()){updateHistory();await refreshPreviewFromCommittedState('Redone');}}
  function destroy(){previewToken++;insertEditorCleanup?.();insertEditorCleanup=null;inline?.cancel();previewRenderer?.destroy();renderer?.destroy();container.innerHTML='';originalBytes=null;pdfDoc=null;model=null;analysis=null;previewRenderer=null;activeTextInput=null;previewReflowMetrics=[];currentPageGeometry=null;}

  addText.addEventListener('click',()=>setAddTextMode(!addTextMode));
  familySelect.addEventListener('change',updateActiveInputFormatting);
  sizeSelect.addEventListener('change',updateActiveInputFormatting);
  bold.addEventListener('click',()=>{setToggle(bold,bold.getAttribute('aria-pressed')!=='true');updateActiveInputFormatting();});
  italic.addEventListener('click',()=>{setToggle(italic,italic.getAttribute('aria-pressed')!=='true');updateActiveInputFormatting();});
  back.addEventListener('click',destroy);
  undo.addEventListener('click',()=>undoAction().catch(()=>{}));
  redo.addEventListener('click',()=>redoAction().catch(()=>{}));
  save.addEventListener('click',()=>saveCopy().catch(()=>{}));
  prev.addEventListener('click',async()=>{if(pageIndex>0){pageIndex--;await renderPage();}});
  next.addEventListener('click',async()=>{if(pageIndex<activePageCount()-1){pageIndex++;await renderPage();}});
  zoomOut.addEventListener('click',async()=>{zoom=Math.max(.6,zoom-.15);await renderPage();});
  zoomIn.addEventListener('click',async()=>{zoom=Math.min(2,zoom+.15);await renderPage();});
  updateHistory();updatePageLabel();

  return {open,analyzePage,beginEdit:(blockId)=>{const b=analysis?.blocks.find(x=>x.id===blockId);if(!b)throw new Error('Unknown block');return b;},setMode,undo:undoAction,redo:redoAction,save:saveCopy,destroy,getState:()=>({pageIndex,pageCount:activePageCount(),pageDescriptor:currentPageDescriptor(),analysis,transactions:[...txByBlock.values()],flags:model?.flags,hasPreview:!!previewRenderer,addTextMode,formatContext,reflowMetrics:previewReflowMetrics})};
}
