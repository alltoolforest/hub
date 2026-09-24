import { PDFDocument, PDFName } from '../core/pdf-lib.js';

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
  try{
    if(typeof array?.lookup==='function')return array.lookup(index);
  }catch{}
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

/**
 * Reflow may safely preserve ordinary Link annotations because their clickable
 * rectangle can move with the preserved page region. More complex annotations
 * (widgets, signatures, comments, appearances, quad-point links, etc.) keep the
 * conservative fallback behavior.
 */
function inspectAnnotations(doc,page){
  const raw=page?.node?.get?.(ANN0TS);
  if(!raw)return {ok:true,raw:null,links:[]};
  const array=lookup(doc,raw);
  if(!array||typeof array.size!=='function'||typeof array.get!=='function'){
    return {ok:false,reason:'ANNOTATION_ARRAY_UNREADABLE'};
  }

  const links=[];
  for(let i=0;i<array.size();i++){
    const dict=arrayItem(doc,array,i);
    if(!dict||typeof dict.get!=='function'||typeof dict.set!=='function'){
      return {ok:false,reason:'ANNOTATION_DICTIONARY_UNREADABLE'};
    }
    const subtype=String(dict.get(SUBTYPE)||'');
    if(subtype!=='/Link'&&subtype!=='Link'){
      return {ok:false,reason:'COMPLEX_ANNOTATION_REFLOW_UNSAFE'};
    }
    if(dict.get(AP)||dict.get(QUAD_POINTS)){
      return {ok:false,reason:'COMPLEX_LINK_GEOMETRY_REFLOW_UNSAFE'};
    }
    const rectArray=lookup(doc,dict.get(RECT));
    if(!rectArray||typeof rectArray.size!=='function'||rectArray.size()<4){
      return {ok:false,reason:'LINK_RECTANGLE_MISSING'};
    }
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

function classifyLink(link,{cutY,bandLeft,bandRight}){
  const {left,right,bottom,top}=link.bounds;
  const outsideBand=right<=bandLeft+.5||left>=bandRight-.5;
  if(outsideBand)return 'STATIC';
  const crossesBand=(left<bandLeft-.5&&right>bandLeft+.5)||(left<bandRight-.5&&right>bandRight+.5);
  if(crossesBand)return 'CROSSES_BAND';
  if(bottom<cutY-.5&&top>cutY+.5)return 'CROSSES_CUT';
  if(top<=cutY+.5)return 'MOVED';
  return 'STATIC';
}

function validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,bottomMargin,bandLeft,bandRight}){
  const classified=[];
  for(const link of annotationInfo.links){
    const zone=classifyLink(link,{cutY,bandLeft,bandRight});
    if(zone==='CROSSES_BAND')return {ok:false,reason:'LINK_CROSSES_CONTENT_BAND'};
    if(zone==='CROSSES_CUT')return {ok:false,reason:'LINK_CROSSES_REFLOW_BOUNDARY'};
    if(zone==='MOVED'){
      if(overflowNeeded&&link.bounds.bottom<overflowBoundary+.5){
        return {ok:false,reason:'LINK_OVERFLOW_REFLOW_UNSAFE'};
      }
      if(link.bounds.bottom-delta<Math.max(0,bottomMargin-1)){
        return {ok:false,reason:'LINK_SHIFT_OUT_OF_PAGE'};
      }
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

async function embedSlice(destDoc,donorPage,{left=0,bottom=0,right,top}){
  if(!(top>bottom)||!(right>left))return null;
  return destDoc.embedPage(donorPage,{left,bottom,right,top});
}

function drawSlice(page,embedded,{x=0,y=0,width,height}){
  if(!embedded)return;
  page.drawPage(embedded,{x,y,width,height});
}

async function buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,height,bottom=0,top=height}){
  const left=bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom,right:bandLeft,top}):null;
  const right=bandRight<width-1?await embedSlice(doc,donorPage,{left:bandRight,bottom,right:width,top}):null;
  return {left,right};
}

