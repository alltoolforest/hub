import { attachSmartLineInsertion as attachV2 } from './smart-line-insertion-v2.js';
import { applyToPoint } from './utils/matrices.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function isEditableBlock(block){return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';}
function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}

function selectedFontSize(app){
  const precise=Number(app.querySelector('.pdf-precision-size-input')?.value);
  if(Number.isFinite(precise)&&precise>=6&&precise<=72)return precise;
  const selected=Number(app.querySelector('.pdf-size-select')?.value);
  return Number.isFinite(selected)?clamp(selected,6,72):12;
}

function currentVisualLine(block,state,matrix){
  const line=block?.lines?.[0];
  if(!line||!matrix)return null;
  let y=Number(line.y);
  if(!Number.isFinite(y))return null;
  const top=Number(block?.bounds?.y||0)+Number(block?.bounds?.height||0);
  for(const metric of state?.reflowMetrics||[]){
    if(metric?.pageIndex!==block.pageIndex||!(Number(metric.delta)>0))continue;
    if(top<=Number(metric.cutY)+.75)y-=Number(metric.delta)||0;
  }
  const x=Number.isFinite(Number(line.minX))?Number(line.minX):Number(block?.bounds?.x||0);
  const maxX=Number.isFinite(Number(line.maxX))?Number(line.maxX):x+Number(block?.bounds?.width||1);
  const leftPoint=applyToPoint(matrix,x,y);
  const rightPoint=applyToPoint(matrix,maxX,y);
  return {
    left:Math.min(leftPoint.x,rightPoint.x),
    right:Math.max(leftPoint.x,rightPoint.x),
    baselineY:leftPoint.y,
    pdfY:y,
  };
}

function estimateVisualLines(text,input,fontPx){
  const explicit=String(text||'').replace(/\r\n?/g,'\n').split('\n');
  const usableWidth=Math.max(40,input.clientWidth-18);
  let total=0;
  for(const line of explicit){
    const approxWidth=Math.max(fontPx*.6,Array.from(line||' ').length*fontPx*.54);
    total+=Math.max(1,Math.ceil(approxWidth/usableWidth));
  }
  return Math.max(1,total);
}

function classifyWhitespace(app,state,input,layer,anchor){
  const matrix=layer?.__matrix;
  if(!matrix||!state?.analysis?.blocks?.length)return null;

  const scale=Math.max(Math.hypot(matrix[2]||0,matrix[3]||1),.1);
  const fontSize=selectedFontSize(app);
  const fontPx=Math.max(16,fontSize*scale);
  const lineHeight=Math.max(fontPx,fontPx*1.2);
  const anchorTop=anchor&&anchor.pageIndex===state.pageIndex&&anchor.layer===layer?anchor.top:input.offsetTop;
  const anchorLeft=anchor&&anchor.pageIndex===state.pageIndex&&anchor.layer===layer?anchor.left:input.offsetLeft;
  const baselineY=anchorTop+fontPx*.88;
  const visualLines=estimateVisualLines(input.value,input,fontPx);
  const insertedBottom=baselineY+(visualLines-1)*lineHeight+fontPx*.30;
  const insertedLeft=anchorLeft;
  const insertedRight=anchorLeft+Math.max(40,input.clientWidth||180);
  const safety=Math.max(3,fontPx*.22);

  const below=[];
  for(const block of state.analysis.blocks){
    if(!isEditableBlock(block))continue;
    const visual=currentVisualLine(block,state,matrix);
    if(!visual)continue;
    if(overlap(insertedLeft,insertedRight,visual.left,visual.right)<Math.min(8,Math.max(1,visual.right-visual.left)*.2))continue;
    const blockSize=Math.max(8,Number(block?.lines?.[0]?.fontSize||block?.fontSize)||fontSize)*scale;
    const blockTop=visual.baselineY-blockSize*.92;
    const blockBottom=visual.baselineY+blockSize*.30;
    if(blockBottom<=insertedBottom+safety)continue;
    below.push({block,top:blockTop,bottom:blockBottom,distance:blockTop-insertedBottom});
  }

  below.sort((a,b)=>a.top-b.top);
  const nearest=below[0]||null;
  if(!nearest)return {passthrough:true};
  const fits=nearest.distance>=safety;
  return {
    passthrough:false,
    fits,
    belowBlocks:below.map(item=>item.block),
    nearestDistance:nearest.distance,
    fontPx,
    visualLines,
  };
}

/**
 * V3 keeps the working editor and V2 alignment behavior intact. It only fixes
 * the insertion/reflow handoff:
 *   1. capture the true smart insertion anchor before the bottom-page UI bridge
 *      visually moves the textarea;
 *   2. if the new line fits in real whitespace, prevent unnecessary reflow;
 *   3. if movement is really required, expose only content below the inserted
 *      line to the existing planner so reference lines cannot be moved.
 */
export function attachSmartLineInsertion({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false;
  let pendingAnchor=null;

  function captureSyntheticAnchor(event){
    if(destroyed||event.isTrusted)return;
    const layer=event.target?.closest?.('.pdf-hit-layer');
    const state=getEditor?.()?.getState?.();
    if(!layer||!app.contains(layer)||!state?.addTextMode)return;
    if(event.target?.closest?.('textarea,.pdf-insert-actions,.pdf-format-tools'))return;
    const rect=layer.getBoundingClientRect();
    pendingAnchor={
      layer,
      pageIndex:state.pageIndex,
      left:event.clientX-rect.left,
      top:event.clientY-rect.top,
      capturedAt:performance.now(),
    };
  }

  function onInsertDoneCapture(event){
    if(destroyed)return;
    const done=event.target?.closest?.('.pdf-insert-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-new-text-editor"]');
    const layer=app.querySelector('.pdf-hit-layer');
    const state=getEditor?.()?.getState?.();
    if(!input||!layer||!state?.analysis?.blocks?.length)return;

    const recentAnchor=pendingAnchor&&performance.now()-pendingAnchor.capturedAt<120000?pendingAnchor:null;
    const classification=classifyWhitespace(app,state,input,layer,recentAnchor);
    if(!classification||classification.passthrough)return;

    const originalBlocks=state.analysis.blocks;
    state.analysis.blocks=classification.fits?[]:classification.belowBlocks;

    // main.js computes the insertion transaction and its reflow plan
    // synchronously before queueInsertion reaches its first await. Restore the
    // full analysis immediately after the event dispatch completes.
    queueMicrotask(()=>{
      if(state.analysis)state.analysis.blocks=originalBlocks;
    });
    setTimeout(()=>{pendingAnchor=null;},0);
  }

  // Register before V2. The synthetic smart click generated by V2 bubbles
  // through this listener, allowing us to retain the real insertion anchor.
  app.addEventListener('click',captureSyntheticAnchor,true);
  app.addEventListener('click',onInsertDoneCapture,true);
  const v2=attachV2({app,getEditor});

  return {
    destroy(){
      destroyed=true;
      pendingAnchor=null;
      app.removeEventListener('click',captureSyntheticAnchor,true);
      app.removeEventListener('click',onInsertDoneCapture,true);
      v2?.destroy?.();
    }
  };
}
