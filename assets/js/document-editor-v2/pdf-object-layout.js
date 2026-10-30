import {mapFlowRectangle} from '../../../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/flow-map.js';
// Derive export coordinates from immutable source-page drafts on every save.
export function assertObjectLayout(changes,state,originalPages,outputPages){
 const metrics=state.reflowMetrics||[];
 if(outputPages!==originalPages){const appended=metrics.reduce((sum,m)=>sum+(Number(m.appendedPageCount)||0),0);if(outputPages<originalPages||appended!==outputPages-originalPages)throw new Error('Page count changed without a verified append-only flow. Undo page-flow or object edits before exporting.');}
 const result=changes.map(item=>({...item,...(item.source?{source:{...item.source,rect:item.source.rect?[...item.source.rect]:undefined}}:{})}));
 for(const metric of metrics){
  if(!['delta','shiftY','cascadedPageCount','appendedPageCount','overflowPageCount'].some(k=>Number(metric[k])))continue;
  if(!Number.isInteger(metric.pageIndex)||metric.pageIndex<0||metric.pageIndex>=originalPages)throw new Error('Text-flow page ownership is unknown. Undo object or text-flow edits before exporting.');
  const cascade=Number(metric.cascadedPageCount)||Number(metric.appendedPageCount)||Number(metric.overflowPageCount);
  for(const item of result){
   if(item.pageIndex<metric.pageIndex||item.pageIndex!==metric.pageIndex&&!cascade)continue;
   const conflict=()=>{throw new Error(`Image/link edits on page ${item.pageIndex+1} conflict with moved text. Undo those object edits or text flow before exporting.`);};
   if(item.source&&item.kind==='image')conflict();
   if(cascade&&metric.flowSlices){const beforePage=item.pageIndex,mapped=mapFlowRectangle(item,beforePage,[metric]);item.pageIndex=mapped.pageIndex;item.x=mapped.x;item.y=mapped.y;if(item.source?.rect){const r=item.source.rect,original=mapFlowRectangle({x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1]},beforePage,[metric]);if(original.pageIndex!==item.pageIndex)conflict();item.source.rect=[original.x,original.y,original.x+original.width,original.y+original.height];}continue;}
   if(cascade)conflict();
   const up=metric.mode==='SAME_PAGE_UPWARD_COMPACTION',down=metric.mode==='VERTICAL_CONTENT_BAND_REFLOW';
   if(!up&&!down||up&&Number(metric.delta)||down&&Number(metric.shiftY))conflict();
   const shift=up?metric.shiftY:-metric.delta,{cutY,footerGuardTop,bandLeft,bandRight}=metric;
   if(![cutY,shift,footerGuardTop,bandLeft,bandRight].every(Number.isFinite)||up&&shift<=0||down&&shift>=0||cutY<=footerGuardTop||bandRight<=bandLeft)conflict();
   function map(rect){
    const left=rect.x,right=rect.x+rect.width,bottom=rect.y,top=rect.y+rect.height;
    if(![left,right,bottom,top].every(Number.isFinite))conflict();
    if(top<=footerGuardTop||right<=bandLeft||left>=bandRight)return rect;
    if(bottom>=cutY){if(up&&bottom<cutY+shift)conflict();return rect;}
    if(left<bandLeft||right>bandRight||bottom<footerGuardTop||top>cutY||up&&top+shift>cutY||down&&bottom+shift<footerGuardTop+2)conflict();
    return {...rect,y:rect.y+shift};
   }
   const moved=map(item);item.y=moved.y;
   if(item.source?.rect){const r=item.source.rect,original=map({x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1]});item.source.rect=[original.x,original.y,original.x+original.width,original.y+original.height];}
  }
 }
 const image=result.find(item=>item.kind==='image'&&item.source&&(state.ocrEditedPages||[]).includes(item.pageIndex));if(image)throw new Error(`Original image edits conflict with OCR patches on page ${image.pageIndex+1}. Undo that image edit or the OCR patch before exporting.`);
 return result;
}
