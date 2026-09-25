import { attachSmartLineInsertion as attachV2 } from './smart-line-insertion-v2.js';
import { applyToPoint } from './utils/matrices.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function isEditableBlock(block){return block?.tier==='DIRECT_EDIT'||block?.tier==='FONT_SUBSTITUTION';}

function selectedFontSize(app){
  const precise=Number(app.querySelector('.pdf-precision-size-input')?.value);
  if(Number.isFinite(precise)&&precise>=6&&precise<=72)return precise;
  const selected=Number(app.querySelector('.pdf-size-select')?.value);
  return Number.isFinite(selected)?clamp(selected,6,72):12;
}

function currentVisualBaseline(block,state,matrix){
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
  const point=applyToPoint(matrix,x,y);
  return {x:point.x,y:point.y,pdfY:y};
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

function classifyWhitespace(app,state,input,layer){
  const matrix=layer?.__matrix;
  if(!matrix||!state?.analysis?.blocks?.length)return null;

  const scale=Math.max(Math.hypot(matrix[2]||0,matrix[3]||1),.1);
  const fontSize=selectedFontSize(app);
  const fontPx=Math.max(16,fontSize*scale);
  const lineHeight=Math.max(fontPx,fontPx*1.2);
  const baselineY=input.offsetTop+fontPx*.88;
  const visualLines=estimateVisualLines(input.value,input,fontPx);
  const insertedBottom=baselineY+(visualLines-1)*lineHeight+fontPx*.30;
  const safety=Math.max(3,fontPx*.22);

  const below=[];
  for(const block of state.analysis.blocks){
    if(!isEditableBlock(block))continue;
    const baseline=currentVisualBaseline(block,state,matrix);
    if(!baseline)continue;
    const blockSize=Math.max(8,Number(block?.lines?.[0]?.fontSize||block?.fontSize)||fontSize)*scale;
    const blockTop=baseline.y-blockSize*.92;
    const blockBottom=baseline.y+blockSize*.30;
    if(blockBottom<=insertedBottom+safety)continue;
    below.push({block,top:blockTop,bottom:blockBottom,distance:blockTop-insertedBottom});
  }

  below.sort((a,b)=>a.top-b.top);
  const nearest=below[0]||null;
  const fits=!nearest||nearest.distance>=safety;
  return {fits,belowBlocks:below.map(item=>item.block),nearestDistance:nearest?.distance??Infinity,fontPx,visualLines};
}

/**
 * V3 leaves the working editor and V2 alignment code intact. Its only job is to
 * prevent unnecessary reflow when an inserted line already fits in real visual
 * whitespace. If movement is required, it restricts the planner to content that
 * is actually below the inserted text so the reference list cannot be moved.
 */
export function attachSmartLineInsertion({app,getEditor}){
  if(!app)throw new Error('Edit PDF app element is required');
  let destroyed=false;

  function onInsertDoneCapture(event){
    if(destroyed)return;
    const done=event.target?.closest?.('.pdf-insert-done');
    if(!done||!app.contains(done))return;
    const input=app.querySelector('textarea[data-role="pdf-new-text-editor"]');
    const layer=app.querySelector('.pdf-hit-layer');
    const state=getEditor?.()?.getState?.();
    if(!input||!layer||!state?.analysis?.blocks?.length)return;

    const classification=classifyWhitespace(app,state,input,layer);
    if(!classification)return;

    const originalBlocks=state.analysis.blocks;
    state.analysis.blocks=classification.fits?[]:classification.belowBlocks;

    // The core Done handler computes the transaction/reflow plan synchronously
    // before its first await. Restore the full analysis immediately afterwards
    // so rendering, editing and later operations continue to see every block.
    queueMicrotask(()=>{
      if(state.analysis)state.analysis.blocks=originalBlocks;
    });
  }

  // Register before V2 so this guard is already active when V2 automates Done.
  app.addEventListener('click',onInsertDoneCapture,true);
  const v2=attachV2({app,getEditor});

  return {
    destroy(){
      destroyed=true;
      app.removeEventListener('click',onInsertDoneCapture,true);
      v2?.destroy?.();
    }
  };
}
