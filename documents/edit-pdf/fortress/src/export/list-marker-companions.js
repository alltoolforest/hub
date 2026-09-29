import { PDFDocument } from '../core/pdf-lib.js';
import { getPageContentStreams } from '../core/document-model.js';
import { extractSourceRunsFromStreams } from '../mapping/source-mapper.js';
import { resolveListSemanticUnit, listRunKey } from './list-semantic-units.js';

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
function claimedRunsOf(tx){
  const runs=[];
  for(const run of tx?.block?.sourceRuns||[])if(run)runs.push(run);
  for(const line of tx?.block?.sourceLines||[])for(const run of line||[])if(run)runs.push(run);
  return runs;
}
function groupRunsByBaseline(runs,size){
  const groups=[];const tolerance=Math.max(3.2,size*.40);
  for(const run of runs||[]){
    const y=Number(run?.y);if(!Number.isFinite(y))continue;
    let group=groups.find(item=>Math.abs(item.baseline-y)<=tolerance);
    if(!group){group={baseline:y,runs:[]};groups.push(group);}
    group.runs.push(run);
  }
  return groups.sort((a,b)=>b.baseline-a.baseline).map(group=>group.runs);
}
function runBox(run,size){
  const x=Number(run?.x)||0,y=Number(run?.y)||0,runSize=Math.max(6,Number(run?.fontSize)||size);
  const width=Math.max(2,Math.abs(Number(run?.advance))||Math.max(3,String(run?.text||'').length*runSize*.45));
  return {left:x,right:x+width,bottom:y-runSize*.24,top:y+runSize*.86,size:runSize};
}
function companionBlock(tx,runs,index){
  const fallbackSize=Math.max(6,Number(tx?.block?.fontSize)||12);
  const boxes=(runs||[]).map(run=>runBox(run,fallbackSize));
  const left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right)),bottom=Math.min(...boxes.map(box=>box.bottom)),top=Math.max(...boxes.map(box=>box.top));
  const sourceLines=groupRunsByBaseline(runs,fallbackSize);
  const lines=sourceLines.map(group=>{
    const groupBoxes=group.map(run=>runBox(run,fallbackSize));
    const minX=Math.min(...groupBoxes.map(box=>box.left)),maxX=Math.max(...groupBoxes.map(box=>box.right));
    const y=Math.max(...group.map(run=>Number(run?.y)||bottom));
    const fontSize=Math.max(...groupBoxes.map(box=>box.size));
    const text=group.map(run=>String(run?.text||'')).join(' ').replace(/\s+/g,' ').trim();
    return {text,y,minX,maxX,fontSize,fontName:group[0]?.fontName||null,runs:[],bounds:{x:minX,y:y-fontSize*.24,width:maxX-minX,height:fontSize*1.10}};
  });
  const text=lines.map(line=>line.text).filter(Boolean).join('\n');
  return {
    id:`${tx?.blockId||tx?.block?.id||tx?.id||'edit'}__list_semantic_${index}`,
    pageIndex:Number(tx.pageIndex),pageRotation:Number(tx?.block?.pageRotation)||0,text,lines,
    fontSize:fallbackSize,fontName:runs?.[0]?.fontName||null,bounds:{x:left,y:bottom,width:right-left,height:top-bottom},
    tier:'DIRECT_EDIT',confidence:1,reason:null,sourceRuns:[...runs],sourceLines,
  };
}
function companionTransaction(tx,runs,index){
  const block=companionBlock(tx,runs,index);
  return {
    id:`${tx.id}__list_semantic_${index}`,kind:'REPLACE_TEXT',pageIndex:Number(tx.pageIndex),blockId:block.id,sourceMap:block.sourceLines,
    // This companion only removes list-owned source operators. It must not
    // trigger a second upward-compaction transaction or duplicate validation.
    originalUnicode:'',replacementUnicode:'',originalEncodedBytes:null,replacementEncodedBytes:null,originalOperators:block.sourceRuns,replacementOperators:null,
    fontContext:runs?.[0]?.fontContext||null,layoutValidation:null,fontFamily:null,fontSize:null,bold:null,italic:null,styleChanged:false,status:'COMMITTED',block,
    autoListMarkerCompanion:true,autoListSemanticCompanion:true,companionOf:tx.id,
  };
}

export async function addDeletionMarkerCompanions(originalBytes,transactions){
  const source=Array.isArray(transactions)?transactions:[];
  const deletions=source.filter(deletesWholeLine);
  if(!deletions.length)return source;

  const doc=await PDFDocument.load(originalBytes instanceof Uint8Array?originalBytes.slice():new Uint8Array(originalBytes||0),{ignoreEncryption:true,updateMetadata:false});
  const pageRuns=new Map(),claimed=new Set();
  for(const tx of source)for(const run of claimedRunsOf(tx))claimed.add(listRunKey(run));

  const companions=[];let index=0;
  for(const tx of deletions){
    const g=geometry(tx);if(!g)continue;
    const pageIndex=Number(tx.pageIndex);
    if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())continue;
    if(!pageRuns.has(pageIndex)){
      const streams=getPageContentStreams(doc,pageIndex);
      pageRuns.set(pageIndex,extractSourceRunsFromStreams(doc,pageIndex,streams).sourceRuns||[]);
    }
    const unit=resolveListSemanticUnit({runs:pageRuns.get(pageIndex),claimed,baseline:g.baseline,left:g.left,size:g.size});
    if(!unit.ok){
      if(unit.reason==='LIST_MARKER_OWNERSHIP_AMBIGUOUS'){
        throw Object.assign(new Error('List marker ownership is ambiguous, so deletion was refused to protect neighboring list items.'),{code:'LIST_MARKER_OWNERSHIP_AMBIGUOUS',transactionId:tx.id,pageIndex});
      }
      continue;
    }
    const owned=[unit.marker,...unit.continuationRuns].filter(run=>run&&!claimed.has(listRunKey(run)));
    if(!owned.length)continue;
    for(const run of owned)claimed.add(listRunKey(run));
    companions.push(companionTransaction(tx,owned,index++));
  }
  return companions.length?[...source,...companions]:source;
}
