import { PDFDocument, PDFName } from '../core/pdf-lib.js';

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function lookup(doc,value){if(!value)return null;try{return doc.context.lookup(value);}catch{return null;}}
function arrayItem(doc,array,index){try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}try{return lookup(doc,array?.get?.(index));}catch{return null;}}
function numberValue(doc,value){const resolved=lookup(doc,value)||value;if(typeof resolved?.asNumber==='function')return resolved.asNumber();const n=Number(String(resolved));return Number.isFinite(n)?n:null;}
function rectBounds(rect){return {left:Math.min(rect[0],rect[2]),right:Math.max(rect[0],rect[2]),bottom:Math.min(rect[1],rect[3]),top:Math.max(rect[1],rect[3])};}

async function embedSlice(doc,page,{left=0,bottom=0,right,top}){if(!(top>bottom)||!(right>left))return null;return doc.embedPage(page,{left,bottom,right,top});}
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
    if(subtype!=='/Link'&&subtype!=='Link')return {ok:false,reason:'CASCADE_COMPLEX_ANNOTATION_UNSAFE'};
    if(dict.get(AP)||dict.get(QUAD_POINTS))return {ok:false,reason:'CASCADE_COMPLEX_LINK_UNSAFE'};
    const rectArray=lookup(doc,dict.get(RECT));
    if(!rectArray||typeof rectArray.size!=='function'||rectArray.size()<4)return {ok:false,reason:'CASCADE_LINK_RECT_MISSING'};
    const rect=[];
    for(let j=0;j<4;j++){const n=numberValue(doc,rectArray.get(j));if(!Number.isFinite(n))return {ok:false,reason:'CASCADE_LINK_RECT_INVALID'};rect.push(n);}
    links.push({dict,rect,bounds:rectBounds(rect)});
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
    if(b.bottom<bodyTopY-.5&&b.top>bodyTopY+.5)return {ok:false,reason:'CASCADE_LINK_CROSSES_BODY_TOP'};
    if(outgoingBoundary>footerTop+.5&&b.bottom<outgoingBoundary+.5)return {ok:false,reason:'CASCADE_LINK_WOULD_OVERFLOW'};
    if(b.bottom-shift<footerTop-1)return {ok:false,reason:'CASCADE_LINK_SHIFT_INTO_FOOTER'};
    out.push({...link,zone:'MOVED'});
  }
  return {ok:true,links:out};
}

function preserveLinks(doc,replacement,info,classified,shift){
  if(!info.raw)return;
  for(const link of classified){
    if(link.zone==='MOVED')link.dict.set(RECT,doc.context.obj([link.rect[0],link.rect[1]-shift,link.rect[2],link.rect[3]-shift]));
    if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);
  }
  replacement.node.set(ANN0TS,info.raw);
}

async function snapshotPage(doc,pageIndex){
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const donorDoc=await PDFDocument.load(bytes,{ignoreEncryption:true,updateMetadata:false});
  return {donorDoc,donorPage:donorDoc.getPage(pageIndex)};
}

function normalizedGeometry(raw,page){
  const {width,height}=page.getSize();
  if(!raw||Number(raw.rotation||0)!==0)return null;
  if(Math.abs(Number(raw.width)-width)>2||Math.abs(Number(raw.height)-height)>2)return null;
  const band=raw.contentBand||{};
  const left=clamp(Number(band.left)||0,0,width),right=clamp(Number(band.right)||width,0,width);
  if(right-left<Math.max(100,width*.25))return null;
  const topMargin=Math.max(16,Number(raw.topMargin)||28);
  const bottomMargin=Math.max(8,Number(raw.bottomMargin)||12);
  const safetyGap=Math.max(3,Number(raw.safetyGap)||4);
  const footerTop=clamp(Number(raw.footerGuardTop)||bottomMargin,bottomMargin,Math.min(height*.20,height-60));
  const textTopY=Number(raw.textTopY),textBottomY=Number(raw.textBottomY);
  if(!Number.isFinite(textTopY)||!Number.isFinite(textBottomY))return null;
  const bodyTopY=clamp(Number(raw.bodyTopY)||textTopY+safetyGap,footerTop+40,height-topMargin);
  if(!(bodyTopY>footerTop+40))return null;
  return {width,height,bandLeft:left,bandRight:right,bandWidth:right-left,topMargin,bottomMargin,safetyGap,footerTop,textTopY,textBottomY,bodyTopY};
}

