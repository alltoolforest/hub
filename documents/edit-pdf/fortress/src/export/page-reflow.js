import { PDFDocument, PDFName } from '../core/pdf-lib.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function pageHasAnnotations(page){
  try{return !!page?.node?.get?.(PDFName.of('Annots'));}catch{return true;}
}

async function embedSlice(destDoc,donorPage,{left=0,bottom=0,right,top}){
  if(!(top>bottom)||!(right>left))return null;
  return destDoc.embedPage(donorPage,{left,bottom,right,top});
}

function drawSlice(page,embedded,{x=0,y=0,width,height}){
  if(!embedded)return;
  page.drawPage(embedded,{x,y,width,height});
}

async function buildFrameSlices(doc,donorPage,{width,height,flowLeft,flowRight,frameTop,frameBottom}){
  const left=flowLeft>0?await embedSlice(doc,donorPage,{left:0,bottom:0,right:flowLeft,top:height}):null;
  const right=flowRight<width?await embedSlice(doc,donorPage,{left:flowRight,bottom:0,right:width,top:height}):null;
  const top=frameTop>0?await embedSlice(doc,donorPage,{left:flowLeft,bottom:height-frameTop,right:flowRight,top:height}):null;
  const bottom=frameBottom>0?await embedSlice(doc,donorPage,{left:flowLeft,bottom:0,right:flowRight,top:frameBottom}):null;
  return {left,right,top,bottom};
}

function drawFrame(page,frame,{width,height,flowLeft,flowRight,frameTop,frameBottom}){
  if(frame.left)drawSlice(page,frame.left,{x:0,y:0,width:flowLeft,height});
  if(frame.right)drawSlice(page,frame.right,{x:flowRight,y:0,width:width-flowRight,height});
  if(frame.top)drawSlice(page,frame.top,{x:flowLeft,y:height-frameTop,width:flowRight-flowLeft,height:frameTop});
  if(frame.bottom)drawSlice(page,frame.bottom,{x:flowLeft,y:0,width:flowRight-flowLeft,height:frameBottom});
}

/**
 * Rebuild one page as preserved PDF slices with a vertical gap inserted.
 *
 * Only the interior document band moves. Page-edge framing stays fixed. The
 * moving band remains vector/text PDF content inside Form XObjects, so tables,
 * borders inside the body, images and text move together instead of being
 * reconstructed object-by-object.
 */
