import { PDFDocument, PDFName } from '../core/pdf-lib.js';
import { loadPdfjs } from '../rendering/pdfjs.js';
import { validateRoundTrip } from './roundtrip-validator.js';

const ANN0TS=PDFName.of('Annots');
const SUBTYPE=PDFName.of('Subtype');
const RECT=PDFName.of('Rect');
const AP=PDFName.of('AP');
const QUAD_POINTS=PDFName.of('QuadPoints');
const PAGE=PDFName.of('P');

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function overlap(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1));}
function copyBytes(bytes){return bytes instanceof Uint8Array?new Uint8Array(bytes):new Uint8Array(bytes||0);}
function blockRect(block){const b=block?.bounds;if(!b)return null;const left=Number(b.x),bottom=Number(b.y),width=Number(b.width),height=Number(b.height);if(![left,bottom,width,height].every(Number.isFinite)||width<=0||height<=0)return null;return {left,right:left+width,bottom,top:bottom+height,width,height};}
function blockBaseline(block){const y=Number(block?.lines?.[0]?.y);if(Number.isFinite(y))return y;const r=blockRect(block);return r?r.bottom+Math.max(1,Number(block?.fontSize)||12)*.24:null;}
function needsCompaction(tx){return tx?.kind==='REPLACE_TEXT'&&!!tx?.block&&String(tx?.originalUnicode??tx?.block?.text??'').trim().length>0&&String(tx?.replacementUnicode??'').trim().length===0;}

