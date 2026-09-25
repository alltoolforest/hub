function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

let cascadePageGeometry=[];

export function configureCascadePageGeometry(pages=[]){
  cascadePageGeometry=Array.isArray(pages)?pages.filter(page=>Number.isInteger(page?.pageIndex)&&page.pageIndex>=0).map(page=>({...page})):[];
}

function rectOf(block){
  const b=block?.bounds;
  if(!b)return null;
  const x=Number(b.x),y=Number(b.y),width=Number(b.width),height=Number(b.height);
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left:x,right:x+width,bottom:y,top:y+height,width,height};
}

function lineRectOf(block,line){
  const b=line?.bounds;
  if(b){
    const x=Number(b.x),y=Number(b.y),width=Number(b.width),height=Number(b.height);
    if([x,y,width,height].every(Number.isFinite)&&width>0&&height>0)return {left:x,right:x+width,bottom:y,top:y+height,width,height};
  }
  const size=Math.max(1,Number(line?.fontSize||block?.fontSize)||12);
  const left=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x||0);
  const right=Number.isFinite(Number(line?.maxX))?Number(line.maxX):left+Number(block?.bounds?.width||1);
  const baseline=Number.isFinite(Number(line?.y))?Number(line.y):Number(block?.bounds?.y||0)+size*.30;
  if(![left,right,baseline,size].every(Number.isFinite)||right<=left)return rectOf(block);
  const descent=Math.max(size*.24,1.5);
  const ascent=Math.max(size*.86,2);
  return {left,right,bottom:baseline-descent,top:baseline+ascent,width:right-left,height:ascent+descent};
}

function horizontalOverlap(aLeft,aRight,bLeft,bRight){
  return Math.max(0,Math.min(aRight,bRight)-Math.max(aLeft,bLeft));
}

function shiftedRect(rect,dy){return {...rect,bottom:rect.bottom+dy,top:rect.top+dy};}

function overflowedTargetsFromMetrics(metrics=[]){
  const blockIds=new Set();
  const lineIds=new Set();
  for(const metric of metrics||[]){
    for(const id of metric?.overflowedBlockIds||[])if(id)blockIds.add(id);
    for(const id of metric?.overflowedLineIds||[])if(id)lineIds.add(id);
  }
  return {blockIds,lineIds};
}

function inferContentBand(moved,{laneLeft,laneRight,pageWidth,size}){
  if(!moved.length)return null;
  const padding=Math.max(12,size);
  const minStaticMargin=Math.max(10,size*.65);
  const minLeft=Math.min(laneLeft,...moved.map(({rect})=>rect.left));
  const maxRight=Math.max(laneRight,...moved.map(({rect})=>rect.right));
  let left=clamp(minLeft-padding,0,pageWidth);
  let right=clamp(maxRight+padding,0,pageWidth);
  if(left<minStaticMargin)left=0;
  if(pageWidth-right<minStaticMargin)right=pageWidth;
  const width=right-left;
  if(width<Math.max(120,pageWidth*.30))return null;
  return {left,right,width,leftStaticWidth:left,rightStaticWidth:pageWidth-right,padding};
}

function inferFooterGuard(moved,{pageHeight,size,bottomMargin}){
  if(!moved.length)return {enabled:false,top:bottomMargin,height:bottomMargin,reason:'NO_MOVABLE_CONTENT'};
  const contentBottomY=Math.min(...moved.map(({rect})=>rect.bottom));
  const clearance=Math.max(6,size*.60);
  const maxGuardHeight=Math.max(36,Math.min(72,pageHeight*.085));
  const candidate=Math.min(maxGuardHeight,contentBottomY-clearance);
  if(!Number.isFinite(candidate)||candidate<=bottomMargin+2){
    return {enabled:false,top:bottomMargin,height:bottomMargin,clearance,contentBottomY,reason:'FOOTER_GUARD_SPACE_INSUFFICIENT'};
  }
  const top=clamp(candidate,bottomMargin,Math.min(pageHeight*.18,contentBottomY-clearance));
  return {enabled:top>bottomMargin+2,top,height:top,clearance,contentBottomY,confidence:'TEXT_FREE_FOOTER_GUARD'};
}

