import { attachSmartLineInsertion as attachCore } from './smart-line-insertion-v8-core.js';

const HIT_SELECTOR='.pdf-hit-direct_edit,.pdf-hit-font_substitution';
const EDITABLE_TIERS=new Set(['DIRECT_EDIT','FONT_SUBSTITUTION']);

function isEditable(block){return EDITABLE_TIERS.has(block?.tier);}
function upwardMetrics(state){
  return (state?.reflowMetrics||[])
    .filter(metric=>metric?.direction==='UP'&&Number(metric?.shiftY)>0&&metric?.pageIndex===state?.pageIndex)
    .sort((a,b)=>(Number(a.sequenceIndex)||0)-(Number(b.sequenceIndex)||0));
}
function pdfLineHeight(block,line){return Math.max(4,(Number(line?.fontSize||block?.fontSize)||12)*1.18);}

/**
 * Fortress already aligns hit regions for downward reflow internally. Upward
 * compaction is intentionally isolated in the export wrapper, so this bridge
 * applies only the new positive-PDF-Y shift to the native hit targets after a
 * compacted preview is rendered.
 */
export function attachSmartLineInsertion(options){
  const {app,getEditor}=options||{};
  const core=attachCore(options);
  if(!app)return core;
  let destroyed=false,raf=0;

  function alignCompactedHits(){
    raf=0;
    if(destroyed)return;
    const state=getEditor?.()?.getState?.();
    const metrics=upwardMetrics(state);
    const hits=[...app.querySelectorAll(HIT_SELECTOR)];
    if(!hits.length)return;
    let cursor=0;
    for(const block of state?.analysis?.blocks||[]){
      if(!isEditable(block))continue;
      const lines=block?.lines?.length?block.lines:[null];
      for(const line of lines){
        const hit=hits[cursor++];
        if(!hit)continue;
        let shiftY=0;
        const blockTop=Number(block?.bounds?.y||0)+Number(block?.bounds?.height||0);
        for(const metric of metrics){
          if(blockTop<=Number(metric.cutY)+.75)shiftY+=Number(metric.shiftY)||0;
        }
        if(!shiftY){hit.style.transform='';continue;}
        const rect=hit.getBoundingClientRect();
        const scale=Math.max(.05,rect.height/pdfLineHeight(block,line));
        hit.style.transform=`translateY(${-shiftY*scale}px)`;
      }
    }
  }
  function schedule(){
    if(destroyed||raf)return;
    raf=requestAnimationFrame(alignCompactedHits);
  }
  const observer=new MutationObserver(schedule);
  observer.observe(app,{subtree:true,childList:true});
  app.addEventListener('transitionend',schedule,true);
  schedule();

  return {
    ...core,
    async prepareDocument(fileOrBytes){const value=await core?.prepareDocument?.(fileOrBytes);schedule();return value;},
    refreshFlowedHitRegions(){const value=core?.refreshFlowedHitRegions?.();schedule();return value;},
    destroy(){
      destroyed=true;
      if(raf)cancelAnimationFrame(raf);
      observer.disconnect();
      app.removeEventListener('transitionend',schedule,true);
      core?.destroy?.();
    },
  };
}
