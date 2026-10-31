import {rasterFlowProfile} from '../layout/raster-flow.js';
import {attachFlowAnnotations} from './annotation-flow.js';
import {validateGraphicsFlow,collectGraphicsBounds} from './graphics-flow-guard.js';
import {loadPdfjs} from '../rendering/pdfjs.js';
import { PDFName } from '../core/pdf-lib.js';
import { embedExtractionCleanPageSlice } from './embedded-slice-sanitizer.js';
import { normalizeKeepGroups, snapBoundaryToKeepGroup, partitionKeepGroups, placeIncomingKeepGroups } from '../layout/section-pagination.js';

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');
const runtimeByDocument=new WeakMap();

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function lookup(doc,value){if(!value)return null;try{return doc.context.lookup(value);}catch{return null;}}
function arrayItem(doc,array,index){try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}try{return lookup(doc,array?.get?.(index));}catch{return null;}}
function numberValue(doc,value){const resolved=lookup(doc,value)||value;if(typeof resolved?.asNumber==='function')return resolved.asNumber();const n=Number(String(resolved));return Number.isFinite(n)?n:null;}
function rectBounds(rect){return {left:Math.min(rect[0],rect[2]),right:Math.max(rect[0],rect[2]),bottom:Math.min(rect[1],rect[3]),top:Math.max(rect[1],rect[3])};}
function runtimeMap(doc){let map=runtimeByDocument.get(doc);if(!map){map=new Map();runtimeByDocument.set(doc,map);}return map;}
function runtimeState(doc,pageIndex){return runtimeMap(doc).get(pageIndex)||null;}
function runtimeBottom(doc,pageIndex,fallback){const value=runtimeState(doc,pageIndex)?.textBottomY;return Number.isFinite(value)?value:fallback;}
function runtimeGroups(doc,pageIndex,fallback){const value=runtimeState(doc,pageIndex)?.keepGroups;return Array.isArray(value)?value:fallback;}
function recordRuntime(doc,pageIndex,{textBottomY,keepGroups}={}){
  const current=runtimeState(doc,pageIndex)||{};
  const next={...current};
  if(Number.isFinite(textBottomY))next.textBottomY=textBottomY;
  if(Array.isArray(keepGroups))next.keepGroups=keepGroups.map(group=>({...group}));
  runtimeMap(doc).set(pageIndex,next);
}

async function embedSlice(doc,page,{left=0,bottom=0,right,top}){return embedExtractionCleanPageSlice(doc,page,{left,bottom,right,top});}
function drawSlice(page,embedded,{x=0,y=0,width,height}){if(embedded)page.drawPage(embedded,{x,y,width,height});}

function inspectLinks(doc,page){
  const raw=page?.node?.get?.(ANN0TS);
  if(!raw)return {ok:true,raw:null,links:[]};
  const array=lookup(doc,raw);
  if(!array||typeof array.size!=='function')return {ok:false,reason:'CASCADE_ANNOTATION_ARRAY_UNREADABLE'};
  const links=[];
  for(let i=0;i<array.size();i++){
    const dict=arrayItem(doc,array,i);
    if(!dict||typeof dict.get!=='function'||typeof dict.set!=='function')return {ok:false,reason:'CASCADE_ANNOTATION_UNREADABLE'};
    const subtype=String(dict.get(SUBTYPE)||'');
    const protectedWidget=subtype==='/Widget';if(!protectedWidget&&subtype!=='/Link'&&subtype!=='Link')return {ok:false,reason:'CASCADE_COMPLEX_ANNOTATION_UNSAFE'};
    if(!protectedWidget&&(dict.get(AP)||dict.get(QUAD_POINTS)))return {ok:false,reason:'CASCADE_COMPLEX_LINK_UNSAFE'};
    const rectArray=lookup(doc,dict.get(RECT));
    if(!rectArray||typeof rectArray.size!=='function'||rectArray.size()<4)return {ok:false,reason:'CASCADE_LINK_RECT_MISSING'};
    const rect=[];
    for(let j=0;j<4;j++){const n=numberValue(doc,rectArray.get(j));if(!Number.isFinite(n))return {ok:false,reason:'CASCADE_LINK_RECT_INVALID'};rect.push(n);}
    links.push({ref:array.get(i),dict,rect,bounds:rectBounds(rect),protectedWidget});
  }
  return {ok:true,raw,links};
}

