import { PDFDocument, PDFName } from '../core/pdf-lib.js';
import { PdfRenderer } from '../rendering/renderer.js';
import { extractVisualText } from '../rendering/text-layer.js';
import { buildLogicalBlocks } from '../text/text-blocks.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');

function lookup(doc,value){
  if(!value)return null;
  try{return doc.context.lookup(value);}catch{return null;}
}

function arrayItem(doc,array,index){
  try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}
  try{return lookup(doc,array?.get?.(index));}catch{return null;}
}

function numberValue(doc,value){
  const resolved=lookup(doc,value)||value;
  if(typeof resolved?.asNumber==='function')return resolved.asNumber();
  const n=Number(String(resolved));
  return Number.isFinite(n)?n:null;
}

function rectBounds(rect){
  const left=Math.min(rect[0],rect[2]);
  const right=Math.max(rect[0],rect[2]);
  const bottom=Math.min(rect[1],rect[3]);
  const top=Math.max(rect[1],rect[3]);
  return {left,right,bottom,top};
}

function horizontalOverlap(aLeft,aRight,bLeft,bRight){
  return Math.max(0,Math.min(aRight,bRight)-Math.max(aLeft,bLeft));
}

function blockRect(block){
  const b=block?.bounds;
  if(!b)return null;
  const left=Number(b.x),bottom=Number(b.y),width=Number(b.width),height=Number(b.height);
  if(![left,bottom,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left,right:left+width,bottom,top:bottom+height,width,height};
}

function normalizedContentBand(plan,pageWidth){
  const raw=plan?.contentBand;
  if(!raw)return {left:0,right:pageWidth,width:pageWidth,legacyFullWidth:true};
  let left=clamp(Number(raw.left)||0,0,pageWidth);
  let right=clamp(Number(raw.right)||pageWidth,0,pageWidth);
  if(right-left<40)return null;
  if(left<1)left=0;
  if(pageWidth-right<1)right=pageWidth;
  return {left,right,width:right-left,legacyFullWidth:false};
}

function normalizedFooterGuard(plan,pageHeight,bottomMargin,cutY){
  const requested=Number(plan?.footerGuard?.top);
  if(!Number.isFinite(requested))return {enabled:false,top:bottomMargin,height:bottomMargin};
  const maxTop=Math.max(bottomMargin,Math.min(cutY-2,pageHeight*.18));
  const top=clamp(requested,bottomMargin,maxTop);
  return {enabled:top>bottomMargin+1,top,height:top,confidence:plan?.footerGuard?.confidence||null};
}

function cascadeTopGuardBottom(plan,pageHeight,footerGuardTop){
  const topMargin=Math.max(16,Number(plan?.topMargin)||28);
  const edgeGuard=Math.max(topMargin,Math.min(72,pageHeight*.085),Math.min(72,footerGuardTop));
  return clamp(pageHeight-edgeGuard,footerGuardTop+40,pageHeight-8);
}

function inspectAnnotations(doc,page){
  const raw=page?.node?.get?.(ANN0TS);
  if(!raw)return {ok:true,raw:null,links:[]};
  const array=lookup(doc,raw);
  if(!array||typeof array.size!=='function'||typeof array.get!=='function')return {ok:false,reason:'ANNOTATION_ARRAY_UNREADABLE'};
  const links=[];
  for(let i=0;i<array.size();i++){
    const dict=arrayItem(doc,array,i);
    if(!dict||typeof dict.get!=='function'||typeof dict.set!=='function')return {ok:false,reason:'ANNOTATION_DICTIONARY_UNREADABLE'};
    const subtype=String(dict.get(SUBTYPE)||'');
    if(subtype!=='/Link'&&subtype!=='Link')return {ok:false,reason:'COMPLEX_ANNOTATION_REFLOW_UNSAFE'};
    if(dict.get(AP)||dict.get(QUAD_POINTS))return {ok:false,reason:'COMPLEX_LINK_GEOMETRY_REFLOW_UNSAFE'};
    const rectArray=lookup(doc,dict.get(RECT));
    if(!rectArray||typeof rectArray.size!=='function'||rectArray.size()<4)return {ok:false,reason:'LINK_RECTANGLE_MISSING'};
    const rect=[];
    for(let j=0;j<4;j++){
      const value=numberValue(doc,rectArray.get(j));
      if(!Number.isFinite(value))return {ok:false,reason:'LINK_RECTANGLE_INVALID'};
      rect.push(value);
    }
    links.push({dict,rect,bounds:rectBounds(rect)});
  }
  return {ok:true,raw,links};
}

function classifyLink(link,{cutY,bandLeft,bandRight,footerGuardTop}){
  const {left,right,bottom,top}=link.bounds;
  if(top<=footerGuardTop+.5)return 'STATIC_FOOTER';
  if(bottom<footerGuardTop-.5&&top>footerGuardTop+.5)return 'CROSSES_FOOTER';
  const outsideBand=right<=bandLeft+.5||left>=bandRight-.5;
  if(outsideBand)return 'STATIC';
  const crossesBand=(left<bandLeft-.5&&right>bandLeft+.5)||(left<bandRight-.5&&right>bandRight+.5);
  if(crossesBand)return 'CROSSES_BAND';
  if(bottom<cutY-.5&&top>cutY+.5)return 'CROSSES_CUT';
  if(top<=cutY+.5)return 'MOVED';
  return 'STATIC';
}

function validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,movableFloor,bandLeft,bandRight,footerGuardTop}){
  const classified=[];
  for(const link of annotationInfo.links){
    const zone=classifyLink(link,{cutY,bandLeft,bandRight,footerGuardTop});
    if(zone==='CROSSES_FOOTER')return {ok:false,reason:'LINK_CROSSES_FOOTER_GUARD'};
    if(zone==='CROSSES_BAND')return {ok:false,reason:'LINK_CROSSES_CONTENT_BAND'};
    if(zone==='CROSSES_CUT')return {ok:false,reason:'LINK_CROSSES_REFLOW_BOUNDARY'};
    if(zone==='MOVED'){
      if(overflowNeeded&&link.bounds.bottom<overflowBoundary+.5)return {ok:false,reason:'LINK_OVERFLOW_REFLOW_UNSAFE'};
      if(link.bounds.bottom-delta<movableFloor-1)return {ok:false,reason:'LINK_SHIFT_INTO_STATIC_FOOTER'};
    }
    classified.push({...link,zone});
  }
  return {ok:true,links:classified};
}