function inferSeparatedFooterGuard(moved,{pageHeight,size,bottomMargin}){
  const rects=(moved||[]).map(item=>item?.rect).filter(rect=>rect&&Number.isFinite(rect.bottom)&&Number.isFinite(rect.top)&&rect.top>rect.bottom).sort((a,b)=>a.bottom-b.bottom||a.top-b.top);
  if(rects.length<2)return null;

  const clearance=Math.max(6,size*.60);
  const minGap=Math.max(48,pageHeight*.055,size*4.5);
  const maxFooterTop=Math.min(pageHeight*.18,pageHeight-2);
  let clusterTop=rects[0].top;
  let clusterCount=1;
  let best=null;

  for(let i=1;i<rects.length;i++){
    const next=rects[i];
    const gap=next.bottom-clusterTop;
    if(gap>=minGap&&clusterTop<=maxFooterTop){
      const enoughEvidence=clusterCount>=2||gap>=pageHeight*.10;
      if(enoughEvidence&&(!best||gap>best.gap)){
        const top=clamp(clusterTop+clearance,bottomMargin,maxFooterTop);
        if(top>bottomMargin+2)best={enabled:true,top,height:top,gap,clusterTop,clusterCount,confidence:'SEPARATED_STATIC_FOOTER'};
      }
    }
    clusterTop=Math.max(clusterTop,next.top);
    clusterCount++;
  }
  return best;
}

function preparedPageGeometry(pageIndex){
  if(!Number.isInteger(pageIndex))return null;
  return cascadePageGeometry.find(page=>Number(page?.pageIndex)===pageIndex)||null;
}

function resolveFooterGuard(prepared,moved,{pageHeight,size,bottomMargin}){
  const separated=inferSeparatedFooterGuard(moved,{pageHeight,size,bottomMargin});
  const preparedTop=Number(prepared?.footerGuardTop);
  if(separated&&(!Number.isFinite(preparedTop)||separated.top>preparedTop+1))return separated;
  if(Number.isFinite(preparedTop)){
    const top=clamp(preparedTop,bottomMargin,Math.min(pageHeight*.18,pageHeight-2));
    return {
      enabled:top>bottomMargin+1,
      top,
      height:top,
      contentBottomY:Number(prepared?.textBottomY),
      confidence:'PREPARED_PAGE_FOOTER_GUARD',
    };
  }
  return inferFooterGuard(moved,{pageHeight,size,bottomMargin});
}

function inferredSourcePageIndex(blocks){
  const value=(blocks||[]).find(block=>Number.isInteger(block?.pageIndex))?.pageIndex;
  return Number.isInteger(value)?value:null;
}

function followingCascadePages(sourcePageIndex){
  if(!Number.isInteger(sourcePageIndex))return [];
  return cascadePageGeometry.filter(page=>page.pageIndex>sourcePageIndex).sort((a,b)=>a.pageIndex-b.pageIndex).map(page=>({...page}));
}

function flowLineGeometry(moved,contentBand){
  return moved
    .filter(({rect})=>horizontalOverlap(rect.left,rect.right,contentBand.left,contentBand.right)>Math.min(8,rect.width*.2))
    .map(({block,lineIndex,lineId,rect})=>({
      id:block?.id||null,
      blockId:block?.id||null,
      lineId,
      lineIndex,
      blockLineCount:Math.max(1,block?.lines?.length||1),
      left:rect.left,right:rect.right,bottom:rect.bottom,top:rect.top,width:rect.width,height:rect.height,
    }))
    .filter(item=>Number.isFinite(item.bottom)&&Number.isFinite(item.top)&&item.top>item.bottom)
    .sort((a,b)=>b.top-a.top);
}

