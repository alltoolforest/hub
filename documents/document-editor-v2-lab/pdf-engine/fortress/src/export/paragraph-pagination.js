// Page-length paragraphs are split by measured visual lines, never by an
// arbitrary replacement string length. Source/footer geometry sets each frame.
export function paginateInsertedLayout(tx,layout){
 const {height}=layout.pageSize,size=layout.size,step=layout.lineHeight;
 const gap=Math.max(2,Number(tx.reflowPlan?.safetyGap)||4);
 const floor=Math.max(Number(tx.reflowPlan?.footerGuard?.top)||Number(tx.reflowPlan?.bottomMargin)||24,12)+gap;
 const capacity=(y,bottom)=>Math.max(1,Math.floor((y-size*.28-bottom)/step)+1);
 const firstCount=capacity(Number(tx.y),floor);
 if(layout.lines.length<=firstCount)return [{...layout,y:Number(tx.y)}];
 const topMargin=Math.max(28,Number(tx.reflowPlan?.topMargin)||28,size*1.5),bottomMargin=Math.max(24,Number(tx.reflowPlan?.bottomMargin)||24);
 const y=height-topMargin-size*.9,nextCount=capacity(y,bottomMargin);
 const chunks=[];let offset=0,count=firstCount;
 while(offset<layout.lines.length){
  const lines=layout.lines.slice(offset,offset+count),baseline=chunks.length?y:Number(tx.y);
  chunks.push({...layout,lines,y:baseline,bottomY:baseline-(lines.length-1)*step-size*.28});offset+=lines.length;count=nextCount;
  if(chunks.length>512)throw Object.assign(new Error('This paragraph exceeds the document memory budget.'),{code:'PARAGRAPH_MEMORY_BUDGET'});
 }
 return chunks;
}
export function insertContinuationPages(doc,sourcePageIndex,chunks){
 const added=chunks.length-1;if(!added)return null;
 const count=doc.getPageCount(),flowSlices=[];
 for(let i=sourcePageIndex+1;i<count;i++){const {width,height}=doc.getPage(i).getSize();flowSlices.push({sourcePageIndex:i,destinationPageIndex:i+added,left:0,right:width,bottom:0,top:height,dy:0});}
 for(let i=1;i<chunks.length;i++)doc.insertPage(sourcePageIndex+i,[chunks[i].pageSize.width,chunks[i].pageSize.height]);
 return {pageIndex:sourcePageIndex,mode:'INSERTION_CONTINUATION_PAGES',overflowPageCount:added,insertedPageCount:added,flowSlices,continuationPageIndexes:chunks.slice(1).map((_,i)=>sourcePageIndex+i+1)};
}