function preserveAndMoveLinks(doc,replacement,annotationInfo,classifiedLinks,delta){
  if(!annotationInfo.raw)return;
  for(const link of classifiedLinks){
    if(link.zone==='MOVED'){
      const moved=[link.rect[0],link.rect[1]-delta,link.rect[2],link.rect[3]-delta];
      link.dict.set(RECT,doc.context.obj(moved));
    }
    if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);
  }
  replacement.node.set(ANN0TS,annotationInfo.raw);
}

function validateCascadeLinks(annotationInfo,{bandLeft,bandRight,footerGuardTop,topGuardBottom,shift,overflowBoundary,movableFloor}){
  const classified=[];
  for(const link of annotationInfo.links){
    const {left,right,bottom,top}=link.bounds;
    if(bottom<footerGuardTop-.5&&top>footerGuardTop+.5)return {ok:false,reason:'LINK_CROSSES_FOOTER_GUARD'};
    if(bottom<topGuardBottom-.5&&top>topGuardBottom+.5)return {ok:false,reason:'LINK_CROSSES_TOP_GUARD'};
    const outsideBand=right<=bandLeft+.5||left>=bandRight-.5;
    if(outsideBand){classified.push({...link,zone:'STATIC'});continue;}
    const crossesBand=(left<bandLeft-.5&&right>bandLeft+.5)||(left<bandRight-.5&&right>bandRight+.5);
    if(crossesBand)return {ok:false,reason:'LINK_CROSSES_CONTENT_BAND'};
    if(top<=footerGuardTop+.5||bottom>=topGuardBottom-.5){classified.push({...link,zone:'STATIC'});continue;}
    if(overflowBoundary>footerGuardTop+.5&&bottom<overflowBoundary+.5)return {ok:false,reason:'LINK_OVERFLOW_CASCADE_UNSAFE'};
    if(bottom-shift<movableFloor-1)return {ok:false,reason:'LINK_SHIFT_INTO_STATIC_FOOTER'};
    classified.push({...link,zone:'MOVED'});
  }
  return {ok:true,links:classified};
}