function classifyLinks(info,{bandLeft,bandRight,bodyTopY,footerTop,shift,outgoingBoundary}){
  const out=[];
  for(const link of info.links){
    const b=link.bounds;
    const outsideBand=b.right<=bandLeft+.5||b.left>=bandRight-.5;
    const crossesBand=(b.left<bandLeft-.5&&b.right>bandLeft+.5)||(b.left<bandRight-.5&&b.right>bandRight+.5);
    if(crossesBand)return {ok:false,reason:'CASCADE_LINK_CROSSES_BAND'};
    if(outsideBand||b.bottom>=bodyTopY-.5||b.top<=footerTop+.5){out.push({...link,zone:'STATIC'});continue;}
    if(b.bottom<footerTop-.5&&b.top>footerTop+.5)return {ok:false,reason:'CASCADE_LINK_CROSSES_FOOTER'};
    if(b.bottom<bodyTopY-.5&&b.top>bodyTopY+.5){
      // A simple link rectangle can extend a few points beyond its text glyphs.
      // The page body slice is text-snapped, so use the rectangle centre to
      // decide which side owns the annotation instead of failing the cascade.
      if(link.protectedWidget)return {ok:false,reason:'FORM_WIDGET_CROSSES_BODY_BOUNDARY'};
      if((b.bottom+b.top)/2>=bodyTopY){out.push({...link,zone:'STATIC'});continue;}
    }
    if(outgoingBoundary>footerTop+.5&&b.bottom<outgoingBoundary+.5){if(b.top>outgoingBoundary-.01)return {ok:false,reason:'ANNOTATION_CROSSES_OVERFLOW_BOUNDARY'};out.push({...link,zone:'OUTGOING'});continue;}
    if(b.bottom-shift<footerTop-1)return {ok:false,reason:'CASCADE_LINK_SHIFT_INTO_FOOTER'};
    out.push({...link,zone:'MOVED'});
  }
  return {ok:true,links:out};
}

function preserveLinks(doc,replacement,info,classified,shift){
  if(!info.raw)return;
  for(const link of classified){
    if(link.zone==='OUTGOING')continue;
    if(link.zone==='MOVED')link.dict.set(RECT,doc.context.obj([link.rect[0],link.rect[1]-shift,link.rect[2],link.rect[3]-shift]));
    if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);
  }
  replacement.node.set(ANN0TS,doc.context.obj(classified.filter(l=>l.zone!=='OUTGOING').map(l=>l.ref||l.dict)));
}

async function snapshotPage(doc,pageIndex){
  // A removed PDFPage remains a valid embed source because its objects stay in
  // the document context. Reusing it avoids importing duplicate page resources.
  return {donorDoc:null,donorPage:doc.getPage(pageIndex)};
}

function normalizedGeometry(raw,page){
  const {width,height}=page.getSize();
  if(!raw||Number(raw.rotation||0)!==0)return null;
  if(Math.abs(Number(raw.width)-width)>2||Math.abs(Number(raw.height)-height)>2)return null;
  const band=raw.contentBand||{};
  const left=clamp(Number(band.left)||0,0,width),right=clamp(Number(band.right)||width,0,width);
  if(right-left<Math.max(100,width*.25))return null;
  const topMargin=raw.rasterFlow?Math.max(0,Number(raw.topMargin)||0):Math.max(16,Number(raw.topMargin)||28);
  const bottomMargin=raw.rasterFlow?Math.max(0,Number(raw.bottomMargin)||0):Math.max(8,Number(raw.bottomMargin)||12);
  const safetyGap=Math.max(3,Number(raw.safetyGap)||4);
  const footerTop=clamp(Number(raw.footerGuardTop)||bottomMargin,raw.rasterFlow?0:bottomMargin,Math.min(height*.20,height-60));
  const textTopY=Number(raw.textTopY),textBottomY=Number(raw.textBottomY);
  if(!Number.isFinite(textTopY)||!Number.isFinite(textBottomY))return null;
  const bodyTopY=clamp(Number(raw.bodyTopY)||textTopY+safetyGap,footerTop+40,height-topMargin);
  if(!(bodyTopY>footerTop+40))return null;
  const keepGroups=normalizeKeepGroups(raw.keepGroups||[],{footerTop,bodyTop:bodyTopY});
  return {rasterFlow:!!raw.rasterFlow,width,height,bandLeft:left,bandRight:right,bandWidth:right-left,topMargin,bottomMargin,safetyGap,footerTop,textTopY,textBottomY,bodyTopY,keepGroups};
}

