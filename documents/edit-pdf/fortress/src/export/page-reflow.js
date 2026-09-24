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

/**
 * Rebuild one page as preserved PDF slices with a vertical gap inserted.
 * The original slice content remains vector/text PDF content inside Form
 * XObjects; it is not rasterized. Complex content below the cut (tables,
 * borders, images, text) therefore moves together instead of being rewritten
 * object-by-object.
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

  // Rebuilding a page would orphan/misplace page-level annotations because
  // their rectangles would need independent geometry updates. Keep the normal
  // Add Text behavior instead of risking annotation corruption.
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

  // Existing whitespace is consumed first. Only the overlap amount is added as
  // new vertical space, which avoids the "everything jumps down" behavior.
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

  const overflowNeeded=contentBottomY-delta<bottomMargin;
  const overflowBoundary=overflowNeeded?clamp(delta+bottomMargin,0,cutY):0;
  const usableOverflowHeight=Math.max(40,height-topMargin-bottomMargin);

  // Snapshot before rebuilding so the donor page represents the exact current
  // state, including previous edits/reflows on this page.
  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);

  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:cutY,right:width,top:height});
  const visibleBottomSlice=await embedSlice(doc,donorPage,{left:0,bottom:overflowBoundary,right:width,top:cutY});

  // Insert replacement before the old page, then delete the old page. Net page
  // index of the source page remains unchanged.
  const replacement=doc.insertPage(pageIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:cutY,width,height:height-cutY});
  if(visibleBottomSlice){
    const sliceHeight=cutY-overflowBoundary;
    drawSlice(replacement,visibleBottomSlice,{x:0,y:overflowBoundary-delta,width,height:sliceHeight});
  }
  doc.removePage(pageIndex+1);

  let overflowPageCount=0;
  if(overflowNeeded&&overflowBoundary>.5){
    const slices=[];
    let sliceTop=overflowBoundary;
    while(sliceTop>.5){
      const sliceBottom=Math.max(0,sliceTop-usableOverflowHeight);
      slices.push({bottom:sliceBottom,top:sliceTop});
      sliceTop=sliceBottom;
      if(slices.length>16)throw Object.assign(new Error('Reflow would create too many continuation pages.'),{code:'REFLOW_PAGE_LIMIT'});
    }

    for(let i=0;i<slices.length;i++){
      const slice=slices[i];
      const embedded=await embedSlice(doc,donorPage,{left:0,bottom:slice.bottom,right:width,top:slice.top});
      const continuation=preview?doc.addPage([width,height]):doc.insertPage(pageIndex+1+i,[width,height]);
      const h=slice.top-slice.bottom;
      drawSlice(continuation,embedded,{x:0,y:height-topMargin-h,width,height:h});
      overflowPageCount++;
    }
  }

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
    },
  };
}