async function embedSlice(destDoc,donorPage,{left=0,bottom=0,right,top}){
  if(!(top>bottom)||!(right>left))return null;
  return destDoc.embedPage(donorPage,{left,bottom,right,top});
}

function drawSlice(page,embedded,{x=0,y=0,width,height}){
  if(!embedded)return;
  page.drawPage(embedded,{x,y,width,height});
}

async function buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,bottom=0,top}){
  if(!(top>bottom))return {left:null,right:null};
  const left=bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom,right:bandLeft,top}):null;
  const right=bandRight<width-1?await embedSlice(doc,donorPage,{left:bandRight,bottom,right:width,top}):null;
  return {left,right};
}

function drawStaticMargins(page,slices,{bandLeft,bandRight,width,bottom=0,top}){
  const h=top-bottom;
  if(!(h>0))return;
  if(slices.left)drawSlice(page,slices.left,{x:0,y:bottom,width:bandLeft,height:h});
  if(slices.right)drawSlice(page,slices.right,{x:bandRight,y:bottom,width:width-bandRight,height:h});
}

async function measureTargetPage(bytes,pageIndex,{bandLeft,bandRight,footerGuardTop,topGuardBottom}){
  const renderer=new PdfRenderer(bytes);
  try{
    const pdf=await renderer.load();
    if(pageIndex<0||pageIndex>=pdf.numPages)return null;
    const info=await renderer.pageInfo(pageIndex);
    if(Number(info.rotation||0)!==0)return {unsafe:true,reason:'CASCADE_ROTATED_PAGE_UNSUPPORTED'};
    const visual=await extractVisualText(renderer,pageIndex);
    const blocks=buildLogicalBlocks(visual.items,{pageIndex,pageRotation:info.rotation});
    const rects=[];
    for(const block of blocks){
      const rect=blockRect(block);
      if(!rect)continue;
      const overlap=horizontalOverlap(rect.left,rect.right,bandLeft,bandRight);
      if(overlap<=Math.min(8,rect.width*.2))continue;
      if(rect.top<=footerGuardTop+.5||rect.bottom>=topGuardBottom-.5)continue;
      rects.push(rect);
    }
    if(!rects.length)return {width:info.width,height:info.height,rotation:info.rotation,hasBodyText:false,rects:[]};
    return {
      width:info.width,
      height:info.height,
      rotation:info.rotation,
      hasBodyText:true,
      contentTopY:Math.max(...rects.map(r=>r.top)),
      contentBottomY:Math.min(...rects.map(r=>r.bottom)),
      rects,
    };
  }finally{renderer.destroy();}
}

function incomingHeight(incoming){return Math.max(0,Number(incoming?.top)-Number(incoming?.bottom));}

async function drawIncoming(doc,page,incoming,{x,y,width}){
  const h=incomingHeight(incoming);
  const embedded=await embedSlice(doc,incoming.donorPage,{left:incoming.left,bottom:incoming.bottom,right:incoming.right,top:incoming.top});
  if(embedded&&h>0)drawSlice(page,embedded,{x,y,width,height:h});
}