function validateIncomingRegion(incoming,g){
  if(!incoming||!(incoming.height>0))return {ok:false,reason:'CASCADE_INCOMING_EMPTY'};
  if(incoming.left<0||incoming.right>g.width||incoming.right<=incoming.left)return {ok:false,reason:'CASCADE_INCOMING_BOUNDS_INVALID'};
  const tolerance=Math.max(28,g.width*.06);
  if(incoming.left<g.bandLeft-tolerance||incoming.right>g.bandRight+tolerance)return {ok:false,reason:'CASCADE_CONTENT_BAND_MISMATCH'};
  return {ok:true};
}

function preflightFollowingPage(doc,pageIndex,geometry,incoming,{allowSemantic=true}={}){
  if(pageIndex<0||pageIndex>=doc.getPageCount())return {ok:false,reason:'CASCADE_TARGET_PAGE_MISSING'};
  const live=doc.getPage(pageIndex);
  const rotation=((live.getRotation().angle||0)%360+360)%360;
  if(rotation!==0)return {ok:false,reason:'CASCADE_ROTATED_PAGE_UNSUPPORTED'};
  const g=normalizedGeometry(geometry,live);
  if(!g)return {ok:false,reason:'CASCADE_PAGE_GEOMETRY_UNSAFE'};
  g.textBottomY=runtimeBottom(doc,pageIndex,g.textBottomY);
  g.keepGroups=runtimeGroups(doc,pageIndex,g.keepGroups);
  // A wider incoming scan requires the whole receiving body band to move,
  // including its original margin objects. Final graphic/annotation cuts are
  // still verified before reconstructing any page.
  if(incoming.left>=0&&incoming.right<=g.width){g.bandLeft=Math.min(g.bandLeft,incoming.left);g.bandRight=Math.max(g.bandRight,incoming.right);g.bandWidth=g.bandRight-g.bandLeft;}
  const incomingSafety=validateIncomingRegion(incoming,g);
  if(!incomingSafety.ok)return incomingSafety;
  const shift=incoming.height+g.safetyGap;
  if(shift>g.bodyTopY-g.footerTop-20)return {ok:false,reason:'CASCADE_INCOMING_TOO_TALL'};
  const movableFloor=g.footerTop+g.safetyGap;
  const overflowNeeded=g.textBottomY-shift<movableFloor;
  const rawOutgoingBoundary=overflowNeeded?clamp(shift+movableFloor,g.footerTop,g.bodyTopY):g.footerTop;
  const semanticSnap=overflowNeeded&&allowSemantic?snapBoundaryToKeepGroup(rawOutgoingBoundary,g.keepGroups,{footerTop:g.footerTop,bodyTop:g.bodyTopY,safetyGap:g.safetyGap}):{boundary:overflowNeeded?rawOutgoingBoundary:g.footerTop,snapped:false,groupId:null,groupLabel:null};
  let outgoingBoundary=semanticSnap.boundary;
  const linkInfo=inspectLinks(doc,live);
  if(!linkInfo.ok)return {ok:false,reason:linkInfo.reason};
  if(overflowNeeded){try{outgoingBoundary=snapCascadeTextBoundary(outgoingBoundary,[...linkInfo.links.map(a=>a.bounds).filter(b=>b.left<g.bandRight&&b.right>g.bandLeft),...g.keepGroups.map(a=>({bottom:a.bottom,top:a.top}))],{floor:g.footerTop,ceiling:g.bodyTopY});}catch{return {ok:false,reason:'ANNOTATION_CANNOT_FIT_FLOW_REGION'};}}
  const classified=classifyLinks(linkInfo,{bandLeft:g.bandLeft,bandRight:g.bandRight,bodyTopY:g.bodyTopY,footerTop:g.footerTop,shift,outgoingBoundary});
  if(!classified.ok)return {ok:false,reason:classified.reason};
  return {ok:true,g,shift,overflowNeeded,outgoingBoundary,semanticSnap,nextIncoming:overflowNeeded?{height:outgoingBoundary-g.footerTop,left:g.bandLeft,right:g.bandRight}:null};
}

