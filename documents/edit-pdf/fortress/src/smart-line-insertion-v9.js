import { attachSmartLineInsertion as attachV8 } from './smart-line-insertion-v8.js';
import { pdfRectToScreen } from './utils/coordinates.js';

const ORIGINAL_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const EDITABLE_TIERS=new Set(['DIRECT_EDIT','FONT_SUBSTITUTION']);

function isEditable(block){return EDITABLE_TIERS.has(block?.tier);}
function lineHitBounds(line,block){
  const size=Math.max(1,line?.fontSize||block?.fontSize||12);
  const x=Number.isFinite(line?.minX)?line.minX:(block?.bounds?.x||0);
  const maxX=Number.isFinite(line?.maxX)?line.maxX:(x+(block?.bounds?.width||1));
  const baseline=Number.isFinite(line?.y)?line.y:(block?.bounds?.y||0);
  return {x,y:baseline-size*.30,width:Math.max(2,maxX-x),height:Math.max(4,size*1.18)};
}
function shiftBlockInPlace(block,dy){
  if(!dy||!block)return;
  if(block.bounds&&Number.isFinite(block.bounds.y))block.bounds.y+=dy;
  for(const line of block.lines||[]){
    if(Number.isFinite(line.y))line.y+=dy;
    if(line.bounds&&Number.isFinite(line.bounds.y))line.bounds.y+=dy;
    for(const run of line.runs||[])if(Number.isFinite(run.y))run.y+=dy;
  }
}
function negativeMetrics(state){
  return (state?.reflowMetrics||[])
    .filter(metric=>Number(metric?.pageIndex)===Number(state?.pageIndex)&&Number(metric?.delta)<-.01)
    .sort((a,b)=>(Number(a.sequenceIndex)||0)-(Number(b.sequenceIndex)||0));
}

/**
 * Fortress historically positions hit regions using positive/downward reflow
 * metrics only. Until the native core is fully generalized, mirror negative
 * metrics into its in-memory analysis so clicks, Add Text planning, and the
 * visible hit boxes follow the compacted PDF preview.
 */
export function attachSmartLineInsertion(options){
  const {app,getEditor}=options||{};
  if(!app)throw new Error('Edit PDF app element is required');
  const base=attachV8(options);
  let destroyed=false,raf=0,lastAnalysis=null,lastSignature='';

  function applyUpwardGeometry(){
    if(destroyed)return;
    const state=getEditor?.()?.getState?.();
    const analysis=state?.analysis;
    const metrics=negativeMetrics(state);
    if(!analysis||!metrics.length)return;
    const signature=metrics.map(m=>`${m.transactionId||''}:${Number(m.cutY).toFixed(2)}:${Number(m.delta).toFixed(2)}`).join('|');

    // analyzePage creates fresh block objects on each render. Apply each metric
    // once per analysis object, never cumulatively to the same geometry.
    if(lastAnalysis!==analysis){lastAnalysis=analysis;lastSignature='';}
    if(lastSignature!==signature){
      for(const block of analysis.blocks||[]){
        let dy=0;
        for(const metric of metrics){
          const top=(block.bounds?.y||0)+(block.bounds?.height||0)+dy;
          if(top<=Number(metric.cutY)+.75)dy-=Number(metric.delta)||0;
        }
        shiftBlockInPlace(block,dy);
      }
      lastSignature=signature;
    }

    const layer=app.querySelector('.pdf-hit-layer');
    const matrix=layer?.__matrix;
    if(!layer||!matrix)return;
    const hits=[...layer.querySelectorAll(ORIGINAL_SELECTOR)];
    let cursor=0;
    for(const block of analysis.blocks||[]){
      if(!isEditable(block))continue;
      const lines=block.lines?.length?block.lines:[{...block.bounds,minX:block.bounds?.x,maxX:(block.bounds?.x||0)+(block.bounds?.width||1),y:(block.bounds?.y||0)+(block.fontSize||12)*.3,fontSize:block.fontSize||12}];
      for(const line of lines){
        const hit=hits[cursor++];
        if(!hit)continue;
        const rect=pdfRectToScreen(matrix,lineHitBounds(line,block));
        Object.assign(hit.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,4)}px`,height:`${Math.max(rect.height,4)}px`});
      }
    }
  }
  function schedule(){
    if(raf||destroyed)return;
    raf=requestAnimationFrame(()=>{raf=0;applyUpwardGeometry();});
  }
  const observer=new MutationObserver(schedule);
  observer.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']});
  app.addEventListener('pointerup',schedule,true);
  app.addEventListener('click',schedule,true);
  schedule();

  return {
    async prepareDocument(fileOrBytes){return base?.prepareDocument?.(fileOrBytes);},
    getPreparedPages(){return base?.getPreparedPages?.()||[];},
    refreshFlowedHitRegions(){base?.refreshFlowedHitRegions?.();schedule();},
    destroy(){
      destroyed=true;
      if(raf)cancelAnimationFrame(raf);
      observer.disconnect();
      app.removeEventListener('pointerup',schedule,true);
      app.removeEventListener('click',schedule,true);
      base?.destroy?.();
    },
  };
}