function textRect(item){
  const tr=item?.transform||[],left=Number(tr[4]),baseline=Number(tr[5]);
  const fontSize=Math.max(1,Math.abs(Number(item?.height))||Math.hypot(Number(tr[2])||0,Number(tr[3])||0)||Math.hypot(Number(tr[0])||0,Number(tr[1])||0)||10);
  const width=Math.abs(Number(item?.width))||Math.max(1,String(item?.str||'').length*fontSize*.45);
  if(![left,baseline,fontSize,width].every(Number.isFinite)||width<=0)return null;
  const descent=Math.max(1.5,fontSize*.24),ascent=Math.max(2,fontSize*.86);
  return {left,right:left+width,bottom:baseline-descent,top:baseline+ascent,baseline,width,fontSize,fontName:item?.fontName||null,text:String(item?.str||'')};
}
function lineGroups(items,fontSize){
  const rects=(items||[]).map(textRect).filter(r=>r&&r.text.trim()),tolerance=Math.max(1.8,fontSize*.22),lines=[];
  for(const rect of rects.sort((a,b)=>b.baseline-a.baseline||a.left-b.left)){
    let line=lines.find(entry=>Math.abs(entry.baseline-rect.baseline)<=tolerance);
    if(!line){line={baseline:rect.baseline,left:rect.left,right:rect.right,bottom:rect.bottom,top:rect.top,fontSize:rect.fontSize,fontNames:new Set(),rects:[]};lines.push(line);}
    line.rects.push(rect);if(rect.fontName)line.fontNames.add(rect.fontName);
    line.left=Math.min(line.left,rect.left);line.right=Math.max(line.right,rect.right);line.bottom=Math.min(line.bottom,rect.bottom);line.top=Math.max(line.top,rect.top);line.fontSize=Math.max(line.fontSize,rect.fontSize);
  }
  return lines.sort((a,b)=>b.baseline-a.baseline);
}
function sameLane(line,source,pageWidth,fontSize){if(overlap(line.left,line.right,source.left,source.right)>Math.min(8,Math.max(1,source.width)*.15))return true;return source.left<=pageWidth*.30&&Math.abs(line.left-source.left)<=Math.max(24,fontSize*2.2);}
function sourceLinePitch(lines,tx,source,{width,fontSize,baseline}){
  const sourceFont=tx?.block?.lines?.[0]?.fontName||tx?.block?.fontName||null,candidates=[];
  for(const line of lines){
    if(!sameLane(line,source,width,fontSize))continue;
    if(sourceFont&&line.fontNames?.size&&!line.fontNames.has(sourceFont))continue;
    if(Math.abs(Number(line.fontSize)-fontSize)>Math.max(1.1,fontSize*.16))continue;
    const gap=Math.abs(baseline-line.baseline);
    if(gap>=fontSize*.72&&gap<=fontSize*2.6)candidates.push(gap);
  }
  candidates.sort((a,b)=>a-b);return candidates[0]||Math.max(fontSize,fontSize*1.20);
}
function footerGuardTop(lines,{pageHeight,fontSize,bottomMargin}){
  const low=lines.filter(line=>line.top<=pageHeight*.20).sort((a,b)=>a.bottom-b.bottom);if(!low.length)return bottomMargin;
  let clusterTop=low[0].top;const minGap=Math.max(42,pageHeight*.05,fontSize*3.8);
  for(let i=1;i<low.length;i++){const line=low[i],gap=line.bottom-clusterTop;if(gap>=minGap&&clusterTop<=pageHeight*.16)return clamp(clusterTop+Math.max(5,fontSize*.45),bottomMargin,pageHeight*.18);clusterTop=Math.max(clusterTop,line.top);}
  return bottomMargin;
}
function inferGeometry(lines,tx,{width,height}){
  const source=blockRect(tx.block);if(!source)return {ok:false,reason:'COMPACTION_SOURCE_GEOMETRY_MISSING'};
  const fontSize=Math.max(6,Number(tx.block?.lines?.[0]?.fontSize||tx.block?.fontSize)||12),baseline=blockBaseline(tx.block);
  if(!Number.isFinite(baseline))return {ok:false,reason:'COMPACTION_SOURCE_BASELINE_MISSING'};
  if(Number(tx.block?.pageRotation||0)!==0)return {ok:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED'};
  const downstream=lines.filter(line=>line.baseline<baseline-fontSize*.30),laneLines=downstream.filter(line=>sameLane(line,source,width,fontSize));
  if(!laneLines.length)return {ok:false,reason:'NO_CONTENT_BELOW_DELETED_LINE'};
  const nearest=laneLines[0],pitch=sourceLinePitch(lines,tx,source,{width,fontSize,baseline});

  const sourceWide=source.width>=width*.42;
  if(!sourceWide){const farRight=downstream.filter(line=>line.left>width*.54&&line.right-line.left>width*.15),leftColumn=downstream.filter(line=>line.left<width*.46&&line.right<width*.66);if(farRight.length>=2&&leftColumn.length>=2)return {ok:false,reason:'MULTI_COLUMN_COMPACTION_UNSAFE'};}

  const pad=Math.max(10,fontSize*.85),rightMargin=Math.max(18,width*.045);
  const related=laneLines.filter(line=>line.baseline<=nearest.baseline+.5).slice(0,32);
  // Use the full related visual lane, not only the text's starting x. This
  // captures bullet markers and table/list edges that belong to the same body.
  const relatedLeft=Math.min(source.left,nearest.left,...related.map(line=>line.left));
  const relatedRight=Math.max(source.right,nearest.right,...related.map(line=>line.right));
  const bandLeft=clamp(relatedLeft-pad,0,width);
  const bandRight=clamp(sourceWide||source.left<=width*.30?Math.max(relatedRight+pad,width-rightMargin):relatedRight+pad,bandLeft+60,width);
  if(bandRight-bandLeft<Math.max(100,width*.24))return {ok:false,reason:'COMPACTION_CONTENT_BAND_UNSAFE'};

  const cutPad=Math.max(.8,Math.min(2,fontSize*.10)),cutY=clamp(nearest.top+cutPad,2,height-2);
  const maxSafeShift=Math.max(0,source.top-nearest.top+.5),shiftY=Math.min(pitch,maxSafeShift);
  if(shiftY<Math.max(2,fontSize*.35))return {ok:false,reason:'COMPACTION_RELEASED_SPACE_TOO_SMALL'};
  if(shiftY>height*.18)return {ok:false,reason:'COMPACTION_SHIFT_TOO_LARGE'};
  const bottomMargin=Math.max(10,fontSize*.75),footerTop=footerGuardTop(lines,{pageHeight:height,fontSize,bottomMargin});
  const movable=laneLines.filter(line=>line.top<=cutY+.75&&line.top>footerTop+.25&&overlap(line.left,line.right,bandLeft,bandRight)>Math.min(8,(line.right-line.left)*.2));
  if(!movable.length)return {ok:false,reason:'NO_MOVABLE_CONTENT_ABOVE_FOOTER'};
  return {ok:true,source,fontSize,baseline,nearest,pitch,shiftY,cutY,bandLeft,bandRight,bandWidth:bandRight-bandLeft,footerGuardTop:footerTop,bottomMargin};
}

function lookup(doc,value){if(!value)return null;try{return doc.context.lookup(value);}catch{return null;}}
function arrayItem(doc,array,index){try{if(typeof array?.lookup==='function')return array.lookup(index);}catch{}try{return lookup(doc,array?.get?.(index));}catch{return null;}}
function numberValue(doc,value){const resolved=lookup(doc,value)||value;if(typeof resolved?.asNumber==='function')return resolved.asNumber();const n=Number(String(resolved));return Number.isFinite(n)?n:null;}
function rectBounds(rect){return {left:Math.min(rect[0],rect[2]),right:Math.max(rect[0],rect[2]),bottom:Math.min(rect[1],rect[3]),top:Math.max(rect[1],rect[3])};}
function inspectAnnotations(doc,page){
  const raw=page?.node?.get?.(ANN0TS);if(!raw)return {ok:true,raw:null,links:[]};
  const array=lookup(doc,raw);if(!array||typeof array.size!=='function'||typeof array.get!=='function')return {ok:false,reason:'ANNOTATION_ARRAY_UNREADABLE'};
  const links=[];
  for(let i=0;i<array.size();i++){
    const dict=arrayItem(doc,array,i);if(!dict||typeof dict.get!=='function'||typeof dict.set!=='function')return {ok:false,reason:'ANNOTATION_DICTIONARY_UNREADABLE'};
    const subtype=String(dict.get(SUBTYPE)||'');if(subtype!=='/Link'&&subtype!=='Link')return {ok:false,reason:'COMPLEX_ANNOTATION_REFLOW_UNSAFE'};
    if(dict.get(AP)||dict.get(QUAD_POINTS))return {ok:false,reason:'COMPLEX_LINK_GEOMETRY_REFLOW_UNSAFE'};
    const arr=lookup(doc,dict.get(RECT));if(!arr||typeof arr.size!=='function'||arr.size()<4)return {ok:false,reason:'LINK_RECTANGLE_MISSING'};
    const rect=[];for(let j=0;j<4;j++){const value=numberValue(doc,arr.get(j));if(!Number.isFinite(value))return {ok:false,reason:'LINK_RECTANGLE_INVALID'};rect.push(value);}links.push({dict,rect,bounds:rectBounds(rect)});
  }
  return {ok:true,raw,links};
}
function classifyLink(link,g){const {left,right,bottom,top}=link.bounds;if(top<=g.footerGuardTop+.5)return 'STATIC_FOOTER';if(bottom<g.footerGuardTop-.5&&top>g.footerGuardTop+.5)return 'CROSSES_FOOTER';if(right<=g.bandLeft+.5||left>=g.bandRight-.5)return 'STATIC';if((left<g.bandLeft-.5&&right>g.bandLeft+.5)||(left<g.bandRight-.5&&right>g.bandRight+.5))return 'CROSSES_BAND';if(bottom<g.cutY-.5&&top>g.cutY+.5)return ((bottom+top)/2<=g.cutY?'MOVED':'STATIC');if(top<=g.cutY+.5)return 'MOVED';return 'STATIC';}
function validateLinks(info,g,pageHeight){const links=[];for(const link of info.links){const zone=classifyLink(link,g);if(zone==='CROSSES_FOOTER')return {ok:false,reason:'LINK_CROSSES_FOOTER_GUARD'};if(zone==='CROSSES_BAND')return {ok:false,reason:'LINK_CROSSES_CONTENT_BAND'};if(zone==='MOVED'&&link.bounds.top+g.shiftY>pageHeight-1)return {ok:false,reason:'LINK_COMPACTION_OUT_OF_PAGE'};links.push({...link,zone});}return {ok:true,links};}
function preserveLinks(doc,replacement,info,links,shiftY){if(!info.raw)return;for(const link of links){if(link.zone==='MOVED')link.dict.set(RECT,doc.context.obj([link.rect[0],link.rect[1]+shiftY,link.rect[2],link.rect[3]+shiftY]));if(link.dict.get(PAGE)&&replacement.ref)link.dict.set(PAGE,replacement.ref);}replacement.node.set(ANN0TS,info.raw);}
function crosses(bottom,top,y,tolerance=1){return Number.isFinite(y)&&bottom<y-tolerance&&top>y+tolerance;}
async function vectorSafety(bytes,pageIndex,g){
  try{
    const p=await loadPdfjs(),task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true}),pdf=await task.promise,page=await pdf.getPage(pageIndex+1),ops=await page.getOperatorList(),bad=[];
    for(let i=0;i<ops.fnArray.length;i++){
      if(ops.fnArray[i]!==p.OPS.constructPath)continue;const raw=ops.argsArray[i]?.[2];if(!raw)continue;
      const a=Number(raw[0]),b=Number(raw[1]),c=Number(raw[2]),d=Number(raw[3]);if(![a,b,c,d].every(Number.isFinite))continue;
      const x0=Math.min(a,c),x1=Math.max(a,c),y0=Math.min(b,d),y1=Math.max(b,d),w=x1-x0,h=y1-y0,hOverlap=overlap(x0,x1,g.bandLeft,g.bandRight),bandWidth=Math.max(1,g.bandRight-g.bandLeft);
      const vertical=w<=2.5&&h>=10&&((x0+x1)/2)>=g.bandLeft-1&&((x0+x1)/2)<=g.bandRight+1,horizontal=h<=2.5&&w>=12&&hOverlap>=8,cell=w>=8&&h>=6&&w<=bandWidth*.92&&h<=180&&hOverlap>=Math.min(8,w*.20);
      if((vertical&&crosses(y0,y1,g.cutY))||(horizontal&&Math.abs((y0+y1)/2-g.cutY)<=1.25)||(cell&&g.cutY>y0+.35&&g.cutY<y1-.35)){bad.push({x0,x1,y0,y1});if(bad.length>=8)break;}
    }
    try{await pdf.destroy?.();}catch{}try{await task.destroy?.();}catch{}return bad.length?{ok:false,reason:'STRUCTURED_VECTOR_REFLOW_UNSAFE',boundaries:bad}:{ok:true};
  }catch(error){return {ok:false,reason:'VECTOR_REFLOW_PREFLIGHT_FAILED',error:String(error)};}
}
async function pageLines(bytes,pageIndex,fontSize){const p=await loadPdfjs(),task=p.getDocument({data:bytes.slice(),isEvalSupported:false,useWorkerFetch:false,disableFontFace:true}),pdf=await task.promise;try{const page=await pdf.getPage(pageIndex+1),tc=await page.getTextContent();return lineGroups(tc.items,fontSize);}finally{try{await pdf.destroy?.();}catch{}try{await task.destroy?.();}catch{}}}
async function embed(doc,donor,{left=0,bottom=0,right,top}){return top>bottom&&right>left?doc.embedPage(donor,{left,bottom,right,top}):null;}
function draw(page,obj,{x=0,y=0,width,height}){if(obj)page.drawPage(obj,{x,y,width,height});}

