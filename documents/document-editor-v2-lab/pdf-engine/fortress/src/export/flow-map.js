// Export-only movement ledger. Draft coordinates remain tied to the input file.
export function mapFlowRectangle(rect,pageIndex,metrics=[]){
 let box={...rect},page=pageIndex;
 if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0)throw new Error('Invalid object geometry.');
 for(const m of metrics){
  const cascade=Number(m.cascadedPageCount)||Number(m.appendedPageCount)||Number(m.overflowPageCount);let slices=m.flowSlices;
  if(!slices){if(cascade&&page>=m.pageIndex)throw new Error('Cross-page flow has no verified object map.');if(page!==m.pageIndex)continue;const dy=m.mode==='SAME_PAGE_UPWARD_COMPACTION'?m.shiftY:m.mode==='VERTICAL_CONTENT_BAND_REFLOW'?-m.delta:0;if(!dy)continue;slices=[{sourcePageIndex:m.pageIndex,destinationPageIndex:m.pageIndex,left:m.bandLeft,right:m.bandRight,bottom:m.footerGuardTop,top:m.cutY,dy}];}
  if(!Array.isArray(slices)||slices.length>1000)throw new Error('Invalid page-flow map.');
  const overlaps=slices.filter(s=>s.sourcePageIndex===page&&box.x<s.right-.01&&box.x+box.width>s.left+.01&&box.y<s.top-.01&&box.y+box.height>s.bottom+.01);
  if(!overlaps.length)continue;
  if(overlaps.length!==1)throw new Error('Object crosses a page-flow boundary.');const s=overlaps[0];
  if(![s.left,s.right,s.bottom,s.top,s.dy].every(Number.isFinite)||!Number.isInteger(s.destinationPageIndex)||s.destinationPageIndex<0||box.x<s.left-.01||box.x+box.width>s.right+.01||box.y<s.bottom-.01||box.y+box.height>s.top+.01)throw new Error('Object crosses a page-flow boundary.');
  box.y+=s.dy;box.x+=s.dx||0;page=s.destinationPageIndex;
 }
 return {...box,pageIndex:page};
}
