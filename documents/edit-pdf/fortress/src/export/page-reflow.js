import { PDFDocument, PDFName } from '../core/pdf-lib.js';
import { cascadeOverflowIntoExistingPages } from './cascade-page-flow.js';
import { loadPdfjs } from '../rendering/pdfjs.js';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');

function lookup(doc,value){if(!value)return null;try{return doc.context.lookup(value);}catch{return null;}}
function arrayItem(doc,array,index){try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}try{return lookup(doc,array?.get?.(index));}catch{return null;}}
function numberValue(doc,value){const resolved=lookup(doc,value)||value;if(typeof resolved?.asNumber==='function')return resolved.asNumber();const n=Number(String(resolved));return Number.isFinite(n)?n:null;}
function rectBounds(rect){return {left:Math.min(rect[0],rect[2]),right:Math.max(rect[0],rect[2]),bottom:Math.min(rect[1],rect[3]),top:Math.max(rect[1],rect[3])};}
function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}

function normalizedContentBand(plan,pageWidth){
  const raw=plan?.contentBand;
  if(!raw)return {left:0,right:pageWidth,width:pageWidth,legacyFullWidth:true};
  let left=clamp(Number(raw.left)||0,0,pageWidth),right=clamp(Number(raw.right)||pageWidth,0,pageWidth);
  if(right-left<40)return null;
  if(left<1)left=0;if(pageWidth-right<1)right=pageWidth;
  return {left,right,width:right-left,legacyFullWidth:false};
}

function normalizedFooterGuard(plan,pageHeight,bottomMargin,cutY){
  const requested=Number(plan?.footerGuard?.top);
  if(!Number.isFinite(requested))return {enabled:false,top:bottomMargin,height:bottomMargin};
  const maxTop=Math.max(bottomMargin,Math.min(cutY-2,pageHeight*.18));
  const top=clamp(requested,bottomMargin,maxTop);
  return {enabled:top>bottomMargin+1,top,height:top,confidence:plan?.footerGuard?.confidence||null};
}

function normalizedFlowBlocks(plan,{bandLeft,bandRight,footerGuardTop,cutY}){
  const rawLines=Array.isArray(plan?.flowLines)&&plan.flowLines.length?plan.flowLines:(Array.isArray(plan?.flowBlocks)?plan.flowBlocks:[]);
  const out=[];
  for(const raw of rawLines){
    const left=Number(raw?.left),right=Number(raw?.right),bottom=Number(raw?.bottom),top=Number(raw?.top);
    if(![left,right,bottom,top].every(Number.isFinite)||right<=left||top<=bottom)continue;
    if(top<=footerGuardTop+.25||bottom>=cutY-.25)continue;
    if(overlap(left,right,bandLeft,bandRight)<Math.min(8,Math.max(1,right-left)*.2))continue;
    out.push({
      id:raw?.blockId||raw?.id||null,
      blockId:raw?.blockId||raw?.id||null,
      lineId:raw?.lineId||null,
      lineIndex:Number.isInteger(raw?.lineIndex)?raw.lineIndex:null,
      blockLineCount:Math.max(1,Number(raw?.blockLineCount)||1),
      left,right,bottom,top,
    });
  }
  return out.sort((a,b)=>b.top-a.top);
}

function snapOverflowBoundary(plan,{delta,movableFloor,footerGuardTop,cutY,bandLeft,bandRight,safetyGap}){
  const rawBoundary=clamp(delta+movableFloor,footerGuardTop,cutY);
  const lines=normalizedFlowBlocks(plan,{bandLeft,bandRight,footerGuardTop,cutY});
  if(!lines.length)return {boundary:rawBoundary,overflowedBlockIds:[],overflowedLineIds:[]};

  const affected=lines.filter(line=>line.bottom-delta<movableFloor+.5);
  if(!affected.length)return {boundary:rawBoundary,overflowedBlockIds:[],overflowedLineIds:[]};

  const pad=Math.max(.65,Math.min(2,Number(safetyGap||4)*.18));
  let boundary=clamp(Math.max(...affected.map(line=>line.top))+pad,footerGuardTop,cutY);

  for(let i=0;i<24;i++){
    const crossing=lines.filter(line=>line.bottom<boundary-.2&&line.top>boundary+.2);
    if(!crossing.length)break;
    const next=clamp(Math.max(...crossing.map(line=>line.top))+pad,footerGuardTop,cutY);
    if(next<=boundary+.05)break;
    boundary=next;
  }

  const overflowed=lines.filter(line=>line.top<=boundary+.75);
  const overflowedLineIds=overflowed.map(line=>line.lineId).filter(Boolean);

  const totals=new Map(),movedCounts=new Map();
  for(const line of lines){
    if(!line.blockId)continue;
    totals.set(line.blockId,Math.max(totals.get(line.blockId)||0,line.blockLineCount||1));
  }
  for(const line of overflowed){
    if(!line.blockId)continue;
    movedCounts.set(line.blockId,(movedCounts.get(line.blockId)||0)+1);
  }
  const overflowedBlockIds=[];
  for(const [blockId,count] of movedCounts){
    if(count>=(totals.get(blockId)||1))overflowedBlockIds.push(blockId);
  }
  return {boundary,overflowedBlockIds,overflowedLineIds};
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
    for(let j=0;j<4;j++){const value=numberValue(doc,rectArray.get(j));if(!Number.isFinite(value))return {ok:false,reason:'LINK_RECTANGLE_INVALID'};rect.push(value);}
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
  if(bottom<cutY-.5&&top>cutY+.5)return ((bottom+top)/2<=cutY?'MOVED':'STATIC');
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
    if(link.zone==='MOVED')link.dict.set(RECT,doc.context.obj([link.rect[0],link.rect[1]-delta,link.rect[2],link.rect[3]-delta]));
    if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);
  }
  replacement.node.set(ANN0TS,annotationInfo.raw);
}