async function rebuildFollowingPage(doc,pageIndex,geometry,incoming){
  const live=doc.getPage(pageIndex);
  const rotation=((live.getRotation().angle||0)%360+360)%360;
  if(rotation!==0)return {ok:false,reason:'CASCADE_ROTATED_PAGE_UNSUPPORTED'};
  const g=normalizedGeometry(geometry,live);
  if(!g)return {ok:false,reason:'CASCADE_PAGE_GEOMETRY_UNSAFE'};
  if(Math.abs(incoming.width-g.bandWidth)>Math.max(8,g.bandWidth*.08))return {ok:false,reason:'CASCADE_CONTENT_BAND_MISMATCH'};

  const incomingHeight=incoming.top-incoming.bottom;
  if(!(incomingHeight>0))return {ok:true,done:true};
  const shift=incomingHeight+g.safetyGap;
  if(shift>g.bodyTopY-g.footerTop-20)return {ok:false,reason:'CASCADE_INCOMING_TOO_TALL'};
  const movableFloor=g.footerTop+g.safetyGap;
  const overflowNeeded=g.textBottomY-shift<movableFloor;
  const outgoingBoundary=overflowNeeded?clamp(shift+movableFloor,g.footerTop,g.bodyTopY):g.footerTop;

  const linkInfo=inspectLinks(doc,live);
  if(!linkInfo.ok)return {ok:false,reason:linkInfo.reason};
  const classified=classifyLinks(linkInfo,{bandLeft:g.bandLeft,bandRight:g.bandRight,bodyTopY:g.bodyTopY,footerTop:g.footerTop,shift,outgoingBoundary});
  if(!classified.ok)return {ok:false,reason:classified.reason};

  const {donorDoc,donorPage}=await snapshotPage(doc,pageIndex);
  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:g.bodyTopY,right:g.width,top:g.height});
  const footerSlice=await embedSlice(doc,donorPage,{left:0,bottom:0,right:g.width,top:g.footerTop});
  const bodySlice=await embedSlice(doc,donorPage,{left:g.bandLeft,bottom:outgoingBoundary,right:g.bandRight,top:g.bodyTopY});
  const leftSlice=g.bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom:g.footerTop,right:g.bandLeft,top:g.bodyTopY}):null;
  const rightSlice=g.bandRight<g.width-1?await embedSlice(doc,donorPage,{left:g.bandRight,bottom:g.footerTop,right:g.width,top:g.bodyTopY}):null;
  const incomingEmbedded=await embedSlice(doc,incoming.donorPage,{left:incoming.left,bottom:incoming.bottom,right:incoming.right,top:incoming.top});

  const replacement=doc.insertPage(pageIndex,[g.width,g.height]);
  drawSlice(replacement,topSlice,{x:0,y:g.bodyTopY,width:g.width,height:g.height-g.bodyTopY});
  drawSlice(replacement,footerSlice,{x:0,y:0,width:g.width,height:g.footerTop});
  if(leftSlice)drawSlice(replacement,leftSlice,{x:0,y:g.footerTop,width:g.bandLeft,height:g.bodyTopY-g.footerTop});
  if(rightSlice)drawSlice(replacement,rightSlice,{x:g.bandRight,y:g.footerTop,width:g.width-g.bandRight,height:g.bodyTopY-g.footerTop});
  if(bodySlice)drawSlice(replacement,bodySlice,{x:g.bandLeft,y:outgoingBoundary-shift,width:g.bandWidth,height:g.bodyTopY-outgoingBoundary});
  if(incomingEmbedded)drawSlice(replacement,incomingEmbedded,{x:g.bandLeft,y:g.bodyTopY-incomingHeight,width:g.bandWidth,height:incomingHeight});
  preserveLinks(doc,replacement,linkInfo,classified.links,shift);
  doc.removePage(pageIndex+1);

  if(!overflowNeeded){
    try{await donorDoc.destroy?.();}catch{}
    return {ok:true,done:true,shift,overflow:false};
  }

  const outgoing={donorPage,left:g.bandLeft,right:g.bandRight,bottom:g.footerTop,top:outgoingBoundary,width:g.bandWidth,height:g.height,owner:donorDoc};
  return {ok:true,done:false,shift,overflow:true,outgoing};
}