async function compactOne(doc,tx,sequenceIndex){
  const pageIndex=Number(tx.pageIndex);if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())return {applied:false,reason:'COMPACTION_PAGE_MISSING'};
  const page=doc.getPage(pageIndex),rotation=((page.getRotation().angle||0)%360+360)%360;if(rotation!==0)return {applied:false,reason:'ROTATED_PAGE_REFLOW_UNSUPPORTED'};
  const {width,height}=page.getSize(),annotations=inspectAnnotations(doc,page);if(!annotations.ok)return {applied:false,reason:annotations.reason};
  const donorBytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false})),lines=await pageLines(donorBytes,pageIndex,Math.max(6,Number(tx.block?.fontSize)||12)),g=inferGeometry(lines,tx,{width,height});if(!g.ok)return {applied:false,reason:g.reason};
  const links=validateLinks(annotations,g,height);if(!links.ok)return {applied:false,reason:links.reason};const vectors=await vectorSafety(donorBytes,pageIndex,g);if(!vectors.ok)return {applied:false,reason:vectors.reason,vectorSafety:vectors};
  const donorDoc=await PDFDocument.load(donorBytes,{ignoreEncryption:true,updateMetadata:false}),donor=donorDoc.getPage(pageIndex);
  const top=await embed(doc,donor,{left:0,bottom:g.cutY,right:width,top:height}),footer=g.footerGuardTop>.5?await embed(doc,donor,{left:0,bottom:0,right:width,top:g.footerGuardTop}):null,moving=await embed(doc,donor,{left:g.bandLeft,bottom:g.footerGuardTop,right:g.bandRight,top:g.cutY}),left=g.bandLeft>1?await embed(doc,donor,{left:0,bottom:g.footerGuardTop,right:g.bandLeft,top:g.cutY}):null,right=g.bandRight<width-1?await embed(doc,donor,{left:g.bandRight,bottom:g.footerGuardTop,right:width,top:g.cutY}):null;
  const replacement=doc.insertPage(pageIndex,[width,height]);draw(replacement,top,{x:0,y:g.cutY,width,height:height-g.cutY});draw(replacement,footer,{x:0,y:0,width,height:g.footerGuardTop});draw(replacement,left,{x:0,y:g.footerGuardTop,width:g.bandLeft,height:g.cutY-g.footerGuardTop});draw(replacement,right,{x:g.bandRight,y:g.footerGuardTop,width:width-g.bandRight,height:g.cutY-g.footerGuardTop});draw(replacement,moving,{x:g.bandLeft,y:g.footerGuardTop+g.shiftY,width:g.bandWidth,height:g.cutY-g.footerGuardTop});preserveLinks(doc,replacement,annotations,links.links,g.shiftY);doc.removePage(pageIndex+1);
  return {applied:true,metric:{transactionId:tx.id,pageIndex,sequenceIndex,direction:'UP',mode:'SAME_PAGE_UPWARD_COMPACTION',cutY:g.cutY,shiftY:g.shiftY,linePitch:g.pitch,delta:0,footerGuardTop:g.footerGuardTop,bandLeft:g.bandLeft,bandRight:g.bandRight,bandWidth:g.bandWidth,preservedLinkCount:annotations.links.length,cascadedPageCount:0,appendedPageCount:0,overflowPageCount:0}};
}
function checks(txs){return (txs||[]).map(tx=>tx?.kind==='INSERT_TEXT'?{kind:'insert',pageIndex:Number(tx.pageIndex),newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),oldText:''}:{kind:'replace',pageIndex:Number(tx.pageIndex),newText:String(tx?.replacementUnicode||'').replace(/\n/g,' '),oldText:String(tx?.originalUnicode||'').replace(/\n/g,' ')}).filter(x=>Number.isInteger(x.pageIndex)&&x.pageIndex>=0);}