export async function applyVerticalRegionReflow(doc,tx,layout,{preview=false,sequenceIndex=0}={}){
  const plan=tx?.reflowPlan;
  if(!plan?.enabled)return {applied:false,reason:plan?.reason||'REFLOW_DISABLED',overflowPageCount:0};

  const pageIndex=Number(tx.pageIndex);
  if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount()){
    return {applied:false,reason:'REFLOW_PAGE_MISSING',overflowPageCount:0};
  }

  const livePage=doc.getPage(pageIndex);
  const rotation=((livePage.getRotation().angle||0)%360+360)%360;
  if(rotation!==0||Number(plan.pageRotation||0)!==0){
    return {applied:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED',overflowPageCount:0};
  }

  // Rebuilding a page would require separate annotation rectangle geometry.
  // Fall back rather than risk corrupting links, widgets or comments.
  if(pageHasAnnotations(livePage)){
    return {applied:false,reason:'ANNOTATED_PAGE_REFLOW_UNSAFE',overflowPageCount:0};
  }

  const {width,height}=livePage.getSize();
  const cutY=clamp(Number(plan.cutY)||0,2,height-2);
  const flowTopY=clamp(Number(plan.flowTopY)||cutY,0,height);
  const contentBottomY=clamp(Number(plan.contentBottomY)||0,0,height);
  const safetyGap=Math.max(2,Number(plan.safetyGap)||4);
  const bottomMargin=Math.max(8,Number(plan.bottomMargin)||12);
  const topMargin=Math.max(16,Number(plan.topMargin)||28);
  const textBottomY=Number(layout?.bottomY);
  if(!Number.isFinite(textBottomY))return {applied:false,reason:'REFLOW_TEXT_GEOMETRY_MISSING',overflowPageCount:0};

  const requestedLeft=Number(plan.flowBand?.left);
  const requestedRight=Number(plan.flowBand?.right);
  const flowLeft=clamp(Number.isFinite(requestedLeft)?requestedLeft:0,0,width-8);
  const flowRight=clamp(Number.isFinite(requestedRight)?requestedRight:width,flowLeft+8,width);
  if(flowRight-flowLeft<40)return {applied:false,reason:'REFLOW_BAND_TOO_NARROW',overflowPageCount:0};

  const frameBottom=clamp(Number(plan.frame?.bottom)||0,0,Math.max(0,cutY-4));
  const frameTop=clamp(Number(plan.frame?.top)||0,0,Math.max(0,height-cutY-4));

  // Existing whitespace is consumed first. Only actual overlap creates new
  // vertical space, which avoids unnecessary page movement for short inserts.
  const delta=Math.max(0,flowTopY+safetyGap-textBottomY);
  if(delta<.5){
    return {
      applied:false,
      reason:'EXISTING_WHITESPACE_SUFFICIENT',
      overflowPageCount:0,
      metric:{transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta:0,overflowPageCount:0},
    };
  }

  if(delta>height*.72){
    return {applied:false,reason:'REFLOW_SHIFT_TOO_LARGE',overflowPageCount:0};
  }

  // Keep moved content above the preserved bottom frame. If it would cross
  // that protected area, move only the overflowing lower body onto continuation
  // pages while leaving the frame itself fixed. When no overflow is required,
  // trim only the proven text-free margin that would otherwise slide beneath
  // the fixed frame.
  const protectedBottom=Math.max(frameBottom+safetyGap,bottomMargin);
  const overflowNeeded=contentBottomY-delta<protectedBottom;
  const overflowBoundary=overflowNeeded
    ?clamp(delta+protectedBottom,frameBottom,cutY)
    :clamp(frameBottom+delta,frameBottom,cutY);
  const effectiveTopMargin=Math.max(topMargin,frameTop+safetyGap);
  const usableOverflowHeight=Math.max(40,height-effectiveTopMargin-protectedBottom);

  // Snapshot before rebuilding so donor content includes all earlier edits and
  // earlier reflows already applied to this source page.
  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);

  const frame=await buildFrameSlices(doc,donorPage,{width,height,flowLeft,flowRight,frameTop,frameBottom});
  const topBody=await embedSlice(doc,donorPage,{left:flowLeft,bottom:cutY,right:flowRight,top:height-frameTop});
  const visibleBottom=await embedSlice(doc,donorPage,{left:flowLeft,bottom:overflowBoundary,right:flowRight,top:cutY});

  // Insert replacement before the old page, then delete the old page. The
  // source page index remains stable throughout the editing session.
  const replacement=doc.insertPage(pageIndex,[width,height]);
  drawFrame(replacement,frame,{width,height,flowLeft,flowRight,frameTop,frameBottom});
  if(topBody){
    drawSlice(replacement,topBody,{x:flowLeft,y:cutY,width:flowRight-flowLeft,height:height-frameTop-cutY});
  }
  if(visibleBottom){
    const h=cutY-overflowBoundary;
    drawSlice(replacement,visibleBottom,{x:flowLeft,y:overflowBoundary-delta,width:flowRight-flowLeft,height:h});
  }
  doc.removePage(pageIndex+1);

  let overflowPageCount=0;
  if(overflowNeeded&&overflowBoundary>frameBottom+.5){
    const slices=[];
    let sliceTop=overflowBoundary;
    while(sliceTop>frameBottom+.5){
      const sliceBottom=Math.max(frameBottom,sliceTop-usableOverflowHeight);
      slices.push({bottom:sliceBottom,top:sliceTop});
      sliceTop=sliceBottom;
      if(slices.length>16)throw Object.assign(new Error('Reflow would create too many continuation pages.'),{code:'REFLOW_PAGE_LIMIT'});
    }

    for(let i=0;i<slices.length;i++){
      const slice=slices[i];
      const embedded=await embedSlice(doc,donorPage,{left:flowLeft,bottom:slice.bottom,right:flowRight,top:slice.top});
      const continuation=preview?doc.addPage([width,height]):doc.insertPage(pageIndex+1+i,[width,height]);
      drawFrame(continuation,frame,{width,height,flowLeft,flowRight,frameTop,frameBottom});
      const h=slice.top-slice.bottom;
      drawSlice(continuation,embedded,{x:flowLeft,y:height-effectiveTopMargin-h,width:flowRight-flowLeft,height:h});
      overflowPageCount++;
    }
  }

  try{donorDoc.close?.();}catch{}

  return {
    applied:true,
    overflowPageCount,
    metric:{
      transactionId:tx.id,
      pageIndex,
      sequenceIndex,
      cutY,
      delta,
      flowTopY,
      contentBottomY,
      overflowBoundary,
      overflowPageCount,
      flowLeft,
      flowRight,
      frameTop,
      frameBottom,
    },
  };
}