async function rebuildCascadeTarget(doc,targetIndex,incoming,plan,{band,footerGuardTop,safetyGap}){
  const livePage=doc.getPage(targetIndex);
  if(!livePage)return {ok:false,reason:'CASCADE_TARGET_PAGE_MISSING'};
  const rotation=((livePage.getRotation().angle||0)%360+360)%360;
  if(rotation!==0)return {ok:false,reason:'CASCADE_ROTATED_PAGE_UNSUPPORTED'};
  const {width,height}=livePage.getSize();
  if(Math.abs(width-Number(plan.pageWidth||width))>2||Math.abs(height-Number(plan.pageHeight||height))>2){
    return {ok:false,reason:'CASCADE_PAGE_SIZE_MISMATCH'};
  }
  const targetBand=normalizedContentBand({contentBand:band},width);
  if(!targetBand)return {ok:false,reason:'CASCADE_CONTENT_BAND_INVALID'};
  const bandLeft=targetBand.left,bandRight=targetBand.right,bandWidth=targetBand.width;
  const topGuardBottom=cascadeTopGuardBottom(plan,height,footerGuardTop);
  const movableFloor=footerGuardTop+safetyGap;
  const bodyCapacity=topGuardBottom-movableFloor;
  const inHeight=incomingHeight(incoming);
  if(!(inHeight>0))return {ok:true,done:true,appendedPageCount:0};
  if(inHeight>bodyCapacity-8)return {ok:false,reason:'CASCADE_INCOMING_TOO_LARGE'};

  const annotationInfo=inspectAnnotations(doc,livePage);
  if(!annotationInfo.ok)return {ok:false,reason:annotationInfo.reason||'CASCADE_ANNOTATION_UNSAFE'};

  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const measurement=await measureTargetPage(donorBytes,targetIndex,{bandLeft,bandRight,footerGuardTop,topGuardBottom});
  if(measurement?.unsafe)return {ok:false,reason:measurement.reason};
  if(measurement&&Math.abs(measurement.width-width)>2)return {ok:false,reason:'CASCADE_RENDER_SIZE_MISMATCH'};

  const topWhitespace=measurement?.hasBodyText?Math.max(0,topGuardBottom-measurement.contentTopY):bodyCapacity;
  const shift=measurement?.hasBodyText?Math.max(0,inHeight+safetyGap-topWhitespace):0;
  if(shift>bodyCapacity*.72)return {ok:false,reason:'CASCADE_SHIFT_TOO_LARGE'};
  const overflowNeeded=!!(measurement?.hasBodyText&&measurement.contentBottomY-shift<movableFloor);
  const overflowBoundary=overflowNeeded?clamp(movableFloor+shift,footerGuardTop,topGuardBottom):footerGuardTop;

  const linkSafety=validateCascadeLinks(annotationInfo,{bandLeft,bandRight,footerGuardTop,topGuardBottom,shift,overflowBoundary,movableFloor});
  if(!linkSafety.ok)return {ok:false,reason:linkSafety.reason};

  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(targetIndex);
  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:topGuardBottom,right:width,top:height});
  const footerSlice=footerGuardTop>.5?await embedSlice(doc,donorPage,{left:0,bottom:0,right:width,top:footerGuardTop}):null;
  const staticMargins=await buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,bottom:footerGuardTop,top:topGuardBottom});
  const bodySlice=await embedSlice(doc,donorPage,{left:bandLeft,bottom:overflowBoundary,right:bandRight,top:topGuardBottom});

  const replacement=doc.insertPage(targetIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:topGuardBottom,width,height:height-topGuardBottom});
  if(footerSlice)drawSlice(replacement,footerSlice,{x:0,y:0,width,height:footerGuardTop});
  drawStaticMargins(replacement,staticMargins,{bandLeft,bandRight,width,bottom:footerGuardTop,top:topGuardBottom});
  if(bodySlice){
    const bodyHeight=topGuardBottom-overflowBoundary;
    drawSlice(replacement,bodySlice,{x:bandLeft,y:overflowBoundary-shift,width:bandWidth,height:bodyHeight});
  }
  await drawIncoming(doc,replacement,incoming,{x:bandLeft,y:topGuardBottom-inHeight,width:bandWidth});
  preserveAndMoveLinks(doc,replacement,annotationInfo,linkSafety.links,shift);
  doc.removePage(targetIndex+1);

  const nextIncoming=overflowNeeded&&overflowBoundary>footerGuardTop+.5
    ?{donorPage,left:bandLeft,right:bandRight,bottom:footerGuardTop,top:overflowBoundary,width:bandWidth}
    :null;
  return {ok:true,done:!nextIncoming,nextIncoming,shift,overflowBoundary,topGuardBottom};
}

