import { PDFDocument } from '../fortress/src/core/pdf-lib.js';
import { loadPdfjs } from '../fortress/src/rendering/pdfjs.js';
import { createAdvancedPdfTextEngine } from '../fortress/src/main.js';
import { createPdfPageClassifier } from './classifier.js';
import { createScannedPdfEditor } from './scan-editor.js';

const OCR_PAGE_CONFIDENCE_MIN=.85;
const NATIVE_BUSY_RE=/Reading document|Finding editable text|Applying edits|Adding text|Updating added text|Validating edited PDF/i;

function button(label,className=''){
  const b=document.createElement('button');
  b.type='button';b.textContent=label;if(className)b.className=className;
  return b;
}
function copyBytes(bytes){return bytes instanceof Uint8Array?new Uint8Array(bytes):new Uint8Array(bytes||0);}
function safeName(name){return `${String(name||'document.pdf').replace(/\.pdf$/i,'')}-edited.pdf`;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function makePdfFile(bytes,name){
  try{return new File([bytes],name,{type:'application/pdf'});}catch{
    const blob=new Blob([bytes],{type:'application/pdf'});
    try{Object.defineProperty(blob,'name',{value:name});}catch{}
    return blob;
  }
}
function pageRoute(classification){
  return classification?.kind==='scanned'&&Number(classification?.confidence)>=OCR_PAGE_CONFIDENCE_MIN?'ocr':'native';
}

async function extractSinglePage(sourceBytes,pageIndex){
  const source=await PDFDocument.load(sourceBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  if(pageIndex<0||pageIndex>=source.getPageCount())throw new RangeError('Source PDF page is unavailable.');
  const out=await PDFDocument.create();
  const [page]=await out.copyPages(source,[pageIndex]);
  out.addPage(page);
  return new Uint8Array(await out.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
}

async function replacePageFromSinglePagePdf(doc,pageIndex,pageBytes){
  const one=await PDFDocument.load(pageBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  if(one.getPageCount()!==1)throw Object.assign(new Error('OCR page snapshot is not a single-page PDF.'),{code:'HYBRID_OCR_PAGE_INVALID'});
  if(pageIndex<0||pageIndex>=doc.getPageCount())throw Object.assign(new Error('OCR target page no longer exists in the final document.'),{code:'HYBRID_PAGE_INDEX_CHANGED'});
  const [replacement]=await doc.copyPages(one,[0]);
  doc.insertPage(pageIndex,replacement);
  doc.removePage(pageIndex+1);
}

async function verifyHybridPdf(bytes,{expectedPages,touchedPages=[]}={}){
  const structural=await PDFDocument.load(bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  if(structural.getPageCount()!==expectedPages){
    throw Object.assign(new Error('Hybrid export page-count validation failed.'),{code:'HYBRID_PAGE_COUNT_MISMATCH',expectedPages,actualPages:structural.getPageCount()});
  }
  const pdfjs=await loadPdfjs();
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    if(pdf.numPages!==expectedPages)throw Object.assign(new Error('Hybrid render validation page count differs.'),{code:'HYBRID_RENDER_PAGE_COUNT_MISMATCH'});
    const checks=new Set([0,Math.max(0,expectedPages-1),...touchedPages].filter(i=>Number.isInteger(i)&&i>=0&&i<expectedPages));
    for(const pageIndex of checks){
      const page=await pdf.getPage(pageIndex+1);
      await page.getOperatorList();
    }
  }finally{
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}

function hideNativeManagedControls(host){
  for(const label of ['Close document','Save a copy','Previous page','Next page']){
    const control=host.querySelector(`button[aria-label="${label}"]`);
    if(control)control.hidden=true;
  }
}
function hideOcrManagedControls(host){
  const label=host.querySelector('.ocr-page-label');if(label)label.hidden=true;
  for(const control of host.querySelectorAll('.ocr-toolbar button')){
    if(['Previous','Next','Save a copy','Close'].includes(control.textContent?.trim()))control.hidden=true;
  }
}

export function createHybridPdfEditor({
  container,
  onStatus=()=>{},
  onWarning=()=>{},
  onError=()=>{},
  onExport=()=>{},
  onClose=()=>{},
  prepareNativeDocument=null,
}={}){
  if(!container)throw new Error('Hybrid Edit PDF container is required.');

  let sourceFile=null,sourceBytes=null,sourceName='document.pdf',pageCount=0,pages=[];
  let activePageIndex=0,nativeEngine=null,activeOcrEditor=null,activeOcrPageIndex=null;
  let classifier=null,nativeExportCapture=null,destroyed=false,busy=false,nativePrepared=false;

  const root=document.createElement('div');root.className='hybrid-pdf-editor';
  const toolbar=document.createElement('div');toolbar.className='ocr-toolbar hybrid-toolbar';
  const close=button('Close'),prev=button('Previous'),pageLabel=document.createElement('span'),next=button('Next'),save=button('Save a copy','primary');
  pageLabel.className='ocr-page-label hybrid-page-label';
  toolbar.append(close,prev,pageLabel,next,save);
  const nativeHost=document.createElement('div');nativeHost.className='hybrid-native-host';
  const ocrHost=document.createElement('div');ocrHost.className='hybrid-ocr-host';
  root.append(toolbar,nativeHost,ocrHost);container.replaceChildren(root);

  function activePage(){return pages[activePageIndex]||null;}
  function setStatus(message=''){onStatus(message);}
  function updateToolbar(){
    const page=activePage();
    const mode=page?.route==='ocr'?'OCR scan':'Native';
    pageLabel.textContent=pageCount?`Page ${activePageIndex+1} of ${pageCount} · ${mode}`:'Preparing PDF…';
    prev.disabled=busy||activePageIndex<=0;
    next.disabled=busy||activePageIndex>=pageCount-1;
    save.disabled=busy||!pageCount;
    close.disabled=busy;
  }
  function setBusy(value){busy=!!value;updateToolbar();}
  function markNativeDirty(transactions=[]){
    for(const page of pages)page.nativeDirty=false;
    for(const tx of transactions){const page=pages[Number(tx?.pageIndex)];if(page)page.nativeDirty=true;}
  }

  async function ensureNativeEngine(){
    if(nativeEngine)return nativeEngine;
    if(!nativePrepared&&typeof prepareNativeDocument==='function'){
      setStatus('Preparing native PDF editing…');
      await prepareNativeDocument(sourceFile||sourceBytes);
      nativePrepared=true;
    }
    nativeEngine=createAdvancedPdfTextEngine({
      container:nativeHost,
      onStatus:message=>{if(activePage()?.route==='native')setStatus(message||'');},
      onWarning:warning=>onWarning(warning),
      onError:error=>onError(error),
      onChange:transactions=>markNativeDirty(transactions),
      onExport:result=>{nativeExportCapture=result;},
    });
    await nativeEngine.open(sourceFile||sourceBytes);
    hideNativeManagedControls(nativeHost);
    return nativeEngine;
  }

  function nativeSettledFor(targetIndex){
    const state=nativeEngine?.getState?.();
    if(!state||state.pageIndex!==targetIndex||state.analysis?.pageIndex!==targetIndex)return false;
    const status=nativeHost.querySelector('.pdf-fortress-status')?.textContent||'';
    return !NATIVE_BUSY_RE.test(status);
  }

  async function navigateNativeTo(targetIndex){
    const engine=await ensureNativeEngine();
    let current=Number(engine.getState?.().pageIndex)||0;
    let guard=0;
    while(current!==targetIndex){
      if(++guard>pageCount+2)throw new Error('Native page navigation did not converge.');
      const direction=targetIndex>current?'Next page':'Previous page';
      const control=nativeHost.querySelector(`button[aria-label="${direction}"]`);
      if(!control)throw new Error(`Native ${direction.toLowerCase()} control is unavailable.`);
      const expected=current+(targetIndex>current?1:-1);
      control.click();
      const started=performance.now();
      while(!nativeSettledFor(expected)){
        if(performance.now()-started>15000)throw new Error(`Timed out opening native page ${expected+1}.`);
        await sleep(35);
      }
      current=expected;
    }
    hideNativeManagedControls(nativeHost);
  }

  async function destroyActiveOcr({persist=true}={}){
    const editor=activeOcrEditor;
    const pageIndex=activeOcrPageIndex;
    if(!editor){activeOcrPageIndex=null;ocrHost.replaceChildren();return;}
    if(persist&&Number(editor.getState?.().editCount)>0){
      let captured=null;
      const previousCapture=pages[pageIndex]?.ocrCapture;
      pages[pageIndex].ocrCapture=result=>{captured=result;};
      try{
        await editor.save();
        if(!captured?.bytes)throw Object.assign(new Error('OCR page changes could not be serialized safely.'),{code:'HYBRID_OCR_FLUSH_FAILED'});
        pages[pageIndex].ocrBytes=copyBytes(captured.bytes);
        pages[pageIndex].ocrDirty=true;
        pages[pageIndex].ocrEditCount=(pages[pageIndex].ocrEditCount||0)+(Number(captured.edits)||Number(editor.getState?.().editCount)||0);
      }finally{
        pages[pageIndex].ocrCapture=previousCapture||null;
      }
    }
    activeOcrEditor=null;activeOcrPageIndex=null;
    try{await editor.destroy?.();}catch(error){console.warn('Hybrid OCR cleanup failed:',error);}
    ocrHost.replaceChildren();
  }

  async function openOcrPage(pageIndex){
    const page=pages[pageIndex];
    if(!page||page.route!=='ocr')throw new Error('Requested page is not routed to OCR.');
    const pageBytes=page.ocrBytes||await extractSinglePage(sourceBytes,pageIndex);
    const pageFile=makePdfFile(pageBytes,`${sourceName.replace(/\.pdf$/i,'')}-page-${pageIndex+1}.pdf`);
    activeOcrPageIndex=pageIndex;
    const openingEditor=createScannedPdfEditor({
      container:ocrHost,
      allowGroupedEditing:false,
      onStatus:message=>{if(activeOcrPageIndex===pageIndex)setStatus(message||'');},
      onWarning:warning=>onWarning(warning),
      onError:error=>onError(error),
      onExport:result=>{
        const capture=pages[pageIndex]?.ocrCapture;
        if(typeof capture==='function')capture(result);
      },
      onClose:()=>{},
    });
    activeOcrEditor=openingEditor;
    try{
      await openingEditor.open(pageFile);
      if(activeOcrEditor!==openingEditor)throw new Error('OCR page session was replaced while opening.');
      hideOcrManagedControls(ocrHost);
    }catch(error){
      if(activeOcrEditor===openingEditor){activeOcrEditor=null;activeOcrPageIndex=null;}
      try{await openingEditor.destroy?.();}catch(cleanupError){console.warn('Failed OCR page cleanup:',cleanupError);}
      ocrHost.replaceChildren();
      throw error;
    }
  }

  async function activatePage(pageIndex,{skipOcrFlush=false}={}){
    if(destroyed)return;
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=pageCount)return;
    if(!skipOcrFlush&&activeOcrEditor)await destroyActiveOcr({persist:true});
    activePageIndex=pageIndex;updateToolbar();
    const page=activePage();
    if(page.route==='ocr'){
      nativeHost.hidden=true;ocrHost.hidden=false;
      await openOcrPage(pageIndex);
      setStatus(`Page ${pageIndex+1} is image-only and is using safe OCR editing. Run OCR, then click a recognized word.`);
    }else{
      ocrHost.hidden=true;nativeHost.hidden=false;
      await navigateNativeTo(pageIndex);
      const kind=page.classification?.kind;
      if(kind==='mixed'||kind==='unknown')setStatus(`Page ${pageIndex+1} is ${kind}. Using the native safety path because OCR ownership is not certain.`);
    }
    updateToolbar();
  }

  function assertNativeOwnership(nativeResult,transactions){
    for(const tx of transactions){
      if(pages[Number(tx?.pageIndex)]?.route==='ocr'){
        throw Object.assign(new Error('A native edit targeted an OCR-owned page. Save was stopped to prevent a partial document.'),{code:'HYBRID_PAGE_OWNERSHIP_CONFLICT'});
      }
    }
    for(const metric of nativeResult?.reflowMetrics||[]){
      const count=Math.max(0,Number(metric?.cascadedPageCount)||0);
      if(!count)continue;
      const tx=transactions.find(item=>item.id===metric.transactionId);
      const targets=(tx?.reflowPlan?.cascadePages||[]).slice(0,count).map(item=>Number(item?.pageIndex)).filter(Number.isInteger);
      for(const target of targets){
        if(pages[target]?.route==='ocr'){
          throw Object.assign(new Error(`Native page flow would move content through OCR page ${target+1}. This mixed-layout save is refused until cross-engine cascade ownership can be proven safe.`),{code:'HYBRID_CASCADE_CROSSES_OCR_PAGE',pageIndex:target});
        }
      }
    }
  }

  async function buildHybridExport(){
    const transactions=nativeEngine?.getState?.().transactions||[];
    const ocrDirty=pages.map((page,pageIndex)=>({page,pageIndex})).filter(({page})=>page.ocrDirty&&page.ocrBytes);
    if(!transactions.length&&!ocrDirty.length){
      onWarning({code:'HYBRID_NO_EDITS',message:'No PDF changes have been made yet.'});
      return null;
    }

    let baseBytes=sourceBytes,nativeResult=null;
    if(transactions.length){
      nativeExportCapture=null;
      nativeResult=await nativeEngine.save();
      const nativeBytes=nativeResult?.bytes||nativeExportCapture?.bytes;
      if(!nativeBytes)throw Object.assign(new Error('Native edits could not be serialized safely.'),{code:'HYBRID_NATIVE_EXPORT_MISSING'});
      assertNativeOwnership(nativeResult||nativeExportCapture,transactions);
      baseBytes=copyBytes(nativeBytes);
    }

    const doc=await PDFDocument.load(baseBytes.slice(),{ignoreEncryption:true,updateMetadata:false});
    const expectedPages=doc.getPageCount();
    if(expectedPages<pageCount)throw Object.assign(new Error('Native export removed an original PDF page.'),{code:'HYBRID_NATIVE_PAGE_LOSS'});
    for(const {page,pageIndex} of ocrDirty)await replacePageFromSinglePagePdf(doc,pageIndex,page.ocrBytes);

    const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
    const touchedPages=[...new Set([
      ...transactions.map(tx=>Number(tx?.pageIndex)),
      ...ocrDirty.map(item=>item.pageIndex),
    ])].filter(Number.isInteger);
    await verifyHybridPdf(bytes,{expectedPages,touchedPages});
    return {
      bytes,
      blob:new Blob([bytes],{type:'application/pdf'}),
      filename:safeName(sourceName),
      mode:'hybrid',
      nativeEditCount:transactions.length,
      ocrEditCount:ocrDirty.reduce((sum,{page})=>sum+(page.ocrEditCount||0),0),
      ocrEditedPages:ocrDirty.map(item=>item.pageIndex),
      nativeResult,
      expectedPages,
    };
  }

  async function saveCopy(){
    if(!sourceBytes)throw new Error('No PDF open.');
    if(busy)return null;
    const reopenOcr=activePage()?.route==='ocr';
    setBusy(true);
    try{
      if(activeOcrEditor)await destroyActiveOcr({persist:true});
      setStatus('Validating native and OCR changes together…');
      const result=await buildHybridExport();
      if(!result){if(reopenOcr&&!destroyed)await openOcrPage(activePageIndex);return null;}
      onExport(result);
      if(reopenOcr&&!destroyed)await openOcrPage(activePageIndex);
      setStatus(`Hybrid PDF validated — ${result.nativeEditCount} native change${result.nativeEditCount===1?'':'s'}, ${result.ocrEditCount} OCR change${result.ocrEditCount===1?'':'s'} — download ready.`);
      return result;
    }catch(error){
      if(reopenOcr&&!destroyed&&!activeOcrEditor){try{await openOcrPage(activePageIndex);}catch{} }
      onError(error);setStatus(error?.message||'Hybrid PDF could not be saved safely.');throw error;
    }finally{
      setBusy(false);
    }
  }

  async function open(file){
    if(destroyed)throw new Error('Hybrid editor has been destroyed.');
    sourceFile=file instanceof Uint8Array?null:file;
    sourceName=file?.name||'document.pdf';
    sourceBytes=file instanceof Uint8Array?copyBytes(file):new Uint8Array(await file.arrayBuffer());
    setBusy(true);
    try{
      setStatus('Analyzing every PDF page for native or OCR editing…');
      classifier=await createPdfPageClassifier(sourceBytes);
      pageCount=classifier.pageCount;
      if(!pageCount)throw new Error('This PDF has no pages.');
      const classifications=await classifier.classifyAll({onProgress:({pageIndex,pageCount})=>setStatus(`Checking page ${pageIndex+1} of ${pageCount}…`)});
      pages=classifications.map(classification=>({classification,route:pageRoute(classification),nativeDirty:false,ocrDirty:false,ocrBytes:null,ocrEditCount:0,ocrCapture:null}));
      await classifier.destroy();classifier=null;
      const nativeCount=pages.filter(page=>page.route==='native').length;
      const ocrCount=pageCount-nativeCount;
      setStatus(`Hybrid routing ready — ${nativeCount} native page${nativeCount===1?'':'s'}, ${ocrCount} OCR page${ocrCount===1?'':'s'}.`);
      setBusy(false);
      await activatePage(0,{skipOcrFlush:true});
      return getState();
    }catch(error){
      setBusy(false);onError(error);throw error;
    }
  }

  function getState(){
    const nativeState=nativeEngine?.getState?.()||{};
    return {
      ...nativeState,
      mode:'hybrid',
      activeRoute:activePage()?.route||null,
      pageIndex:activePageIndex,
      pageCount,
      transactions:nativeState.transactions||[],
      pageRoutes:pages.map((page,index)=>({pageIndex:index,route:page.route,classification:page.classification,dirty:!!(page.nativeDirty||page.ocrDirty)})),
      ocrEditedPages:pages.map((page,index)=>page.ocrDirty?index:null).filter(Number.isInteger),
    };
  }

  function setMode(mode){
    if(activePage()?.route!=='native'||!nativeEngine){onWarning({code:'HYBRID_MODE_NOT_NATIVE',message:'Add Text and native formatting are available on native PDF pages.'});return;}
    return nativeEngine.setMode?.(mode);
  }
  async function undo(){if(activePage()?.route==='native')return nativeEngine?.undo?.();}
  async function redo(){if(activePage()?.route==='native')return nativeEngine?.redo?.();}

  async function destroy(){
    if(destroyed)return;destroyed=true;
    try{await destroyActiveOcr({persist:false});}catch{}
    try{nativeEngine?.destroy?.();}catch{}
    nativeEngine=null;
    try{await classifier?.destroy?.();}catch{}
    classifier=null;pages=[];sourceBytes=null;sourceFile=null;container.replaceChildren();
  }

  prev.addEventListener('click',()=>{if(!busy&&activePageIndex>0){setBusy(true);activatePage(activePageIndex-1).catch(error=>{onError(error);setStatus(error?.message||'Could not open the previous page.');}).finally(()=>setBusy(false));}});
  next.addEventListener('click',()=>{if(!busy&&activePageIndex<pageCount-1){setBusy(true);activatePage(activePageIndex+1).catch(error=>{onError(error);setStatus(error?.message||'Could not open the next page.');}).finally(()=>setBusy(false));}});
  save.addEventListener('click',()=>{saveCopy().catch(()=>{});});
  close.addEventListener('click',()=>{destroy().then(()=>onClose()).catch(onError);});
  updateToolbar();

  return {open,destroy,getState,setMode,undo,redo,save:saveCopy};
}
