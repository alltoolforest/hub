import { PDFDocument, PDFName } from '../core/pdf-lib.js';
import { loadPdfjs } from '../rendering/pdfjs.js';
import { validateRoundTrip } from './roundtrip-validator.js';

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}
function copyBytes(bytes){return bytes instanceof Uint8Array?new Uint8Array(bytes):new Uint8Array(bytes||0);}
function blockRect(block){
  const b=block?.bounds;
  if(!b)return null;
  const left=Number(b.x),bottom=Number(b.y),width=Number(b.width),height=Number(b.height);
  if(![left,bottom,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left,right:left+width,bottom,top:bottom+height,width,height};
}
function blockBaseline(block){
  const line=block?.lines?.[0];
  const y=Number(line?.y);
  if(Number.isFinite(y))return y;
  const rect=blockRect(block);
  return rect?rect.bottom+Math.max(1,Number(block?.fontSize)||12)*.24:null;
}
function txNeedsCompaction(tx){
  return tx?.kind==='REPLACE_TEXT'&&!!tx?.block&&String(tx?.originalUnicode??tx?.block?.text??'').trim().length>0&&String(tx?.replacementUnicode??'').trim().length===0;
}
function lookup(doc,value){if(!value)return null;try{return doc.context.lookup(value);}catch{return null;}}
function arrayItem(doc,array,index){try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}try{return lookup(doc,array?.get?.(index));}catch{return null;}}
function numberValue(doc,value){const resolved=lookup(doc,value)||value;if(typeof resolved?.asNumber==='function')return resolved.asNumber();const n=Number(String(resolved));return Number.isFinite(n)?n:null;}
function rectBounds(rect){return {left:Math.min(rect[0],rect[2]),right:Math.max(rect[0],rect[2]),bottom:Math.min(rect[1],rect[3]),top:Math.max(rect[1],rect[3])};}

