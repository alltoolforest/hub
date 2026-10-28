// Object drafts retain original coordinates. Derive export positions afresh so
// preview, repeated exports and recovery never accumulate a movement twice.
export function assertObjectLayout(changes,state,originalPages,outputPages){
  const metrics=state.reflowMetrics||[];
  if(outputPages!==originalPages){
    const appended=metrics.reduce((sum,m)=>sum+(Number(m.appendedPageCount)||0),0);
    if(outputPages<originalPages||appended!==outputPages-originalPages)throw new Error('Page count changed without a verified append-only flow. Undo page-flow or object edits before exporting.');
  }
  const result=changes.map(item=>({...item}));
  for(const metric of metrics){
    const moved=['delta','shiftY','cascadedPageCount','appendedPageCount','overflowPageCount'].some(key=>Number(metric[key]));
    if(!moved)continue;
    if(!Number.isInteger(metric.pageIndex)||metric.pageIndex<0||metric.pageIndex>=originalPages)throw new Error('Text-flow page ownership is unknown. Undo object or text-flow edits before exporting.');
    const cascade=Number(metric.cascadedPageCount)||Number(metric.appendedPageCount)||Number(metric.overflowPageCount);
    for(const item of result){
      if(item.pageIndex<metric.pageIndex||item.pageIndex!==metric.pageIndex&&!cascade)continue;
      const conflict=()=>{throw new Error(`Image/link edits on page ${item.pageIndex+1} conflict with moved text. Undo those object edits or text flow before exporting.`);};
      // Original image operator identities can become nested in sliced pages.
      // Only additions have an identity independent of that page reconstruction.
      if(item.source||cascade||metric.mode!=='SAME_PAGE_UPWARD_COMPACTION'||Number(metric.delta))conflict();
      const {cutY,shiftY,footerGuardTop,bandLeft,bandRight}=metric;
      if(![cutY,shiftY,footerGuardTop,bandLeft,bandRight].every(Number.isFinite)||shiftY<=0||cutY<=footerGuardTop||bandRight<=bandLeft)conflict();
      const left=item.x,right=item.x+item.width,bottom=item.y,top=item.y+item.height;
      if(![left,right,bottom,top].every(Number.isFinite))conflict();
      // Fixed header/footer/side lanes stay fixed. Reject rectangles straddling
      // a slice boundary rather than splitting or clipping an object.
      if(top<=footerGuardTop||right<=bandLeft||left>=bandRight)continue;
      if(bottom>=cutY){if(bottom<cutY+shiftY)conflict();continue;}
      if(left<bandLeft||right>bandRight||bottom<footerGuardTop||top>cutY)conflict();
      // The moving slice overlays the deleted-line space. An addition reaching
      // the stationary upper slice could obscure surviving text there.
      if(top+shiftY>cutY)conflict();
      item.y+=shiftY;
    }
  }
  const image=result.find(item=>item.kind==='image'&&item.source&&(state.ocrEditedPages||[]).includes(item.pageIndex));
  if(image)throw new Error(`Original image edits conflict with OCR patches on page ${image.pageIndex+1}. Undo that image edit or the OCR patch before exporting.`);
  return result;
}