async function appendCascadePage(doc,incoming,plan,{band,footerGuardTop,safetyGap}){
  const width=Number(plan.pageWidth)||595;
  const height=Number(plan.pageHeight)||842;
  const targetBand=normalizedContentBand({contentBand:band},width);
  if(!targetBand)return {ok:false,reason:'CASCADE_CONTENT_BAND_INVALID'};
  const bandLeft=targetBand.left,bandRight=targetBand.right,bandWidth=targetBand.width;
  const topGuardBottom=cascadeTopGuardBottom(plan,height,footerGuardTop);
  const movableFloor=footerGuardTop+safetyGap;
  const bodyCapacity=topGuardBottom-movableFloor;
  const h=incomingHeight(incoming);
  if(h>bodyCapacity-8)return {ok:false,reason:'CASCADE_FINAL_PAGE_OVERFLOW_TOO_LARGE'};

  const donorPage=incoming.donorPage;
  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:topGuardBottom,right:width,top:height});
  const footerSlice=footerGuardTop>.5?await embedSlice(doc,donorPage,{left:0,bottom:0,right:width,top:footerGuardTop}):null;
  const staticMargins=await buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,bottom:footerGuardTop,top:topGuardBottom});
  const page=doc.addPage([width,height]);
  if(topSlice)drawSlice(page,topSlice,{x:0,y:topGuardBottom,width,height:height-topGuardBottom});
  if(footerSlice)drawSlice(page,footerSlice,{x:0,y:0,width,height:footerGuardTop});
  drawStaticMargins(page,staticMargins,{bandLeft,bandRight,width,bottom:footerGuardTop,top:topGuardBottom});
  await drawIncoming(doc,page,incoming,{x:bandLeft,y:topGuardBottom-h,width:bandWidth});
  return {ok:true,appendedPageCount:1};
}

async function cascadeOverflowForward(doc,sourcePageIndex,incoming,plan,{band,footerGuardTop,safetyGap}){
  let current=incoming;
  let targetIndex=sourcePageIndex+1;
  let touched=0;
  let appendedPageCount=0;
  while(current){
    if(touched>16)return {ok:false,reason:'CASCADE_PAGE_LIMIT'};
    if(targetIndex<doc.getPageCount()){
      const result=await rebuildCascadeTarget(doc,targetIndex,current,plan,{band,footerGuardTop,safetyGap});
      if(!result.ok)return result;
      touched++;
      current=result.nextIncoming||null;
      targetIndex++;
      continue;
    }
    const appended=await appendCascadePage(doc,current,plan,{band,footerGuardTop,safetyGap});
    if(!appended.ok)return appended;
    appendedPageCount+=appended.appendedPageCount||0;
    touched++;
    current=null;
  }
  return {ok:true,touched,appendedPageCount};
}

/**
 * Rebuild one page with a vertical gap inserted inside a movable horizontal
 * content band. When real body content reaches the footer, overflow cascades
 * into the existing following page, pushing that page's body downward just like
 * a word processor. A new page is appended only after the last existing page is
 * genuinely full. Static page frames/margins/footer bands stay fixed.
 */
