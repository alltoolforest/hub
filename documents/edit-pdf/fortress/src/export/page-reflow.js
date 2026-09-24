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

function classifyLink(link,cutY){
  const {bottom,top}=link.bounds;
  if(bottom<cutY-.5&&top>cutY+.5)return 'CROSSES_CUT';
  if(top<=cutY+.5)return 'MOVED';
  return 'STATIC';
}

function validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,bottomMargin}){
  const classified=[];
  for(const link of annotationInfo.links){
    const zone=classifyLink(link,cutY);
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

  const annotationInfo=inspectAnnotations(doc,livePage);
  if(!annotationInfo.ok){
    return {applied:false,reason:annotationInfo.reason||'ANNOTATED_PAGE_REFLOW_UNSAFE',overflowPageCount:0};
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
  const linkSafety=validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,bottomMargin});
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
  const visibleBottomSlice=await embedSlice(doc,donorPage,{left:0,bottom:overflowBoundary,right:width,top:cutY});

  // Insert replacement before the old page, then delete the old page. Net page
  // index of the source page remains unchanged.
  const replacement=doc.insertPage(pageIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:cutY,width,height:height-cutY});
  if(visibleBottomSlice){
    const sliceHeight=cutY-overflowBoundary;
    drawSlice(replacement,visibleBottomSlice,{x:0,y:overflowBoundary-delta,width,height:sliceHeight});
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
      preservedLinkCount:annotationInfo.links.length,
    },
  };
}
