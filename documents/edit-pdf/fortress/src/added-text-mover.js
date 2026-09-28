import { screenPointToPdf } from './utils/coordinates.js';
import { planInsertionReflow } from './layout/reflow-planner.js';

const HIT_SELECTOR='.pdf-hit-inserted';
const DRAG_THRESHOLD=5;
const COMMIT_TIMEOUT=15000;

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function copyPlan(plan){
  if(!plan||typeof plan!=='object')return plan;
  try{return structuredClone(plan);}catch{return JSON.parse(JSON.stringify(plan));}
}
function insertedTransactions(state){
  const pageIndex=Number(state?.pageIndex);
  return (state?.transactions||[]).filter(tx=>tx?.kind==='INSERT_TEXT'&&Number(tx.pageIndex)===pageIndex);
}
function isMovableTransaction(tx){return !!tx&&tx.kind==='INSERT_TEXT'&&!tx.expandedFromBlockId;}
function txForHit(app,hit,state){
  const hits=[...app.querySelectorAll(HIT_SELECTOR)];
  const index=hits.indexOf(hit);
  if(index<0)return null;
  return insertedTransactions(state)[index]||null;
}
function isLatestMovableOnPage(state,tx){
  const page=insertedTransactions(state);
  return isMovableTransaction(tx)&&page.length>0&&page.at(-1)?.id===tx?.id;
}
function layerGeometry(layer,matrix){
  const width=Math.max(1,layer?.clientWidth||Number.parseFloat(layer?.style?.width)||1);
  const height=Math.max(1,layer?.clientHeight||Number.parseFloat(layer?.style?.height)||1);
  const corners=[screenPointToPdf(matrix,0,0),screenPointToPdf(matrix,width,0),screenPointToPdf(matrix,0,height),screenPointToPdf(matrix,width,height)];
  const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
  return {screenWidth:width,screenHeight:height,left:Math.min(...xs),right:Math.max(...xs),bottom:Math.min(...ys),top:Math.max(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
function screenDeltaToPdf(matrix,dx,dy){
  const a=screenPointToPdf(matrix,0,0),b=screenPointToPdf(matrix,dx,dy);
  return {x:b.x-a.x,y:b.y-a.y};
}
function priorMetrics(state,tx){
  const own=String(tx?.id||'');
  return (state?.reflowMetrics||[]).filter(metric=>{
    if(Number(metric?.pageIndex)!==Number(tx?.pageIndex))return false;
    const id=String(metric?.transactionId||'');
    return id!==own&&!id.startsWith(`${own}:styled:`);
  });
}

export function computeMovedInsert({state,tx,layer,matrix,screenDx=0,screenDy=0,pdfDx=null,pdfDy=null}={}){
  if(!state||!tx||!layer||!Array.isArray(matrix)||matrix.length<6)return {ok:false,reason:'MOVE_GEOMETRY_MISSING'};
  if(state.addTextMode)return {ok:false,reason:'MOVE_DISABLED_DURING_ADD_TEXT'};
  if(!isMovableTransaction(tx))return {ok:false,reason:'MOVE_TRANSACTION_UNSAFE'};
  if(!isLatestMovableOnPage(state,tx))return {ok:false,reason:'MOVE_DEPENDENCY_UNSAFE'};
  if(Math.abs(Number(matrix[1])||0)>.02||Math.abs(Number(matrix[2])||0)>.02)return {ok:false,reason:'ROTATED_MOVE_UNSUPPORTED'};

  const page=layerGeometry(layer,matrix);
  const delta=Number.isFinite(pdfDx)&&Number.isFinite(pdfDy)?{x:Number(pdfDx),y:Number(pdfDy)}:screenDeltaToPdf(matrix,Number(screenDx)||0,Number(screenDy)||0);
  const size=Math.max(6,Math.min(72,Number(tx.fontSize)||12));
  const minX=page.left;
  const maxX=Math.max(minX,page.right-48);
  const minY=page.bottom+Math.max(4,size*.35);
  const maxY=page.top-Math.max(4,size*.35);
  const x=clamp((Number(tx.x)||0)+delta.x,minX,maxX);
  const y=clamp((Number(tx.y)||0)+delta.y,minY,maxY);
  const maxWidth=Math.max(40,Math.min(Number(tx.maxWidth)||300,page.right-x-8));
  const reflowPlan=planInsertionReflow({
    blocks:state.analysis?.blocks||[],
    x,y,maxWidth,fontSize:size,
    pageWidth:page.width,pageHeight:page.height,pageRotation:0,
    existingMetrics:priorMetrics(state,tx),
  });
  return {ok:true,x,y,maxWidth,reflowPlan,delta,page};
}

export function attachAddedTextMover({app,getEditor,onStatus=()=>{}}={}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false,active=null,suppressClickUntil=0,programmaticCommit=false,decorateRaf=0;

  function editorState(){return getEditor?.()?.getState?.()||null;}
  function nativeStatus(message,kind=''){
    const el=app.querySelector('.pdf-fortress-status');
    if(el){el.textContent=message||'';if(kind)el.dataset.kind=kind;else delete el.dataset.kind;}
    onStatus(message||'');
  }
  function decorate(){
    decorateRaf=0;
    if(destroyed)return;
    const state=editorState();
    const inserted=insertedTransactions(state);
    const hits=[...app.querySelectorAll(HIT_SELECTOR)];
    for(let i=0;i<hits.length;i++){
      const hit=hits[i],tx=inserted[i];
      const canMove=!!tx&&isLatestMovableOnPage(state,tx)&&!state?.addTextMode;
      hit.dataset.movableInsert=canMove?'true':'false';
      hit.style.cursor=canMove?'move':'';
      if(canMove){
        hit.title='Click to edit added text · drag to move · Alt+Arrow to nudge';
        hit.setAttribute('aria-description','Drag to move this added text. Use Alt plus arrow keys to nudge it; hold Shift for a larger nudge.');
      }else{
        hit.title='Click to edit added text';
        hit.removeAttribute('aria-description');
      }
    }
  }
  function scheduleDecorate(){if(!destroyed&&!decorateRaf)decorateRaf=requestAnimationFrame(decorate);}

  function snapshotTx(tx){return {x:tx.x,y:tx.y,maxWidth:tx.maxWidth,reflowPlan:copyPlan(tx.reflowPlan)};}
  function restoreTx(tx,snapshot){tx.x=snapshot.x;tx.y=snapshot.y;tx.maxWidth=snapshot.maxWidth;tx.reflowPlan=snapshot.reflowPlan;}
  function findTxById(state,id){return (state?.transactions||[]).find(tx=>tx?.id===id)||null;}

  async function waitForInsertEditor(){
    const start=performance.now();
    while(performance.now()-start<1200){
      const input=app.querySelector('textarea[data-role="pdf-new-text-editor"]');
      const done=app.querySelector('.pdf-insert-done');
      if(input&&done)return {input,done};
      await sleep(20);
    }
    return null;
  }

  async function commitMove(hit,move,{clientX=0,clientY=0}={}){
    const state=editorState();
    const tx=txForHit(app,hit,state);
    if(!tx||tx.id!==move.txId)return false;
    const snapshot=snapshotTx(tx);
    tx.x=move.x;tx.y=move.y;tx.maxWidth=move.maxWidth;tx.reflowPlan=move.reflowPlan;
    const layer=hit.closest('.pdf-hit-layer');
    const rect=layer?.getBoundingClientRect?.()||{left:0,top:0};
    programmaticCommit=true;
    try{
      hit.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:clientX||rect.left+8,clientY:clientY||rect.top+8}));
    }finally{programmaticCommit=false;}
    const editorUi=await waitForInsertEditor();
    if(!editorUi){restoreTx(tx,snapshot);nativeStatus('Move could not start safely. The original position was restored.','error');return false;}
    editorUi.done.click();

    const started=performance.now();
    let success=false,failed=false;
    while(performance.now()-started<COMMIT_TIMEOUT){
      const current=findTxById(editorState(),tx.id);
      if(current&&current!==tx&&!editorUi.input.isConnected){success=true;break;}
      const status=app.querySelector('.pdf-fortress-status');
      if(status?.dataset?.kind==='error'&&!editorUi.done.disabled){failed=true;break;}
      await sleep(35);
    }
    const current=findTxById(editorState(),tx.id);
    restoreTx(tx,snapshot);
    if(success){
      nativeStatus('Added text moved safely — Undo restores its previous position.');
      scheduleDecorate();
      return true;
    }
    if(current&&current!==tx){
      try{await getEditor?.()?.undo?.();}catch{}
    }
    const cancel=app.querySelector('.pdf-insert-cancel');
    cancel?.click?.();
    nativeStatus(failed?'That move was rejected by PDF safety checks. The original position was restored.':'The move did not finish safely. The original position was restored.','error');
    scheduleDecorate();
    return false;
  }

  function createGhost(hit,layer){
    const ghost=document.createElement('div');
    ghost.setAttribute('aria-hidden','true');
    const left=Number.parseFloat(hit.style.left)||hit.offsetLeft||0;
    const top=Number.parseFloat(hit.style.top)||hit.offsetTop||0;
    const width=Math.max(12,Number.parseFloat(hit.style.width)||hit.offsetWidth||12);
    const height=Math.max(12,Number.parseFloat(hit.style.height)||hit.offsetHeight||12);
    Object.assign(ghost.style,{position:'absolute',left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`,border:'2px dashed #2563eb',borderRadius:'5px',background:'rgba(37,99,235,.08)',pointerEvents:'none',zIndex:'120',boxSizing:'border-box'});
    layer.append(ghost);
    return ghost;
  }

  function clearActive(){
    const current=active;active=null;
    if(!current)return;
    window.removeEventListener('pointermove',current.onMove,true);
    window.removeEventListener('pointerup',current.onUp,true);
    window.removeEventListener('pointercancel',current.onCancel,true);
    current.ghost?.remove();
    document.documentElement.style.removeProperty('user-select');
  }

  function onPointerDown(event){
    if(destroyed||event.button>0)return;
    const hit=event.target?.closest?.(HIT_SELECTOR);
    if(!hit||!app.contains(hit)||hit.dataset.movableInsert!=='true')return;
    const state=editorState();
    const tx=txForHit(app,hit,state);
    const layer=hit.closest('.pdf-hit-layer');
    const matrix=layer?.__matrix;
    if(!tx||!layer||!matrix||!isLatestMovableOnPage(state,tx))return;
    const layerRect=layer.getBoundingClientRect();
    const start={x:event.clientX,y:event.clientY,localX:event.clientX-layerRect.left,localY:event.clientY-layerRect.top};
    const session={hit,tx,layer,matrix,start,dragging:false,ghost:null,lastDx:0,lastDy:0};
    session.onMove=(moveEvent)=>{
      const dx=moveEvent.clientX-start.x,dy=moveEvent.clientY-start.y;
      session.lastDx=dx;session.lastDy=dy;
      if(!session.dragging&&Math.hypot(dx,dy)>=DRAG_THRESHOLD){
        session.dragging=true;session.ghost=createGhost(hit,layer);document.documentElement.style.userSelect='none';
      }
      if(!session.dragging)return;
      moveEvent.preventDefault();
      session.ghost.style.transform=`translate(${dx}px,${dy}px)`;
    };
    session.onUp=async(upEvent)=>{
      const wasDragging=session.dragging,dx=session.lastDx,dy=session.lastDy;
      const targetClientX=upEvent.clientX,targetClientY=upEvent.clientY;
      clearActive();
      if(!wasDragging)return;
      suppressClickUntil=performance.now()+500;
      upEvent.preventDefault();upEvent.stopPropagation();
      const currentState=editorState();
      const currentTx=findTxById(currentState,tx.id);
      const moved=computeMovedInsert({state:currentState,tx:currentTx,layer,matrix,screenDx:dx,screenDy:dy});
      if(!moved.ok){nativeStatus(moved.reason==='MOVE_DEPENDENCY_UNSAFE'?'Move the most recently added item first so page-flow dependencies stay safe.':'This added text cannot be moved safely in the current layout.','error');return;}
      await commitMove(hit,{...moved,txId:tx.id},{clientX:targetClientX,clientY:targetClientY});
    };
    session.onCancel=()=>clearActive();
    active=session;
    window.addEventListener('pointermove',session.onMove,{capture:true,passive:false});
    window.addEventListener('pointerup',session.onUp,true);
    window.addEventListener('pointercancel',session.onCancel,true);
  }

  function onClickCapture(event){
    if(programmaticCommit)return;
    if(performance.now()<suppressClickUntil&&event.target?.closest?.(HIT_SELECTOR)){event.preventDefault();event.stopImmediatePropagation();}
  }

  async function onKeyDown(event){
    if(destroyed||!event.altKey)return;
    const hit=event.target?.closest?.(HIT_SELECTOR);
    if(!hit||!app.contains(hit)||hit.dataset.movableInsert!=='true')return;
    const arrows=new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
    if(!arrows.has(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();
    const state=editorState();
    const tx=txForHit(app,hit,state),layer=hit.closest('.pdf-hit-layer'),matrix=layer?.__matrix;
    if(!tx||!layer||!matrix)return;
    const step=event.shiftKey?5:1;
    const pdfDx=event.key==='ArrowLeft'?-step:(event.key==='ArrowRight'?step:0);
    const pdfDy=event.key==='ArrowDown'?-step:(event.key==='ArrowUp'?step:0);
    const moved=computeMovedInsert({state,tx,layer,matrix,pdfDx,pdfDy});
    if(!moved.ok){nativeStatus('This added text cannot be nudged safely in the current layout.','error');return;}
    suppressClickUntil=performance.now()+300;
    await commitMove(hit,{...moved,txId:tx.id});
  }

  app.addEventListener('pointerdown',onPointerDown,true);
  app.addEventListener('click',onClickCapture,true);
  app.addEventListener('keydown',onKeyDown,true);
  const observer=new MutationObserver(scheduleDecorate);
  observer.observe(app,{subtree:true,childList:true});
  scheduleDecorate();

  return {refresh:scheduleDecorate,destroy(){destroyed=true;clearActive();if(decorateRaf)cancelAnimationFrame(decorateRaf);observer.disconnect();app.removeEventListener('pointerdown',onPointerDown,true);app.removeEventListener('click',onClickCapture,true);app.removeEventListener('keydown',onKeyDown,true);}};
}
