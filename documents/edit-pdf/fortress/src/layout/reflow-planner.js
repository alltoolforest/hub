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

function horizontalOverlap(aLeft,aRight,bLeft,bRight){
  return Math.max(0,Math.min(aRight,bRight)-Math.max(aLeft,bLeft));
}

function shiftedRect(rect,dy){return {...rect,bottom:rect.bottom+dy,top:rect.top+dy};}

function overflowedIdsFromMetrics(metrics=[]){
  const out=new Set();
  for(const metric of metrics||[]){
    for(const id of metric?.overflowedBlockIds||[])if(id)out.add(id);
  }
  return out;
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

function inferredSourcePageIndex(rects){
  const value=rects.find(item=>Number.isInteger(item?.block?.pageIndex))?.block?.pageIndex;
  return Number.isInteger(value)?value:null;
}

function followingCascadePages(sourcePageIndex){
  if(!Number.isInteger(sourcePageIndex))return [];
  return cascadePageGeometry.filter(page=>page.pageIndex>sourcePageIndex).sort((a,b)=>a.pageIndex-b.pageIndex).map(page=>({...page}));
}

function flowBlockGeometry(moved,contentBand){
  return moved
    .filter(({rect})=>horizontalOverlap(rect.left,rect.right,contentBand.left,contentBand.right)>Math.min(8,rect.width*.2))
    .map(({block,rect})=>({
      id:block?.id||null,
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
  const safetyGap=Math.max(4,size*.35);
  const bottomMargin=Math.max(12,size*.8);
  const topMargin=Math.max(24,size*1.6);
  const laneLeft=clamp(Number(x)||0,0,pageWidth);
  const laneRight=clamp(laneLeft+Math.max(40,Number(maxWidth)||300),0,pageWidth);
  const insertionTop=clamp((Number(y)||0)+size*.9,0,pageHeight);
  const alreadyFlowed=overflowedIdsFromMetrics(existingMetrics);

  const rects=[];
  for(const block of blocks||[]){
    if(block?.id&&alreadyFlowed.has(block.id))continue;
    let rect=rectOf(block);
    if(!rect)continue;
    for(const metric of existingMetrics||[]){
      if(metric?.pageIndex!==block?.pageIndex)continue;
      if(rect.top<=Number(metric.cutY)+.75)rect=shiftedRect(rect,-Math.max(0,Number(metric.delta)||0));
    }
    rects.push({block,rect});
  }
  const sourcePageIndex=inferredSourcePageIndex(rects);

  const laneCandidates=rects
    .filter(({rect})=>horizontalOverlap(rect.left,rect.right,laneLeft,laneRight)>Math.min(8,rect.width*.2))
    .filter(({rect})=>rect.bottom<=insertionTop+.5)
    .sort((a,b)=>b.rect.top-a.rect.top);

  const nearest=laneCandidates[0];
  if(!nearest){
    return {enabled:false,reason:'NO_CONTENT_BELOW_INSERTION',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex)};
  }

  let cutY=clamp(nearest.rect.top+safetyGap,2,pageHeight-2);
  for(let i=0;i<12;i++){
    const crossing=rects.filter(({rect})=>rect.bottom<cutY-.5&&rect.top>cutY+.5);
    if(!crossing.length)break;
    const lifted=Math.max(...crossing.map(({rect})=>rect.top))+safetyGap;
    const next=clamp(lifted,2,pageHeight-2);
    if(Math.abs(next-cutY)<.1)break;
    cutY=next;
  }

  const moved=rects.filter(({rect})=>rect.top<=cutY+.75);
  if(!moved.length){
    return {enabled:false,reason:'NO_MOVABLE_CONTENT',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex)};
  }

  const contentBand=inferContentBand(moved,{laneLeft,laneRight,pageWidth,size});
  if(!contentBand){
    return {enabled:false,reason:'CONTENT_BAND_UNSAFE',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,sourcePageIndex,cascadePages:followingCascadePages(sourcePageIndex)};
  }

  const flowBlocks=flowBlockGeometry(moved,contentBand);
  const flowTopY=Math.max(...moved.map(({rect})=>rect.top));
  const contentBottomY=Math.min(...moved.map(({rect})=>rect.bottom));
  const footerGuard=inferFooterGuard(moved,{pageHeight,size,bottomMargin});

  return {
    enabled:true,mode:'VERTICAL_CONTENT_BAND_REFLOW',cutY,flowTopY,contentBottomY,safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation,
    sourcePageIndex,lane:{left:laneLeft,right:laneRight},contentBand,footerGuard,flowBlocks,cascadePages:followingCascadePages(sourcePageIndex),
    confidence:footerGuard.enabled?'TEXT_BAND_MARGIN_AND_FOOTER_SAFE_CUT':'TEXT_BAND_AND_MARGIN_SAFE_CUT',
  };
}
