// Source objects on a reflowed page can be nested, moved or replaced by the
// native exporter. Do not apply stale identities from the original package.
export function assertObjectLayout(changes,state,originalPages,outputPages){
  if(outputPages!==originalPages)throw new Error('Page count changed. Undo page-flow or object edits before exporting.');
  const affected=new Set();
  for(const metric of state.reflowMetrics||[]){
    const moved=['delta','shiftY','cascadedPageCount','appendedPageCount','overflowPageCount'].some(key=>Number(metric[key]));
    if(!moved)continue;
    if(!Number.isInteger(metric.pageIndex)||metric.pageIndex<0||metric.pageIndex>=originalPages)throw new Error('Text-flow page ownership is unknown. Undo object or text-flow edits before exporting.');
    affected.add(metric.pageIndex);
    if(Number(metric.cascadedPageCount)||Number(metric.appendedPageCount)||Number(metric.overflowPageCount)){
      // Conservatively include later pages if a cascade's exact destinations
      // are not exported. Earlier, untouched pages can still be edited.
      for(let page=metric.pageIndex+1;page<originalPages;page++)affected.add(page);
    }
  }
  const conflict=changes.find(item=>affected.has(item.pageIndex));
  if(conflict)throw new Error(`Image/link edits on page ${conflict.pageIndex+1} conflict with moved text. Undo those object edits or text flow before exporting. Object edits on unaffected pages are supported.`);
  const image=changes.find(item=>item.kind==='image'&&item.source&&(state.ocrEditedPages||[]).includes(item.pageIndex));
  if(image)throw new Error(`Original image edits conflict with OCR patches on page ${image.pageIndex+1}. Undo that image edit or the OCR patch before exporting.`);
}