function preflightCascade(doc,{sourcePageIndex,pages,incoming,allowSemantic=true}){
  const targets=[];
  let simulation={...incoming};
  for(const raw of pages){
    const targetIndex=Number(raw.pageIndex);
    if(!Number.isInteger(targetIndex)||targetIndex<=sourcePageIndex||targetIndex>=doc.getPageCount())continue;
    const check=preflightFollowingPage(doc,targetIndex,raw,simulation,{allowSemantic});
    if(!check.ok)return {ok:false,reason:check.reason};
    targets.push({raw,targetIndex,check});
    if(!check.overflowNeeded)return {ok:true,targets,absorbed:true,allowSemantic};
    simulation={...check.nextIncoming};
  }
  return {ok:true,targets,absorbed:false,remaining:simulation,allowSemantic};
}

export function snapCascadeTextBoundary(boundary,rects,{floor,ceiling}){
 let cut=boundary;
 for(let attempt=0;attempt<64;attempt++){const crossing=rects.filter(r=>r.bottom<cut+.25&&r.top>cut-.25);if(!crossing.length)return cut;const next=Math.max(...crossing.map(r=>r.top))+1.5;if(next>=ceiling-.5||next<=cut+.01)throw new Error('No safe text boundary for page cascade.');cut=Math.max(floor,next);}
 throw new Error('Page cascade text boundary exceeds the safe limit.');
}
export async function snapLiveBoundary(doc,pageIndex,boundary,{floor,ceiling,left,right,inspectionBytes,rasterFlow=false,keepGroups=[]}){
 const lib=await loadPdfjs(),bytes=inspectionBytes||new Uint8Array(await doc.save({useObjectStreams:false,updateFieldAppearances:false})),task=lib.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false});
 try{const pdf=await task.promise,page=await pdf.getPage(pageIndex+1),text=await page.getTextContent(),rects=text.items.filter(item=>item.str?.trim()).map(item=>{const t=item.transform,size=Math.abs(item.height)||Math.hypot(t[2],t[3]);return {left:t[4],right:t[4]+item.width,bottom:t[5]-size*.3,top:t[5]+size*.92};}).filter(r=>r.left<right&&r.right>left);if(rasterFlow)rects.push(...(await rasterFlowProfile(page)).rows);else{const graphics=collectGraphicsBounds(await page.getOperatorList({annotationMode:lib.AnnotationMode.DISABLE}),lib.OPS);if(!graphics.ok)throw new Error(graphics.reason);rects.push(...graphics.boxes.filter(b=>b[0]<right&&b[2]>left).map(b=>({bottom:b[1],top:b[3]})));}for(const annotation of await page.getAnnotations()){const r=annotation.rect;if(r?.length===4&&r[0]<right&&r[2]>left)rects.push({bottom:Math.min(r[1],r[3]),top:Math.max(r[1],r[3])});}rects.push(...keepGroups);return snapCascadeTextBoundary(boundary,rects,{floor,ceiling});}finally{await task.destroy();}
}