async function embedSlice(destDoc,donorPage,{left=0,bottom=0,right,top}){if(!(top>bottom)||!(right>left))return null;return destDoc.embedPage(donorPage,{left,bottom,right,top});}
function drawSlice(page,embedded,{x=0,y=0,width,height}){if(embedded)page.drawPage(embedded,{x,y,width,height});}
async function buildStaticMarginSlices(doc,donorPage,{bandLeft,bandRight,width,bottom=0,top}){
  if(!(top>bottom))return {left:null,right:null};
  const left=bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom,right:bandLeft,top}):null;
  const right=bandRight<width-1?await embedSlice(doc,donorPage,{left:bandRight,bottom,right:width,top}):null;
  return {left,right};
}
function drawStaticMargins(page,slices,{bandLeft,bandRight,width,bottom=0,top}){
  const h=top-bottom;if(!(h>0))return;
  if(slices.left)drawSlice(page,slices.left,{x:0,y:bottom,width:bandLeft,height:h});
  if(slices.right)drawSlice(page,slices.right,{x:bandRight,y:bottom,width:width-bandRight,height:h});
}

function crossesBoundary(bottom,top,boundary,tolerance=1){
  return Number.isFinite(boundary)&&bottom<boundary-tolerance&&top>boundary+tolerance;
}