export function planInsertionReflow({
  blocks=[],x=0,y=0,maxWidth=300,fontSize=12,pageWidth=595,pageHeight=842,pageRotation=0,existingMetrics=[],
}={}){
  const rotation=((Number(pageRotation)||0)%360+360)%360;
  if(rotation!==0)return {enabled:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED',pageRotation:rotation};

  const size=clamp(Number(fontSize)||12,6,72);
  const sourcePageIndex=inferredSourcePageIndex(blocks);
  const prepared=preparedPageGeometry(sourcePageIndex);
  const safetyGap=Math.max(4,size*.35);
  const bottomMargin=Math.max(12,Number(prepared?.bottomMargin)||size*.8);
  const topMargin=Math.max(24,Number(prepared?.topMargin)||size*1.6);
  const laneLeft=clamp(Number(x)||0,0,pageWidth);
  const laneRight=clamp(laneLeft+Math.max(40,Number(maxWidth)||300),0,pageWidth);
  const insertionTop=clamp((Number(y)||0)+size*.9,0,pageHeight);
  const alreadyFlowed=overflowedTargetsFromMetrics(existingMetrics);

  const lines=[];
  for(const block of blocks||[]){
    if(block?.id&&alreadyFlowed.blockIds.has(block.id))continue;
    const blockLines=block?.lines?.length?block.lines:[null];
    for(let lineIndex=0;lineIndex<blockLines.length;lineIndex++){
      const lineId=`${block?.id||'block'}:line:${lineIndex}`;
      if(alreadyFlowed.lineIds.has(lineId))continue;
      let rect=lineRectOf(block,blockLines[lineIndex]);
      if(!rect)continue;
      for(const metric of existingMetrics||[]){
        if(metric?.pageIndex!==block?.pageIndex)continue;
        if(rect.top<=Number(metric.cutY)+.75)rect=shiftedRect(rect,-Math.max(0,Number(metric.delta)||0));
      }
      lines.push({block,line:blockLines[lineIndex],lineIndex,lineId,rect});
    }
  }

  const laneCandidates=lines
    .filter(({rect})=>horizontalOverlap(rect.left,rect.right,laneLeft,laneRight)>Math.min(8,rect.width*.2))
    .filter(({rect})=>rect.bottom<=insertionTop+.5)
    .sort((a,b)=>b.rect.top-a.rect.top);

  const nearest=laneCandidates[0];
  if(!nearest){
    return {enabled:false,reason:'NO_CONTENT_BELOW_INSERTION',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex)};
  }

  let cutY=clamp(nearest.rect.top+safetyGap,2,pageHeight-2);
  for(let i=0;i<16;i++){
    const crossing=lines.filter(({rect})=>rect.bottom<cutY-.5&&rect.top>cutY+.5);
    if(!crossing.length)break;
    const lifted=Math.max(...crossing.map(({rect})=>rect.top))+safetyGap;
    const next=clamp(lifted,2,pageHeight-2);
    if(Math.abs(next-cutY)<.1)break;
    cutY=next;
  }

  const moved=lines.filter(({rect})=>rect.top<=cutY+.75);
  if(!moved.length){
    return {enabled:false,reason:'NO_MOVABLE_CONTENT',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex)};
  }

  const footerGuard=resolveFooterGuard(prepared,moved,{pageHeight,size,bottomMargin});
  const movable=moved.filter(({rect})=>rect.top>footerGuard.top+.25);
  if(!movable.length){
    return {enabled:false,reason:'NO_MOVABLE_CONTENT_ABOVE_FOOTER',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex),footerGuard};
  }

  const contentBand=inferContentBand(movable,{laneLeft,laneRight,pageWidth,size});
  if(!contentBand){
    return {enabled:false,reason:'CONTENT_BAND_UNSAFE',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex),footerGuard};
  }

  const flowLines=flowLineGeometry(movable,contentBand);
  if(!flowLines.length){
    return {enabled:false,reason:'NO_FLOW_LINES_ABOVE_FOOTER',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex),footerGuard};
  }
  const flowTopY=Math.max(...flowLines.map(line=>line.top));
  const contentBottomY=Math.min(...flowLines.map(line=>line.bottom));

  return {
    enabled:true,mode:'VERTICAL_CONTENT_BAND_REFLOW',cutY,flowTopY,contentBottomY,safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,
    sourcePageIndex,lane:{left:laneLeft,right:laneRight},contentBand,footerGuard,
    flowLines,
    flowBlocks:flowLines,
    cascadePages:followingCascadePages(sourcePageIndex),
    confidence:footerGuard.confidence==='SEPARATED_STATIC_FOOTER'?'LINE_AWARE_STATIC_FOOTER_REFLOW':(footerGuard.confidence==='PREPARED_PAGE_FOOTER_GUARD'?'LINE_AWARE_STABLE_FOOTER_REFLOW':(footerGuard.enabled?'LINE_AWARE_TEXT_BAND_MARGIN_AND_FOOTER_SAFE_CUT':'LINE_AWARE_TEXT_BAND_AND_MARGIN_SAFE_CUT')),
  };
}
