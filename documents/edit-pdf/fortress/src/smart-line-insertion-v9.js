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
  }
}
function cloneGeometryBlock(block){
  return {
    ...block,
    bounds:block?.bounds?{...block.bounds}:block?.bounds,
    lines:(block?.lines||[]).map(line=>({...line,bounds:line?.bounds?{...line.bounds}:line?.bounds})),
  };
}
function pageMetrics(state){
  return (state?.reflowMetrics||[])
    .filter(metric=>Number(metric?.pageIndex)===Number(state?.pageIndex)&&Math.abs(Number(metric?.delta)||0)>.01)
    .sort((a,b)=>(Number(a.sequenceIndex)||0)-(Number(b.sequenceIndex)||0));
}
function snapshotGeometry(analysis){
  const map=new Map();
  for(const block of analysis?.blocks||[]){
    map.set(block.id,{
      bounds:block.bounds?{...block.bounds}:null,
      lines:(block.lines||[]).map(line=>({y:line.y,bounds:line.bounds?{...line.bounds}:null})),
    });
  }
  return map;
}
function restoreGeometry(analysis,snapshot){
  for(const block of analysis?.blocks||[]){
    const saved=snapshot.get(block.id);if(!saved)continue;
    if(saved.bounds&&block.bounds)Object.assign(block.bounds,saved.bounds);
    for(let i=0;i<(block.lines||[]).length;i++){
      const line=block.lines[i],savedLine=saved.lines[i];if(!savedLine)continue;
      line.y=savedLine.y;
      if(savedLine.bounds&&line.bounds)Object.assign(line.bounds,savedLine.bounds);
    }
  }
}
function applyMetricsToBlock(block,metrics,predicate=()=>true){
  for(const metric of metrics){
    if(!predicate(metric))continue;
    const top=(block.bounds?.y||0)+(block.bounds?.height||0);
    if(top<=Number(metric.cutY)+.75)shiftBlockInPlace(block,-Number(metric.delta||0));
  }
  return block;
}
function setHitRect(hit,rect){
  const values={left:`${rect.left}px`,top:`${rect.top}px`,width:`${Math.max(rect.width,4)}px`,height:`${Math.max(rect.height,4)}px`};
  for(const [key,value] of Object.entries(values))if(hit.style[key]!==value)hit.style[key]=value;
}

/**
 * Fortress historically positions hit regions using positive/downward reflow
 * metrics only. Mirror negative metrics into the in-memory analysis for future
 * planning, while positioning hit boxes from the complete signed metric set.
 */
export function attachSmartLineInsertion(options){
  const {app,getEditor}=options||{};
  if(!app)throw new Error('Edit PDF app element is required');
  const base=attachV8(options);
  let destroyed=false,raf=0,lastAnalysis=null,snapshot=new Map(),hadNegative=false;

  function applyUpwardGeometry(){
    if(destroyed)return;
    const state=getEditor?.()?.getState?.();
    const analysis=state?.analysis;
    if(!analysis)return;
    const metrics=pageMetrics(state);
    const negative=metrics.filter(metric=>Number(metric.delta)<0);
    if(lastAnalysis!==analysis){lastAnalysis=analysis;snapshot=snapshotGeometry(analysis);hadNegative=false;}
    if(!negative.length&&!hadNegative)return;
    hadNegative=negative.length>0;

    // Always restore the fresh/original geometry first so undo/redo and repeated
    // render notifications cannot accumulate the same shift twice.
    restoreGeometry(analysis,snapshot);
    for(const block of analysis.blocks||[])applyMetricsToBlock(block,negative);

    const layer=app.querySelector('.pdf-hit-layer');
    const matrix=layer?.__matrix;
    if(!layer||!matrix)return;
    const hits=[...layer.querySelectorAll(ORIGINAL_SELECTOR)];
    let cursor=0;
    for(const block of analysis.blocks||[]){
      if(!isEditable(block))continue;
      // analysis already contains negative shifts. Apply positive metrics only
      // to a display clone, because the native planner already accounts for
      // positive metrics and must not see them twice.
      const shown=applyMetricsToBlock(cloneGeometryBlock(block),metrics,metric=>Number(metric.delta)>0);
      const lines=shown.lines?.length?shown.lines:[{...shown.bounds,minX:shown.bounds?.x,maxX:(shown.bounds?.x||0)+(shown.bounds?.width||1),y:(shown.bounds?.y||0)+(shown.fontSize||12)*.3,fontSize:shown.fontSize||12}];
      for(const line of lines){
        const hit=hits[cursor++];
        if(!hit)continue;
        setHitRect(hit,pdfRectToScreen(matrix,lineHitBounds(line,shown)));
      }
    }
  }
  function schedule(){
    if(raf||destroyed)return;
    raf=requestAnimationFrame(()=>{raf=0;applyUpwardGeometry();});
  }
  const observer=new MutationObserver(schedule);
  observer.observe(app,{subtree:true,childList:true});
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