function drawStaticMargins(page,slices,{bandLeft,bandRight,width,bottom=0,top}){
  const h=top-bottom;
  if(slices.left)drawSlice(page,slices.left,{x:0,y:bottom,width:bandLeft,height:h});
  if(slices.right)drawSlice(page,slices.right,{x:bandRight,y:bottom,width:width-bandRight,height:h});
}

/**
 * Rebuild one page with a vertical gap inserted inside a movable horizontal
 * content band. Text/table content in that band moves together as preserved PDF
 * vector content, while outer page margins remain fixed. This prevents page
 * frames and decorative edge rules from being split when a paragraph expands.
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

  const annotationInfo=inspectAnnotations(doc,livePage);
  if(!annotationInfo.ok){
    return {applied:false,reason:annotationInfo.reason||'ANNOTATED_PAGE_REFLOW_UNSAFE',overflowPageCount:0};
  }

  const {width,height}=livePage.getSize();
  const band=normalizedContentBand(plan,width);
  if(!band)return {applied:false,reason:'CONTENT_BAND_INVALID',overflowPageCount:0};
  const bandLeft=band.left,bandRight=band.right,bandWidth=band.width;
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
      metric:{transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta:0,overflowPageCount:0,bandLeft,bandRight},
    };
  }

  if(delta>height*.72){
    return {applied:false,reason:'REFLOW_SHIFT_TOO_LARGE',overflowPageCount:0};
  }

  // Overflow is based on detected movable document content, not on page-frame
  // graphics living in static margins.
  const overflowNeeded=contentBottomY-delta<bottomMargin;
  const overflowBoundary=overflowNeeded?clamp(delta+bottomMargin,0,cutY):0;
  const usableOverflowHeight=Math.max(40,height-topMargin-bottomMargin);
  const linkSafety=validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,bottomMargin,bandLeft,bandRight});
  if(!linkSafety.ok){
    return {applied:false,reason:linkSafety.reason,overflowPageCount:0};
  }

  // Snapshot before rebuilding so the donor page represents the exact current
  // state, including previous edits/reflows on this page. Link annotations are
  // preserved separately because embedPage intentionally embeds page content,
  // not interactive annotation dictionaries.
  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);

  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:cutY,right:width,top:height});
  const visibleMovableSlice=await embedSlice(doc,donorPage,{left:bandLeft,bottom:overflowBoundary,right:bandRight,top:cutY});
  const staticBelow=await buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,height,bottom:0,top:cutY});

  // Insert replacement before the old page, then delete the old page. Net page
  // index of the source page remains unchanged.
  const replacement=doc.insertPage(pageIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:cutY,width,height:height-cutY});
  drawStaticMargins(replacement,staticBelow,{bandLeft,bandRight,width,bottom:0,top:cutY});
  if(visibleMovableSlice){
    const sliceHeight=cutY-overflowBoundary;
    drawSlice(replacement,visibleMovableSlice,{x:bandLeft,y:overflowBoundary-delta,width:bandWidth,height:sliceHeight});
  }
  preserveAndMoveLinks(doc,replacement,annotationInfo,linkSafety.links,delta);
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

    // Static margin strips are copied to continuation pages as a page-frame
    // background, while only the movable content band is paginated.
    const continuationMargins=await buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,height,bottom:0,top:height});
    for(let i=0;i<slices.length;i++){
      const slice=slices[i];
      const embedded=await embedSlice(doc,donorPage,{left:bandLeft,bottom:slice.bottom,right:bandRight,top:slice.top});
      const continuation=preview?doc.addPage([width,height]):doc.insertPage(pageIndex+1+i,[width,height]);
      drawStaticMargins(continuation,continuationMargins,{bandLeft,bandRight,width,bottom:0,top:height});
      const h=slice.top-slice.bottom;
      drawSlice(continuation,embedded,{x:bandLeft,y:height-topMargin-h,width:bandWidth,height:h});
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
      preservedLinkCount:annotationInfo.links.length,
      bandLeft,
      bandRight,
      bandWidth,
      mode:plan.mode||'VERTICAL_CONTENT_BAND_REFLOW',
    },
  };
}