export async function applyVerticalRegionReflow(doc,tx,layout,{preview=false,sequenceIndex=0}={}){
  const plan=tx?.reflowPlan;
  if(!plan?.enabled)return {applied:false,reason:plan?.reason||'REFLOW_DISABLED',overflowPageCount:0};

  const pageIndex=Number(tx.pageIndex);
  if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())return {applied:false,reason:'REFLOW_PAGE_MISSING',overflowPageCount:0};

  const livePage=doc.getPage(pageIndex);
  const rotation=((livePage.getRotation().angle||0)%360+360)%360;
  if(rotation!==0||Number(plan.pageRotation||0)!==0)return {applied:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED',overflowPageCount:0};

  const annotationInfo=inspectAnnotations(doc,livePage);
  if(!annotationInfo.ok)return {applied:false,reason:annotationInfo.reason||'ANNOTATED_PAGE_REFLOW_UNSAFE',overflowPageCount:0};

  const {width,height}=livePage.getSize();
  const band=normalizedContentBand(plan,width);
  if(!band)return {applied:false,reason:'CONTENT_BAND_INVALID',overflowPageCount:0};
  const bandLeft=band.left,bandRight=band.right,bandWidth=band.width;
  const cutY=clamp(Number(plan.cutY)||0,2,height-2);
  const flowTopY=clamp(Number(plan.flowTopY)||cutY,0,height);
  const contentBottomY=clamp(Number(plan.contentBottomY)||0,0,height);
  const safetyGap=Math.max(2,Number(plan.safetyGap)||4);
  const bottomMargin=Math.max(8,Number(plan.bottomMargin)||12);
  const footerGuard=normalizedFooterGuard(plan,height,bottomMargin,cutY);
  const footerGuardTop=footerGuard.top;
  const movableFloor=Math.min(cutY-1,footerGuardTop+safetyGap);
  const textBottomY=Number(layout?.bottomY);
  if(!Number.isFinite(textBottomY))return {applied:false,reason:'REFLOW_TEXT_GEOMETRY_MISSING',overflowPageCount:0};

  const delta=Math.max(0,flowTopY+safetyGap-textBottomY);
  if(delta<.5){
    return {applied:false,reason:'EXISTING_WHITESPACE_SUFFICIENT',overflowPageCount:0,metric:{transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta:0,overflowPageCount:0,bandLeft,bandRight,footerGuardTop}};
  }
  if(delta>height*.72)return {applied:false,reason:'REFLOW_SHIFT_TOO_LARGE',overflowPageCount:0};

  const overflowNeeded=contentBottomY-delta<movableFloor;
  const overflowBoundary=overflowNeeded?clamp(delta+movableFloor,footerGuardTop,cutY):footerGuardTop;
  const linkSafety=validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,movableFloor,bandLeft,bandRight,footerGuardTop});
  if(!linkSafety.ok)return {applied:false,reason:linkSafety.reason,overflowPageCount:0};

  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);

  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:cutY,right:width,top:height});
  const footerSlice=footerGuardTop>.5?await embedSlice(doc,donorPage,{left:0,bottom:0,right:width,top:footerGuardTop}):null;
  const visibleMovableSlice=await embedSlice(doc,donorPage,{left:bandLeft,bottom:overflowBoundary,right:bandRight,top:cutY});
  const staticBelow=await buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,bottom:footerGuardTop,top:cutY});

  const replacement=doc.insertPage(pageIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:cutY,width,height:height-cutY});
  if(footerSlice)drawSlice(replacement,footerSlice,{x:0,y:0,width,height:footerGuardTop});
  drawStaticMargins(replacement,staticBelow,{bandLeft,bandRight,width,bottom:footerGuardTop,top:cutY});
  if(visibleMovableSlice){
    const sliceHeight=cutY-overflowBoundary;
    drawSlice(replacement,visibleMovableSlice,{x:bandLeft,y:overflowBoundary-delta,width:bandWidth,height:sliceHeight});
  }
  preserveAndMoveLinks(doc,replacement,annotationInfo,linkSafety.links,delta);
  doc.removePage(pageIndex+1);

  let cascadePageCount=0;
  let appendedPageCount=0;
  if(overflowNeeded&&overflowBoundary>footerGuardTop+.5){
    const incoming={donorPage,left:bandLeft,right:bandRight,bottom:footerGuardTop,top:overflowBoundary,width:bandWidth};
    const cascade=await cascadeOverflowForward(doc,pageIndex,incoming,plan,{band,footerGuardTop,safetyGap});
    if(!cascade.ok)throw Object.assign(new Error('Overflow could not be cascaded safely into the following page.'),{code:cascade.reason||'CASCADE_REFLOW_UNSAFE'});
    cascadePageCount=cascade.touched||0;
    appendedPageCount=cascade.appendedPageCount||0;
  }

  return {
    applied:true,
    overflowPageCount:0,
    metric:{
      transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta,flowTopY,contentBottomY,overflowBoundary,
      overflowPageCount:0,cascadePageCount,appendedPageCount,preservedLinkCount:annotationInfo.links.length,
      bandLeft,bandRight,bandWidth,footerGuardTop,footerGuardEnabled:footerGuard.enabled,
      mode:'WORD_STYLE_CASCADE_REFLOW',preview:!!preview,
    },
  };
}