function textRect(item){
  const tr=item?.transform||[];
  const left=Number(tr[4]),baseline=Number(tr[5]);
  const fontSize=Math.max(1,Math.abs(Number(item?.height))||Math.hypot(Number(tr[2])||0,Number(tr[3])||0)||Math.hypot(Number(tr[0])||0,Number(tr[1])||0)||10);
  const width=Math.abs(Number(item?.width))||Math.max(1,String(item?.str||'').length*fontSize*.45);
  if(![left,baseline,fontSize,width].every(Number.isFinite)||width<=0)return null;
  const descent=Math.max(1.5,fontSize*.24),ascent=Math.max(2,fontSize*.86);
  return {left,right:left+width,bottom:baseline-descent,top:baseline+ascent,baseline,width,height:ascent+descent,fontSize,text:String(item?.str||'')};
}
function lineGroups(items,fontSize){
  const rects=(items||[]).map(textRect).filter(r=>r&&r.text.trim());
  const tolerance=Math.max(1.8,fontSize*.22);
  const lines=[];
  for(const rect of rects.sort((a,b)=>b.baseline-a.baseline||a.left-b.left)){
    let line=lines.find(entry=>Math.abs(entry.baseline-rect.baseline)<=tolerance);
    if(!line){line={baseline:rect.baseline,left:rect.left,right:rect.right,bottom:rect.bottom,top:rect.top,rects:[]};lines.push(line);}
    line.rects.push(rect);line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);line.bottom=Math.min(line.bottom,rect.bottom);line.top=Math.max(line.top,rect.top);
  }
  return lines.sort((a,b)=>b.baseline-a.baseline);
}
function sameLane(line,source,pageWidth,fontSize){
  const direct=overlap(line.left,line.right,source.left,source.right)>Math.min(8,Math.max(1,source.width)*.15);
  if(direct)return true;
  const leftDelta=Math.abs(line.left-source.left);
  return source.left<=pageWidth*.30&&leftDelta<=Math.max(24,fontSize*2.2);
}
function separatedFooterTop(lines,{pageHeight,fontSize,bottomMargin}){
  const low=lines.filter(line=>line.top<=pageHeight*.20).sort((a,b)=>a.bottom-b.bottom);
  if(!low.length)return bottomMargin;
  let clusterTop=low[0].top;
  const minGap=Math.max(42,pageHeight*.05,fontSize*3.8);
  for(let i=1;i<low.length;i++){
    const line=low[i];
    const gap=line.bottom-clusterTop;
    if(gap>=minGap&&clusterTop<=pageHeight*.16){
      return clamp(clusterTop+Math.max(5,fontSize*.45),bottomMargin,pageHeight*.18);
    }
    clusterTop=Math.max(clusterTop,line.top);
  }
  return bottomMargin;
}
function inferGeometry(lines,tx,{width,height}){
  const source=blockRect(tx.block);
  if(!source)return {ok:false,reason:'COMPACTION_SOURCE_GEOMETRY_MISSING'};
  const fontSize=Math.max(6,Number(tx.block?.lines?.[0]?.fontSize||tx.block?.fontSize)||12);
  const baseline=blockBaseline(tx.block);
  if(!Number.isFinite(baseline))return {ok:false,reason:'COMPACTION_SOURCE_BASELINE_MISSING'};
  if(Number(tx.block?.pageRotation||0)!==0)return {ok:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED'};

  const downstream=lines.filter(line=>line.baseline<baseline-fontSize*.30);
  const laneLines=downstream.filter(line=>sameLane(line,source,width,fontSize));
  if(!laneLines.length)return {ok:false,reason:'NO_CONTENT_BELOW_DELETED_LINE'};
  const nearest=laneLines[0];
  const rawPitch=baseline-nearest.baseline;
  const fallbackPitch=Math.max(fontSize,fontSize*1.20);
  const pitch=rawPitch>=fontSize*.72&&rawPitch<=fontSize*2.6?rawPitch:fallbackPitch;

  const sourceWide=source.width>=width*.42;
  if(!sourceWide){
    const farRight=downstream.filter(line=>line.left>width*.54&&line.right-line.left>width*.15);
    const leftColumn=downstream.filter(line=>line.left<width*.46&&line.right<width*.66);
    if(farRight.length>=2&&leftColumn.length>=2)return {ok:false,reason:'MULTI_COLUMN_COMPACTION_UNSAFE'};
  }

  const pad=Math.max(10,fontSize*.85);
  const rightMargin=Math.max(18,width*.045);
  let bandLeft=clamp(Math.min(source.left,nearest.left)-pad,0,width);
  let bandRight;
  if(sourceWide||source.left<=width*.30){
    const related=laneLines.filter(line=>line.baseline<=nearest.baseline+.5);
    const relatedRight=Math.max(source.right,nearest.right,...related.slice(0,18).map(line=>line.right));
    bandRight=clamp(Math.max(relatedRight+pad,width-rightMargin),bandLeft+60,width);
  }else{
    bandRight=clamp(Math.max(source.right,nearest.right)+pad,bandLeft+60,width);
  }
  if(bandRight-bandLeft<Math.max(100,width*.24))return {ok:false,reason:'COMPACTION_CONTENT_BAND_UNSAFE'};

  const cutPad=Math.max(.8,Math.min(2,fontSize*.10));
  const cutY=clamp(nearest.top+cutPad,2,height-2);
  const maxIntoDeletedLine=Math.max(0,source.top-cutY-1);
  const shiftY=Math.min(pitch,maxIntoDeletedLine);
  if(shiftY<Math.max(2,fontSize*.35))return {ok:false,reason:'COMPACTION_RELEASED_SPACE_TOO_SMALL'};
  if(shiftY>height*.18)return {ok:false,reason:'COMPACTION_SHIFT_TOO_LARGE'};

  const bottomMargin=Math.max(10,fontSize*.75);
  const footerGuardTop=separatedFooterTop(lines,{pageHeight:height,fontSize,bottomMargin});
  const movable=laneLines.filter(line=>line.top<=cutY+.75&&line.top>footerGuardTop+.25&&overlap(line.left,line.right,bandLeft,bandRight)>Math.min(8,(line.right-line.left)*.2));
  if(!movable.length)return {ok:false,reason:'NO_MOVABLE_CONTENT_ABOVE_FOOTER'};

  return {ok:true,source,fontSize,baseline,nearest,pitch,shiftY,cutY,bandLeft,bandRight,bandWidth:bandRight-bandLeft,footerGuardTop,bottomMargin,movable};
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
  if(right<=bandLeft+.5||left>=bandRight-.5)return 'STATIC';
  if((left<bandLeft-.5&&right>bandLeft+.5)||(left<bandRight-.5&&right>bandRight+.5))return 'CROSSES_BAND';
  if(bottom<cutY-.5&&top>cutY+.5)return ((bottom+top)/2<=cutY?'MOVED':'STATIC');
  if(top<=cutY+.5)return 'MOVED';
  return 'STATIC';
}
function validateLinks(annotationInfo,geometry,pageHeight){
  const links=[];
  for(const link of annotationInfo.links){
    const zone=classifyLink(link,geometry);
    if(zone==='CROSSES_FOOTER')return {ok:false,reason:'LINK_CROSSES_FOOTER_GUARD'};
    if(zone==='CROSSES_BAND')return {ok:false,reason:'LINK_CROSSES_CONTENT_BAND'};
    if(zone==='MOVED'&&link.bounds.top+geometry.shiftY>pageHeight-1)return {ok:false,reason:'LINK_COMPACTION_OUT_OF_PAGE'};
    links.push({...link,zone});
  }
  return {ok:true,links};
}
function preserveAndMoveLinks(doc,replacement,annotationInfo,links,shiftY){
  if(!annotationInfo.raw)return;
  for(const link of links){
    if(link.zone==='MOVED')link.dict.set(RECT,doc.context.obj([link.rect[0],link.rect[1]+shiftY,link.rect[2],link.rect[3]+shiftY]));
    if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);
  }
  replacement.node.set(ANN0TS,annotationInfo.raw);
}
function crossesBoundary(bottom,top,boundary,tolerance=1){return Number.isFinite(boundary)&&bottom<boundary-tolerance&&top>boundary+tolerance;}
async function validateVectorCut(bytes,pageIndex,{cutY,bandLeft,bandRight}){
  try{
    const p=await loadPdfjs();
    const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
    const pdf=await task.promise;
    const page=await pdf.getPage(pageIndex+1);
    const operators=await page.getOperatorList();
    const dangerous=[];
    for(let i=0;i<operators.fnArray.length;i++){
      if(operators.fnArray[i]!==p.OPS.constructPath)continue;
      const raw=operators.argsArray[i]?.[2];if(!raw)continue;
      const left=Number(raw[0]),bottom=Number(raw[1]),right=Number(raw[2]),top=Number(raw[3]);
      if(![left,bottom,right,top].every(Number.isFinite))continue;
      const x0=Math.min(left,right),x1=Math.max(left,right),y0=Math.min(bottom,top),y1=Math.max(bottom,top);
      const w=x1-x0,h=y1-y0,hOverlap=overlap(x0,x1,bandLeft,bandRight),bandWidth=Math.max(1,bandRight-bandLeft);
      const vertical=w<=2.5&&h>=10&&((x0+x1)/2)>=bandLeft-1&&((x0+x1)/2)<=bandRight+1;
      const horizontal=h<=2.5&&w>=12&&hOverlap>=8;
      const cell=w>=8&&h>=6&&w<=bandWidth*.92&&h<=180&&hOverlap>=Math.min(8,w*.20);
      const unsafe=(vertical&&crossesBoundary(y0,y1,cutY))||(horizontal&&Math.abs((y0+y1)/2-cutY)<=1.25)||(cell&&cutY>y0+.35&&cutY<y1-.35);
      if(unsafe){dangerous.push({left:x0,right:x1,bottom:y0,top:y1,kind:vertical?'VERTICAL':(horizontal?'HORIZONTAL':'CELL')});if(dangerous.length>=8)break;}
    }
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
    if(dangerous.length)return {ok:false,reason:'STRUCTURED_VECTOR_REFLOW_UNSAFE',boundaries:dangerous};
    return {ok:true,boundaries:[]};
  }catch(error){return {ok:false,reason:'VECTOR_REFLOW_PREFLIGHT_FAILED',error:String(error)};}
}
async function textLinesForPage(bytes,pageIndex,fontSize){
  const p=await loadPdfjs();
  const task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true});
  const pdf=await task.promise;
  try{
    const page=await pdf.getPage(pageIndex+1);
    const tc=await page.getTextContent();
    return lineGroups(tc.items,fontSize);
  }finally{
    try{await pdf.destroy?.();}catch{}
    try{await task.destroy?.();}catch{}
  }
}
async function embedSlice(destDoc,donorPage,{left=0,bottom=0,right,top}){if(!(top>bottom)||!(right>left))return null;return destDoc.embedPage(donorPage,{left,bottom,right,top});}
function drawSlice(page,embedded,{x=0,y=0,width,height}){if(embedded)page.drawPage(embedded,{x,y,width,height});}