export async function applyUpwardCompaction(result,transactions,{preview=false}={}){
  const candidates=(transactions||[]).filter(needsCompaction);if(!candidates.length)return result;
  if((result?.reflowMetrics||[]).some(m=>Number(m?.cascadedPageCount)>0||Number(m?.appendedPageCount)>0||Number(m?.overflowPageCount)>0))throw Object.assign(new Error('Upward compaction is not combined with cross-page reflow in this safety phase.'),{code:'COMPACTION_WITH_PAGE_CASCADE_UNSUPPORTED'});
  const pages=new Set(candidates.map(tx=>Number(tx.pageIndex)));if((transactions||[]).some(tx=>tx?.kind==='INSERT_TEXT'&&pages.has(Number(tx.pageIndex))))throw Object.assign(new Error('Finish line deletion compaction before adding new text on the same page.'),{code:'COMPACTION_WITH_INSERT_SAME_PAGE_UNSUPPORTED'});
  const doc=await PDFDocument.load(copyBytes(result.bytes),{ignoreEncryption:true,updateMetadata:false}),metrics=[...(result?.reflowMetrics||[])],warnings=[...(result?.warnings||[])];
  const ordered=[...candidates].sort((a,b)=>Number(a.pageIndex)-Number(b.pageIndex)||(Number(a.block?.bounds?.y)||0)-(Number(b.block?.bounds?.y)||0));let appliedCount=0,totalShift=0;
  for(const tx of ordered){const sequenceIndex=(transactions||[]).findIndex(item=>item?.id===tx.id),applied=await compactOne(doc,tx,sequenceIndex);if(!applied.applied){if(applied.reason==='NO_CONTENT_BELOW_DELETED_LINE')continue;throw Object.assign(new Error('The deleted line cannot be compacted upward without risking layout damage.'),{code:applied.reason||'UPWARD_COMPACTION_UNSAFE',compaction:applied});}appliedCount++;totalShift+=Number(applied.metric.shiftY)||0;metrics.push(applied.metric);warnings.push({code:'LAYOUT_COMPACTED_UPWARD',pageIndex:Number(tx.pageIndex),transactionId:tx.id,shiftY:applied.metric.shiftY,linePitch:applied.metric.linePitch,message:'Content below the deleted line moved upward by one measured visual line advance.'});}
  if(!appliedCount)return result;
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));let validation=result?.validation||null;
  if(!preview){validation=await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks:checks(transactions)});if(!validation.ok)throw Object.assign(new Error('Upward-compacted PDF failed final validation.'),{code:'UPWARD_COMPACTION_VALIDATION_FAILED',validation});}
  return {...result,bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):result?.blob||null,validation,warnings,reflowMetrics:metrics,upwardCompactionCount:appliedCount,upwardCompactionShift:totalShift};
}