async function appendCarryPages(doc,incoming,{width,height,bandLeft,bandRight,topMargin,bottomMargin}){
  const usable=Math.max(40,height-topMargin-bottomMargin);
  let bottom=incoming.bottom,top=incoming.top,count=0;
  while(top>bottom+.5){
    const sliceBottom=Math.max(bottom,top-usable);
    const embedded=await embedSlice(doc,incoming.donorPage,{left:incoming.left,bottom:sliceBottom,right:incoming.right,top});
    const page=doc.addPage([width,height]);
    const h=top-sliceBottom;
    drawSlice(page,embedded,{x:bandLeft,y:height-topMargin-h,width:bandRight-bandLeft,height:h});
    count++;top=sliceBottom;
    if(count>16)throw Object.assign(new Error('Cascade would create too many pages.'),{code:'CASCADE_PAGE_LIMIT'});
  }
  return count;
}

export async function cascadeOverflowIntoExistingPages(doc,{sourcePageIndex,plan,sourceDonorPage,overflowBottom,overflowTop,bandLeft,bandRight,width,height}){
  if(!(overflowTop>overflowBottom))return {applied:false,reason:'NO_CASCADE_OVERFLOW',appendedPageCount:0,cascadedPageCount:0};
  const pages=Array.isArray(plan?.cascadePages)?plan.cascadePages:[];
  let incoming={donorPage:sourceDonorPage,left:bandLeft,right:bandRight,bottom:overflowBottom,top:overflowTop,width:bandRight-bandLeft,height};
  let cascadedPageCount=0;

  for(const raw of pages){
    const targetIndex=Number(raw.pageIndex);
    if(!Number.isInteger(targetIndex)||targetIndex<=sourcePageIndex||targetIndex>=doc.getPageCount())continue;
    const result=await rebuildFollowingPage(doc,targetIndex,raw,incoming);
    if(!result.ok)return {applied:false,reason:result.reason,appendedPageCount:0,cascadedPageCount};
    cascadedPageCount++;
    if(result.done)return {applied:true,reason:'CASCADE_ABSORBED_BY_EXISTING_PAGE',appendedPageCount:0,cascadedPageCount};
    if(incoming.owner)try{await incoming.owner.destroy?.();}catch{}
    incoming=result.outgoing;
  }

  const lastGeometry=pages.at(-1)||{};
  const appendedPageCount=await appendCarryPages(doc,incoming,{
    width,height,
    bandLeft:Number(lastGeometry.contentBand?.left??bandLeft),
    bandRight:Number(lastGeometry.contentBand?.right??bandRight),
    topMargin:Math.max(16,Number(lastGeometry.topMargin)||Number(plan?.topMargin)||28),
    bottomMargin:Math.max(8,Number(lastGeometry.bottomMargin)||Number(plan?.bottomMargin)||12),
  });
  if(incoming.owner)try{await incoming.owner.destroy?.();}catch{}
  return {applied:true,reason:'CASCADE_APPENDED_AFTER_EXISTING_PAGES',appendedPageCount,cascadedPageCount};
}