async function rebuildFollowingPage(doc,pageIndex,geometry,incoming,{allowSemantic=true,flowSlices=[]}={}){
  const live=doc.getPage(pageIndex);
  const check=preflightFollowingPage(doc,pageIndex,geometry,{height:incoming.top-incoming.bottom,left:incoming.left,right:incoming.right},{allowSemantic});
  if(!check.ok)return check;
  const {g,shift,overflowNeeded,semanticSnap}=check;let outgoingBoundary=check.outgoingBoundary;if(overflowNeeded)outgoingBoundary=await snapLiveBoundary(doc,pageIndex,outgoingBoundary,{floor:g.footerTop,ceiling:g.bodyTopY,left:g.bandLeft,right:g.bandRight,rasterFlow:g.rasterFlow,keepGroups:g.keepGroups});
  const linkInfo=inspectLinks(doc,live);
  if(!linkInfo.ok)return linkInfo;
  const classified=classifyLinks(linkInfo,{bandLeft:g.bandLeft,bandRight:g.bandRight,bodyTopY:g.bodyTopY,footerTop:g.footerTop,shift,outgoingBoundary});
  if(!classified.ok)return classified;
  const inspectionBytes=new Uint8Array(await doc.save({useObjectStreams:false,updateFieldAppearances:false}));
  const graphicsSafety=await validateGraphicsFlow(inspectionBytes,pageIndex,{bandLeft:g.bandLeft,bandRight:g.bandRight,boundaries:[g.bodyTopY,outgoingBoundary,g.footerTop],rasterFlow:g.rasterFlow});
  if(!graphicsSafety.ok)return graphicsSafety;

  const {donorDoc,donorPage}=await snapshotPage(doc,pageIndex);
  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:g.bodyTopY,right:g.width,top:g.height});
  const footerSlice=await embedSlice(doc,donorPage,{left:0,bottom:0,right:g.width,top:g.footerTop});
  const bodySlice=await embedSlice(doc,donorPage,{left:g.bandLeft,bottom:outgoingBoundary,right:g.bandRight,top:g.bodyTopY});
  const leftSlice=g.bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom:g.footerTop,right:g.bandLeft,top:g.bodyTopY}):null;
  const rightSlice=g.bandRight<g.width-1?await embedSlice(doc,donorPage,{left:g.bandRight,bottom:g.footerTop,right:g.width,top:g.bodyTopY}):null;
  const incomingEmbedded=await embedSlice(doc,incoming.donorPage,{left:incoming.left,bottom:incoming.bottom,right:incoming.right,top:incoming.top});
  const incomingHeight=incoming.top-incoming.bottom;

  const replacement=doc.insertPage(pageIndex,[g.width,g.height]);
  drawSlice(replacement,topSlice,{x:0,y:g.bodyTopY,width:g.width,height:g.height-g.bodyTopY});
  drawSlice(replacement,footerSlice,{x:0,y:0,width:g.width,height:g.footerTop});
  if(leftSlice)drawSlice(replacement,leftSlice,{x:0,y:g.footerTop,width:g.bandLeft,height:g.bodyTopY-g.footerTop});
  if(rightSlice)drawSlice(replacement,rightSlice,{x:g.bandRight,y:g.footerTop,width:g.width-g.bandRight,height:g.bodyTopY-g.footerTop});
  if(bodySlice)drawSlice(replacement,bodySlice,{x:g.bandLeft,y:outgoingBoundary-shift,width:g.bandWidth,height:g.bodyTopY-outgoingBoundary});
  if(incomingEmbedded)drawSlice(replacement,incomingEmbedded,{x:incoming.left,y:g.bodyTopY-incomingHeight,width:incoming.right-incoming.left,height:incomingHeight});
  preserveLinks(doc,replacement,linkInfo,classified.links,shift);
  attachFlowAnnotations(doc,replacement,incoming.annotations,g.bodyTopY-incoming.top);
  flowSlices.push({sourcePageIndex:pageIndex,destinationPageIndex:pageIndex,left:g.bandLeft,right:g.bandRight,bottom:outgoingBoundary,top:g.bodyTopY,dy:-shift,rasterFlow:g.rasterFlow},{sourcePageIndex:incoming.sourcePageIndex,destinationPageIndex:pageIndex,left:incoming.left,right:incoming.right,bottom:incoming.bottom,top:incoming.top,dy:g.bodyTopY-incoming.top,rasterFlow:!!incoming.rasterFlow});
  doc.removePage(pageIndex+1);

  const nextBottom=overflowNeeded?g.footerTop+g.safetyGap:Math.max(g.footerTop+g.safetyGap,g.textBottomY-shift);
  const partitioned=partitionKeepGroups(g.keepGroups,{outgoingBoundary,footerTop:g.footerTop,bodyTop:g.bodyTopY,shift});
  const incomingGroups=placeIncomingKeepGroups(incoming.keepGroups||[],incoming,{bodyTopY:g.bodyTopY});
  recordRuntime(doc,pageIndex,{textBottomY:nextBottom,keepGroups:[...partitioned.stay,...incomingGroups]});
  if(!overflowNeeded){
    try{await donorDoc.destroy?.();}catch{}
    return {ok:true,done:true,shift,overflow:false,semanticSnap};
  }
  const outgoing={annotations:classified.links.filter(l=>l.zone==='OUTGOING'),rasterFlow:g.rasterFlow,sourcePageIndex:pageIndex,inspectionBytes,inspectionPageIndex:pageIndex,donorPage,left:g.bandLeft,right:g.bandRight,bottom:g.footerTop,top:outgoingBoundary,width:g.bandWidth,height:g.height,owner:donorDoc,keepGroups:partitioned.outgoing};
  return {ok:true,done:false,shift,overflow:true,outgoing,semanticSnap};
}