async function applyOneCompaction(doc,tx,{sequenceIndex=0}={}){
  const pageIndex=Number(tx.pageIndex);
  if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())return {applied:false,reason:'COMPACTION_PAGE_MISSING'};
  const page=doc.getPage(pageIndex);
  const rotation=((page.getRotation().angle||0)%360+360)%360;
  if(rotation!==0)return {applied:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED'};
  const {width,height}=page.getSize();
  const annotationInfo=inspectAnnotations(doc,page);
  if(!annotationInfo.ok)return {applied:false,reason:annotationInfo.reason};

  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const lines=await textLinesForPage(donorBytes,pageIndex,Math.max(6,Number(tx.block?.fontSize)||12));
  const geometry=inferGeometry(lines,tx,{width,height});
  if(!geometry.ok)return {applied:false,reason:geometry.reason};
  const linkSafety=validateLinks(annotationInfo,geometry,height);
  if(!linkSafety.ok)return {applied:false,reason:linkSafety.reason};
  const vectorSafety=await validateVectorCut(donorBytes,pageIndex,geometry);
  if(!vectorSafety.ok)return {applied:false,reason:vectorSafety.reason,vectorSafety};

  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false});
  const donorPage=donorDoc.getPage(pageIndex);
  const {cutY,bandLeft,bandRight,bandWidth,footerGuardTop,shiftY}=geometry;
  const topSlice=await embedSlice(doc,donorPage,{left:0,bottom:cutY,right:width,top:height});
  const footerSlice=footerGuardTop>.5?await embedSlice(doc,donorPage,{left:0,bottom:0,right:width,top:footerGuardTop}):null;
  const movableSlice=await embedSlice(doc,donorPage,{left:bandLeft,bottom:footerGuardTop,right:bandRight,top:cutY});
  const leftStatic=bandLeft>1?await embedSlice(doc,donorPage,{left:0,bottom:footerGuardTop,right:bandLeft,top:cutY}):null;
  const rightStatic=bandRight<width-1?await embedSlice(doc,donorPage,{left:bandRight,bottom:footerGuardTop,right:width,top:cutY}):null;

  const replacement=doc.insertPage(pageIndex,[width,height]);
  if(topSlice)drawSlice(replacement,topSlice,{x:0,y:cutY,width,height:height-cutY});
  if(footerSlice)drawSlice(replacement,footerSlice,{x:0,y:0,width,height:footerGuardTop});
  if(leftStatic)drawSlice(replacement,leftStatic,{x:0,y:footerGuardTop,width:bandLeft,height:cutY-footerGuardTop});
  if(rightStatic)drawSlice(replacement,rightStatic,{x:bandRight,y:footerGuardTop,width:width-bandRight,height:cutY-footerGuardTop});
  if(movableSlice)drawSlice(replacement,movableSlice,{x:bandLeft,y:footerGuardTop+shiftY,width:bandWidth,height:cutY-footerGuardTop});
  preserveAndMoveLinks(doc,replacement,annotationInfo,linkSafety.links,shiftY);
  doc.removePage(pageIndex+1);

  return {
    applied:true,
    metric:{
      transactionId:tx.id,pageIndex,sequenceIndex,direction:'UP',mode:'SAME_PAGE_UPWARD_COMPACTION',
      cutY,shiftY,delta:0,footerGuardTop,bandLeft,bandRight,bandWidth,
      preservedLinkCount:annotationInfo.links.length,cascadedPageCount:0,appendedPageCount:0,overflowPageCount:0,
    },
  };
}