async function validateVectorReflow(bytes,pageIndex,{cutY,overflowBoundary,bandLeft,bandRight}){
  try{
    const p=await loadPdfjs();
    const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
    const pdf=await task.promise;
    const page=await pdf.getPage(pageIndex+1);
    const operators=await page.getOperatorList();
    const dangerous=[];
    for(let i=0;i<operators.fnArray.length;i++){
      if(operators.fnArray[i]!==p.OPS.constructPath)continue;
      const raw=operators.argsArray[i]?.[2];
      if(!raw)continue;
      const left=Number(raw[0]),bottom=Number(raw[1]),right=Number(raw[2]),top=Number(raw[3]);
      if(![left,bottom,right,top].every(Number.isFinite))continue;
      const x0=Math.min(left,right),x1=Math.max(left,right),y0=Math.min(bottom,top),y1=Math.max(bottom,top);
      const width=x1-x0,height=y1-y0;
      const horizontalOverlap=Math.max(0,Math.min(x1,bandRight)-Math.max(x0,bandLeft));
      const bandWidth=Math.max(1,bandRight-bandLeft);
      const isVerticalBoundary=width<=2.5&&height>=10;
      const isHorizontalBoundary=height<=2.5&&width>=12;
      const isStructuredCell=width>=8&&height>=6&&width<=bandWidth*.92&&height<=180&&horizontalOverlap>=Math.min(8,width*.20);
      if(!isVerticalBoundary&&!isHorizontalBoundary&&!isStructuredCell)continue;
      const centerX=(x0+x1)/2;
      const verticalInBand=isVerticalBoundary&&centerX>=bandLeft-1&&centerX<=bandRight+1;
      const horizontalInBand=isHorizontalBoundary&&horizontalOverlap>=8;
      const cellInBand=isStructuredCell&&horizontalOverlap>=Math.min(8,width*.20);
      if(!verticalInBand&&!horizontalInBand&&!cellInBand)continue;
      const crossesCut=verticalInBand&&crossesBoundary(y0,y1,cutY);
      const crossesOverflow=verticalInBand&&crossesBoundary(y0,y1,overflowBoundary);
      const sitsOnCut=horizontalInBand&&Math.abs((y0+y1)/2-cutY)<=1.25;
      const sitsOnOverflow=horizontalInBand&&Math.abs((y0+y1)/2-overflowBoundary)<=1.25;
      const cellCrossesCut=cellInBand&&cutY>y0+.35&&cutY<y1-.35;
      const cellCrossesOverflow=cellInBand&&Number.isFinite(overflowBoundary)&&overflowBoundary>y0+.35&&overflowBoundary<y1-.35;
      if(crossesCut||crossesOverflow||sitsOnCut||sitsOnOverflow||cellCrossesCut||cellCrossesOverflow){
        dangerous.push({left:x0,right:x1,bottom:y0,top:y1,kind:isVerticalBoundary?'VERTICAL':(isHorizontalBoundary?'HORIZONTAL':'CELL')});
        if(dangerous.length>=8)break;
      }
    }
    try{await pdf.destroy?.();}catch{}
    if(dangerous.length)return {ok:false,reason:'STRUCTURED_VECTOR_REFLOW_UNSAFE',boundaries:dangerous};
    return {ok:true,boundaries:[]};
  }catch(error){
    return {ok:false,reason:'VECTOR_REFLOW_PREFLIGHT_FAILED',error:String(error)};
  }
}

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
  const topMargin=Math.max(16,Number(plan.topMargin)||28);
  const footerGuard=normalizedFooterGuard(plan,height,bottomMargin,cutY);
  const footerGuardTop=footerGuard.top;
  const movableFloor=Math.min(cutY-1,footerGuardTop+safetyGap);
  const requestedDelta=Number(plan.requestedDelta);
  const textBottomY=Number(layout?.bottomY);
  if(!Number.isFinite(requestedDelta)&&!Number.isFinite(textBottomY))return {applied:false,reason:'REFLOW_TEXT_GEOMETRY_MISSING',overflowPageCount:0};

  const delta=Number.isFinite(requestedDelta)?requestedDelta:Math.max(0,flowTopY+safetyGap-textBottomY);
  if(Math.abs(delta)<.5){
    return {applied:false,reason:Number.isFinite(requestedDelta)?'COMPACTION_NOT_NEEDED':'EXISTING_WHITESPACE_SUFFICIENT',overflowPageCount:0,metric:{transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta:0,overflowPageCount:0,cascadedPageCount:0,overflowedBlockIds:[],overflowedLineIds:[],bandLeft,bandRight,footerGuardTop}};
  }
  if(Math.abs(delta)>height*.72)return {applied:false,reason:'REFLOW_SHIFT_TOO_LARGE',overflowPageCount:0};

  const overflowNeeded=delta>0&&contentBottomY-delta<movableFloor;
  const snapped=overflowNeeded?snapOverflowBoundary(plan,{delta,movableFloor,footerGuardTop,cutY,bandLeft,bandRight,safetyGap}):{boundary:footerGuardTop,overflowedBlockIds:[],overflowedLineIds:[]};
  const overflowBoundary=snapped.boundary;
  const overflowedBlockIds=snapped.overflowedBlockIds;
  const overflowedLineIds=snapped.overflowedLineIds;
  const linkSafety=validateLinkReflow(annotationInfo,{cutY,delta,overflowNeeded,overflowBoundary,movableFloor,bandLeft,bandRight,footerGuardTop});
  if(!linkSafety.ok)return {applied:false,reason:linkSafety.reason,overflowPageCount:0};

  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const vectorSafety=await validateVectorReflow(donorBytes,pageIndex,{cutY,overflowBoundary,bandLeft,bandRight});
  if(!vectorSafety.ok)return {applied:false,reason:vectorSafety.reason,overflowPageCount:0,vectorSafety};
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);

  let cascadeInfo={applied:false,appendedPageCount:0,cascadedPageCount:0};
  if(overflowNeeded&&overflowBoundary>footerGuardTop+.5){
    cascadeInfo=await cascadeOverflowIntoExistingPages(doc,{
      sourcePageIndex:pageIndex,plan,sourceDonorPage:donorPage,
      overflowBottom:footerGuardTop,overflowTop:overflowBoundary,
      bandLeft,bandRight,width,height,preview,
    });
    if(!cascadeInfo.applied){
      return {applied:false,reason:cascadeInfo.reason||'CASCADE_REFLOW_UNSAFE',overflowPageCount:0};
    }
  }

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

  const appendedPageCount=Number(cascadeInfo.appendedPageCount)||0;
  const cascadedPageCount=Number(cascadeInfo.cascadedPageCount)||0;
  return {
    applied:true,
    overflowPageCount:0,
    metric:{
      transactionId:tx.id,pageIndex,sequenceIndex,cutY,delta,flowTopY,contentBottomY,overflowBoundary,
      overflowPageCount:0,appendedPageCount,cascadedPageCount,overflowedBlockIds,overflowedLineIds,preservedLinkCount:annotationInfo.links.length,
      bandLeft,bandRight,bandWidth,footerGuardTop,footerGuardEnabled:footerGuard.enabled,
      mode:overflowNeeded?'CASCADE_EXISTING_PAGES':(plan.mode||'VERTICAL_CONTENT_BAND_REFLOW'),
    },
  };
}