async function appendCarryPages(doc,incoming,{width,height,topMargin,bottomMargin,flowSlices=[]}){
  const usable=Math.max(40,height-topMargin-bottomMargin);
  let bottom=incoming.bottom,top=incoming.top,count=0;
  while(top>bottom+.5){
    let sliceBottom=Math.max(bottom,top-usable);if(sliceBottom>bottom+.5){const owner=incoming.donorPage.doc,index=incoming.inspectionPageIndex??owner?.getPages().indexOf(incoming.donorPage);if(!owner||index<0)throw new Error('Carry-page text geometry is unavailable.');sliceBottom=await snapLiveBoundary(owner,index,sliceBottom,{floor:bottom,ceiling:top,left:incoming.left,right:incoming.right,inspectionBytes:incoming.inspectionBytes,rasterFlow:incoming.rasterFlow,keepGroups:incoming.keepGroups||[]});}
    const owner=incoming.donorPage.doc,index=incoming.inspectionPageIndex??owner?.getPages().indexOf(incoming.donorPage);if(!owner||index<0)throw new Error('Carry-page graphics geometry is unavailable.');
    const graphicsBytes=incoming.inspectionBytes||new Uint8Array(await owner.save({useObjectStreams:false,updateFieldAppearances:false}));
    const graphicsSafety=await validateGraphicsFlow(graphicsBytes,index,{bandLeft:incoming.left,bandRight:incoming.right,boundaries:[sliceBottom,top],rasterFlow:incoming.rasterFlow});if(!graphicsSafety.ok)throw new Error(graphicsSafety.reason);
    const embedded=await embedSlice(doc,incoming.donorPage,{left:incoming.left,bottom:sliceBottom,right:incoming.right,top});
    const destinationPageIndex=doc.getPageCount(),page=doc.addPage([width,height]);
    flowSlices.push({sourcePageIndex:incoming.sourcePageIndex,destinationPageIndex,left:incoming.left,right:incoming.right,bottom:sliceBottom,top,dy:height-topMargin-top,rasterFlow:!!incoming.rasterFlow});
    const owned=(incoming.annotations||[]).filter(a=>a.bounds.bottom>=sliceBottom-.01&&a.bounds.top<=top+.01);if((incoming.annotations||[]).some(a=>a.bounds.bottom<sliceBottom&&a.bounds.top>sliceBottom))throw new Error('Annotation crosses a continuation-page cut.');attachFlowAnnotations(doc,page,owned,height-topMargin-top);
    const h=top-sliceBottom;
    drawSlice(page,embedded,{x:incoming.left,y:height-topMargin-h,width:incoming.right-incoming.left,height:h});
    count++;top=sliceBottom;
    if(count>16)throw Object.assign(new Error('Cascade would create too many pages.'),{code:'CASCADE_PAGE_LIMIT'});
  }
  return count;
}

