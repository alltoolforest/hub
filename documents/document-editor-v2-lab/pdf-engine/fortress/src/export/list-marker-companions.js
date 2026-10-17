import { PDFDocument } from '../core/pdf-lib.js';
import { getPageContentStreams } from '../core/document-model.js';
import { extractSourceRunsFromStreams } from '../mapping/source-mapper.js';

const MARKER_RE=/^(?:[•●◦▪‣⁃·]|(?:\d{1,3}|[A-Za-z])[.)])$/u;

function compact(value){return String(value||'').replace(/\s+/g,'').trim();}
function isMarker(run){return MARKER_RE.test(compact(run?.text));}
function runKey(run){return `${run?.sourceContainerKey||`page:${run?.streamRef||run?.streamIndex}`}:${run?.operatorIndex}`;}
function deletesWholeLine(tx){
  return tx?.kind==='REPLACE_TEXT'&&!!tx?.block&&String(tx?.originalUnicode??tx?.block?.text??'').trim().length>0&&String(tx?.replacementUnicode??'').trim().length===0;
}
function geometry(tx){
  const block=tx?.block,line=block?.lines?.[0];
  const baseline=Number(line?.y);
  const left=Number.isFinite(Number(line?.minX))?Number(line.minX):Number(block?.bounds?.x);
  const size=Math.max(6,Number(line?.fontSize||block?.fontSize)||12);
  return Number.isFinite(baseline)&&Number.isFinite(left)?{baseline,left,size}:null;
}
function markerRight(run,size){
  const x=Number(run?.x),advance=Math.abs(Number(run?.advance));
  if(!Number.isFinite(x))return null;
  return x+(Number.isFinite(advance)&&advance>.1?advance:Math.max(3,size*.6));
}
function sameVisualRow(run,g){return Math.abs(Number(run?.y)-g.baseline)<=Math.max(3.2,g.size*.40);}
function markerOnBaseline(runs,baseline,size){return runs.some(run=>isMarker(run)&&Math.abs(Number(run?.y)-baseline)<=Math.max(3.2,size*.40));}
function continuationBelow(runs,g){
  const minGap=Math.max(3,g.size*.45),maxGap=Math.max(10,g.size*1.85);
  const below=runs.filter(run=>{
    if(!String(run?.text||'').trim()||isMarker(run))return false;
    const y=Number(run?.y),x=Number(run?.x),size=Math.max(1,Number(run?.fontSize)||g.size);
    if(!Number.isFinite(y)||!Number.isFinite(x))return false;
    const gap=g.baseline-y;
    if(gap<minGap||gap>maxGap)return false;
    if(Math.abs(x-g.left)>Math.max(20,g.size*1.9))return false;
    if(Math.abs(size-g.size)>Math.max(1.8,g.size*.24))return false;
    return true;
  });
  if(!below.length)return false;
  const nextBaseline=Math.max(...below.map(run=>Number(run.y)));
  return !markerOnBaseline(runs,nextBaseline,g.size);
}
function findCompanionMarker(tx,runs,claimed){
  const g=geometry(tx);if(!g||continuationBelow(runs,g))return null;
  const candidates=[];
  for(const run of runs){
    if(!isMarker(run)||claimed.has(runKey(run))||!sameVisualRow(run,g))continue;
    const x=Number(run?.x),right=markerRight(run,g.size);
    if(!Number.isFinite(x)||!Number.isFinite(right)||x>=g.left-.5)continue;
    const gap=g.left-right;
    if(gap<-.5||gap>Math.max(52,g.size*4.8))continue;
    candidates.push({run,vertical:Math.abs(Number(run.y)-g.baseline),gap});
  }
  candidates.sort((a,b)=>a.vertical-b.vertical||a.gap-b.gap);
  return candidates[0]?.run||null;
}
function companionBlock(tx,run,index){
  const size=Math.max(6,Number(run?.fontSize)||Number(tx?.block?.fontSize)||12);
  const x=Number(run?.x)||0,y=Number(run?.y)||0;
  const width=Math.max(2,Math.abs(Number(run?.advance))||size*.6);
  const text=String(run?.text||'');
  const line={text,y,minX:x,maxX:x+width,fontSize:size,fontName:run?.fontName||null,runs:[],bounds:{x,y:y-size*.24,width,height:size*1.10}};
  return {
    id:`${tx?.blockId||tx?.block?.id||tx?.id||'edit'}__list_marker_${index}`,
    pageIndex:Number(tx.pageIndex),
    pageRotation:Number(tx?.block?.pageRotation)||0,
    text,
    lines:[line],
    fontSize:size,
    fontName:run?.fontName||null,
    bounds:line.bounds,
    tier:'DIRECT_EDIT',
    confidence:1,
    reason:null,
    sourceRuns:[run],
    sourceLines:[[run]],
  };
}
function companionTransaction(tx,run,index){
  const block=companionBlock(tx,run,index);
  return {
    id:`${tx.id}__list_marker_${index}`,
    kind:'REPLACE_TEXT',
    pageIndex:Number(tx.pageIndex),
    blockId:block.id,
    sourceMap:block.sourceLines,
    // Leave originalUnicode empty intentionally. The marker is a source-level
    // companion edit, not a second user deletion. This prevents duplicate
    // page-wide deletion validation and prevents a second compaction shift.
    originalUnicode:'',
    replacementUnicode:'',
    originalEncodedBytes:null,
    replacementEncodedBytes:null,
    originalOperators:block.sourceRuns,
    replacementOperators:null,
    fontContext:run?.fontContext||null,
    layoutValidation:null,
    fontFamily:null,
    fontSize:null,
    bold:null,
    italic:null,
    styleChanged:false,
    status:'COMMITTED',
    block,
    autoListMarkerCompanion:true,
    companionOf:tx.id,
  };
}

export async function addDeletionMarkerCompanions(originalBytes,transactions){
  const source=Array.isArray(transactions)?transactions:[];
  const deletions=source.filter(deletesWholeLine);
  if(!deletions.length)return source;

  const doc=await PDFDocument.load(originalBytes instanceof Uint8Array?originalBytes.slice():new Uint8Array(originalBytes||0),{ignoreEncryption:true,updateMetadata:false});
  const pageRuns=new Map(),claimed=new Set();
  for(const tx of source){
    for(const run of tx?.block?.sourceRuns||[])claimed.add(runKey(run));
  }

  const companions=[];
  let index=0;
  for(const tx of deletions){
    const pageIndex=Number(tx.pageIndex);
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())continue;
    if(!pageRuns.has(pageIndex)){
      const streams=getPageContentStreams(doc,pageIndex);
      pageRuns.set(pageIndex,extractSourceRunsFromStreams(doc,pageIndex,streams).sourceRuns||[]);
    }
    const marker=findCompanionMarker(tx,pageRuns.get(pageIndex),claimed);
    if(!marker)continue;
    claimed.add(runKey(marker));
    companions.push(companionTransaction(tx,marker,index++));
  }
  return companions.length?[...source,...companions]:source;
}
