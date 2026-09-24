function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

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

/**
 * Build a conservative vertical-flow plan for Add Text.
 *
 * The planner finds the next content band below the insertion, avoids cutting
 * through detected text, and calculates an interior flow band. Page-edge
 * framing is intentionally kept outside that band so common resume borders do
 * not get split when body content moves.
 */
export function planInsertionReflow({
  blocks=[],
  x=0,
  y=0,
  maxWidth=300,
  fontSize=12,
  pageWidth=595,
  pageHeight=842,
  pageRotation=0,
  existingMetrics=[],
}={}){
  const rotation=((Number(pageRotation)||0)%360+360)%360;
  if(rotation!==0){
    return {enabled:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED',pageRotation:rotation};
  }

  const size=clamp(Number(fontSize)||12,6,72);
  const safetyGap=Math.max(4,size*.35);
  const bottomMargin=Math.max(12,size*.8);
  const topMargin=Math.max(24,size*1.6);
  const laneLeft=clamp(Number(x)||0,0,pageWidth);
  const laneRight=clamp(laneLeft+Math.max(40,Number(maxWidth)||300),0,pageWidth);
  const insertionTop=clamp((Number(y)||0)+size*.9,0,pageHeight);

  const rects=[];
  for(const block of blocks||[]){
    let rect=rectOf(block);
    if(!rect)continue;
    for(const metric of existingMetrics||[]){
      if(metric?.pageIndex!==block?.pageIndex)continue;
      if(rect.top<=Number(metric.cutY)+.75)rect=shiftedRect(rect,-Math.max(0,Number(metric.delta)||0));
    }
    rects.push({block,rect});
  }

  const laneCandidates=rects
    .filter(({rect})=>horizontalOverlap(rect.left,rect.right,laneLeft,laneRight)>Math.min(8,rect.width*.2))
    .filter(({rect})=>rect.bottom<=insertionTop+.5)
    .sort((a,b)=>b.rect.top-a.rect.top);

  const nearest=laneCandidates[0];
  if(!nearest){
    return {
      enabled:false,
      reason:'NO_CONTENT_BELOW_INSERTION',
      safetyGap,bottomMargin,topMargin,
      pageWidth,pageHeight,pageRotation:rotation,
    };
  }

  let cutY=clamp(nearest.rect.top+safetyGap,2,pageHeight-2);

  // Never slice through a detected text block. If the proposed cut intersects
  // any text block (including another column), lift it just above that block.
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
    return {enabled:false,reason:'NO_MOVABLE_CONTENT',safetyGap,bottomMargin,topMargin,pageWidth,pageHeight,pageRotation:rotation};
  }

  const flowTopY=Math.max(...moved.map(({rect})=>rect.top));
  const contentBottomY=Math.min(...moved.map(({rect})=>rect.bottom));

  const allLeft=Math.min(...rects.map(({rect})=>rect.left));
  const allRight=Math.max(...rects.map(({rect})=>rect.right));
  const allBottom=Math.min(...rects.map(({rect})=>rect.bottom));
  const allTop=Math.max(...rects.map(({rect})=>rect.top));
  const bandPadding=Math.max(18,size*1.5);
  const flowLeft=clamp(Math.min(allLeft,laneLeft)-bandPadding,0,pageWidth-8);
  const flowRight=clamp(Math.max(allRight,laneRight)+bandPadding,flowLeft+40,pageWidth);

  // Preserve a narrow top/bottom frame where there is a genuine text-free
  // margin. This catches common A4 resume borders without freezing body text.
  const lowerTextMargin=Math.max(0,allBottom);
  const upperTextMargin=Math.max(0,pageHeight-allTop);
  const frameBottom=clamp(lowerTextMargin*.72,4,36);
  const frameTop=clamp(upperTextMargin*.9,4,36);

  return {
    enabled:true,
    mode:'VERTICAL_REGION_REFLOW',
    cutY,
    flowTopY,
    contentBottomY,
    safetyGap,
    bottomMargin,
    topMargin,
    pageWidth,
    pageHeight,
    pageRotation:rotation,
    lane:{left:laneLeft,right:laneRight},
    flowBand:{left:flowLeft,right:flowRight},
    frame:{top:frameTop,bottom:frameBottom},
    confidence:'TEXT_BAND_SAFE_CUT',
  };
}