function cascadePreflight(doc,{sourcePageIndex,plan,overflowBottom,overflowTop,bandLeft,bandRight}){
  if(!(overflowTop>overflowBottom))return {ok:false,reason:'NO_CASCADE_OVERFLOW'};
  const pages=Array.isArray(plan?.cascadePages)?plan.cascadePages:[];
  const incomingProbe={height:overflowTop-overflowBottom,left:bandLeft,right:bandRight};
  let preflight=preflightCascade(doc,{sourcePageIndex,pages,incoming:incomingProbe,allowSemantic:true});
  if(!preflight.ok){
    // Section grouping is an enhancement, never a reason to reject a cascade
    // that the proven line-level engine could already perform safely.
    const baseline=preflightCascade(doc,{sourcePageIndex,pages,incoming:incomingProbe,allowSemantic:false});
    if(!baseline.ok)return baseline;
    preflight=baseline;
  }
  return {...preflight,pages};
}

export function preflightCascadeOverflowIntoExistingPages(doc,args){
  return cascadePreflight(doc,args);
}

export async function cascadeOverflowIntoExistingPages(doc,{sourcePageIndex,plan,sourceDonorPage,overflowBottom,overflowTop,bandLeft,bandRight,width,height,incomingAnnotations=[]}){
  const preflight=cascadePreflight(doc,{sourcePageIndex,plan,overflowBottom,overflowTop,bandLeft,bandRight});
  if(!preflight.ok)return {applied:false,reason:preflight.reason,appendedPageCount:0,cascadedPageCount:0};
  const pages=preflight.pages||[];

  const flowSlices=[];
  let incoming={annotations:incomingAnnotations,sourcePageIndex,donorPage:sourceDonorPage,left:bandLeft,right:bandRight,bottom:overflowBottom,top:overflowTop,width:bandRight-bandLeft,height};
  let cascadedPageCount=0;
  for(const raw of pages){
    const targetIndex=Number(raw.pageIndex);if(!Number.isInteger(targetIndex)||targetIndex<=sourcePageIndex||targetIndex>=doc.getPageCount())continue;const target={raw,targetIndex};
    const result=await rebuildFollowingPage(doc,target.targetIndex,target.raw,incoming,{allowSemantic:preflight.allowSemantic!==false,flowSlices});
    if(!result.ok)return {applied:false,reason:result.reason,appendedPageCount:0,cascadedPageCount};
    cascadedPageCount++;
    if(result.done){if(incoming.owner)try{await incoming.owner.destroy?.();}catch{}return {applied:true,reason:'CASCADE_ABSORBED_BY_EXISTING_PAGE',appendedPageCount:0,cascadedPageCount,flowSlices};}
    if(incoming.owner)try{await incoming.owner.destroy?.();}catch{}
    incoming=result.outgoing;
  }

  const lastGeometry=pages.at(-1)||{};
  const appendedPageCount=await appendCarryPages(doc,incoming,{width,height,topMargin:Math.max(16,Number(lastGeometry.topMargin)||Number(plan?.topMargin)||28),bottomMargin:Math.max(8,Number(lastGeometry.bottomMargin)||Number(plan?.bottomMargin)||12),flowSlices});
  if(incoming.owner)try{await incoming.owner.destroy?.();}catch{}
  return {applied:true,reason:'CASCADE_APPENDED_AFTER_EXISTING_PAGES',appendedPageCount,cascadedPageCount,flowSlices};
}