function finalChecks(transactions=[]){
  return transactions.map(tx=>tx?.kind==='INSERT_TEXT'?{
    kind:'insert',pageIndex:Number(tx.pageIndex),newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),oldText:'',
  }:{
    kind:'replace',pageIndex:Number(tx.pageIndex),newText:String(tx?.replacementUnicode||'').replace(/\n/g,' '),oldText:String(tx?.originalUnicode||'').replace(/\n/g,' '),
  }).filter(check=>Number.isInteger(check.pageIndex)&&check.pageIndex>=0);
}

/**
 * Post-process Fortress output only for deletion/shrink transactions that empty
 * an existing visual PDF line. This intentionally remains separate from the
 * mature downward overflow engine until the inverse behavior has its own real-
 * PDF regression history.
 */
export async function applyUpwardCompaction(result,transactions,{preview=false}={}){
  const candidates=(transactions||[]).filter(txNeedsCompaction);
  if(!candidates.length)return result;
  if((result?.reflowMetrics||[]).some(metric=>Number(metric?.cascadedPageCount)>0||Number(metric?.appendedPageCount)>0||Number(metric?.overflowPageCount)>0)){
    throw Object.assign(new Error('Upward compaction is not combined with cross-page reflow in this safety phase.'),{code:'COMPACTION_WITH_PAGE_CASCADE_UNSUPPORTED'});
  }
  const candidatePages=new Set(candidates.map(tx=>Number(tx.pageIndex)));
  if((transactions||[]).some(tx=>tx?.kind==='INSERT_TEXT'&&candidatePages.has(Number(tx.pageIndex)))){
    throw Object.assign(new Error('Finish line deletion compaction before adding new text on the same page.'),{code:'COMPACTION_WITH_INSERT_SAME_PAGE_UNSUPPORTED'});
  }

  const doc=await PDFDocument.load(copyBytes(result.bytes),{ignoreEncryption:true,updateMetadata:false});
  const metrics=[...(result?.reflowMetrics||[])];
  const warnings=[...(result?.warnings||[])];
  const ordered=[...candidates].sort((a,b)=>Number(a.pageIndex)-Number(b.pageIndex)||(Number(a.block?.bounds?.y)||0)-(Number(b.block?.bounds?.y)||0));
  for(let i=0;i<ordered.length;i++){
    const tx=ordered[i];
    const applied=await applyOneCompaction(doc,tx,{sequenceIndex:(transactions||[]).findIndex(item=>item?.id===tx.id)});
    if(!applied.applied){
      if(applied.reason==='NO_CONTENT_BELOW_DELETED_LINE')continue;
      throw Object.assign(new Error('The deleted line cannot be compacted upward without risking layout damage.'),{code:applied.reason||'UPWARD_COMPACTION_UNSAFE',compaction:applied});
    }
    metrics.push(applied.metric);
    warnings.push({code:'LAYOUT_COMPACTED_UPWARD',pageIndex:Number(tx.pageIndex),transactionId:tx.id,shiftY:applied.metric.shiftY,message:'Content below the deleted line moved upward to close the released space.'});
  }

  if(metrics.length===(result?.reflowMetrics||[]).length)return result;
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  let validation=result?.validation||null;
  if(!preview){
    validation=await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks:finalChecks(transactions)});
    if(!validation.ok)throw Object.assign(new Error('Upward-compacted PDF failed final validation.'),{code:'UPWARD_COMPACTION_VALIDATION_FAILED',validation});
  }
  return {
    ...result,
    bytes,
    blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):result?.blob||null,
    validation,
    warnings,
    reflowMetrics:metrics,
  };
}
