import { exportEditedPdf as exportCore } from './exporter.js?core=1';
import { PDFDocument } from '../core/pdf-lib.js';
import { PdfRenderer } from '../rendering/renderer.js';
import { extractVisualText } from '../rendering/text-layer.js';
import { buildLogicalBlocks } from '../text/text-blocks.js';
import { planReplacementCompaction } from '../layout/reflow-planner.js';
import { applyVerticalRegionReflow } from './page-reflow.js';
import { validateRoundTrip } from './roundtrip-validator.js';

function isSimpleDeletion(tx){
  if(tx?.kind!=='REPLACE_TEXT'||tx?.styleChanged||tx?.expandedInsertId)return false;
  const oldText=String(tx?.originalUnicode??tx?.block?.text??'').trim();
  const newText=String(tx?.replacementUnicode??'').trim();
  return !!oldText&&!newText;
}

function validationChecks(transactions){
  const out=[];
  for(const tx of transactions||[]){
    if(tx?.kind==='REPLACE_TEXT'){
      out.push({kind:'replace',pageIndex:Number(tx.pageIndex),newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),oldText:String(tx.originalUnicode||'').replace(/\n/g,' ')});
    }else if(tx?.kind==='INSERT_TEXT'&&String(tx.replacementUnicode||'').trim()){
      out.push({kind:'insert',pageIndex:Number(tx.pageIndex),newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),oldText:''});
    }
  }
  return out.filter(item=>Number.isInteger(item.pageIndex)&&item.pageIndex>=0);
}

async function pageAnalysis(renderer,pageIndex){
  const info=await renderer.pageInfo(pageIndex);
  const visual=await extractVisualText(renderer,pageIndex);
  const blocks=buildLogicalBlocks(visual.items,{pageIndex,pageRotation:info.rotation});
  return {info,blocks};
}

function metricForPage(metrics,pageIndex){return (metrics||[]).filter(metric=>Number(metric?.pageIndex)===pageIndex);}
function horizontalOverlap(aLeft,aRight,bLeft,bRight){return Math.max(0,Math.min(aRight,bRight)-Math.max(aLeft,bLeft));}
function blockRect(block){
  const b=block?.bounds||{};const left=Number(b.x),width=Number(b.width),bottom=Number(b.y),height=Number(b.height);
  if(![left,width,bottom,height].every(Number.isFinite)||width<=0||height<=0)return null;
  return {left,right:left+width,bottom,top:bottom+height,width,height};
}
function blockBaseline(block){return Number(block?.lines?.[0]?.y);}
function blockSize(block){return Math.max(6,Number(block?.lines?.[0]?.fontSize||block?.fontSize)||12);}

function relatedFlowBlocks(blocks,sourceBlock){
  const rect=blockRect(sourceBlock);const size=blockSize(sourceBlock);
  if(!rect)return blocks;
  const laneLeft=rect.left-Math.max(10,size),laneRight=rect.right+Math.max(14,size*1.5);
  return (blocks||[]).filter(block=>{
    const r=blockRect(block);if(!r)return false;
    const amount=horizontalOverlap(r.left,r.right,laneLeft,laneRight);
    return amount>=Math.min(8,Math.max(2,r.width*.15));
  });
}

function neighborLineStep(sourceBlock,blocks,fallback){
  const sourceY=blockBaseline(sourceBlock);const size=blockSize(sourceBlock);
  if(!Number.isFinite(sourceY))return fallback;
  const gaps=[];
  for(const block of blocks||[]){
    const otherSize=blockSize(block),y=blockBaseline(block);
    if(!Number.isFinite(y)||Math.abs(otherSize-size)>Math.max(3,size*.45))continue;
    const gap=Math.abs(sourceY-y);
    if(gap>=size*.65&&gap<=size*3.2)gaps.push(gap);
  }
  gaps.sort((a,b)=>a-b);
  return gaps[0]??fallback;
}

function deletionBlocksRelated(a,b){
  const ar=blockRect(a),br=blockRect(b);if(!ar||!br)return false;
  const size=Math.max(blockSize(a),blockSize(b));
  const horizontal=horizontalOverlap(ar.left,ar.right,br.left,br.right)>=Math.min(8,Math.min(ar.width,br.width)*.15);
  const ay=blockBaseline(a),by=blockBaseline(b);
  const vertical=Number.isFinite(ay)&&Number.isFinite(by)&&Math.abs(ay-by)<=size*3.2;
  return horizontal&&vertical;
}

function groupDeletionCandidates(candidates){
  const pages=new Map();
  for(const tx of candidates){
    const pageIndex=Number(tx.pageIndex);if(!pages.has(pageIndex))pages.set(pageIndex,[]);pages.get(pageIndex).push(tx);
  }
  const groups=[];
  for(const [pageIndex,items] of pages){
    items.sort((a,b)=>(blockBaseline(b.block)||0)-(blockBaseline(a.block)||0));
    let current=[];
    for(const tx of items){
      if(!current.length||deletionBlocksRelated(current[current.length-1].block,tx.block))current.push(tx);
      else{groups.push({pageIndex,items:current});current=[tx];}
    }
    if(current.length)groups.push({pageIndex,items:current});
  }
  return groups.sort((a,b)=>a.pageIndex-b.pageIndex||(blockBaseline(b.items[0].block)||0)-(blockBaseline(a.items[0].block)||0));
}

function compactionConflict(transactions,candidates){
  if(!candidates.length)return null;
  for(const insert of transactions||[]){
    if(insert?.kind!=='INSERT_TEXT')continue;
    const insertPage=Number(insert.pageIndex);
    const blocked=candidates.find(candidate=>insertPage<=Number(candidate.pageIndex));
    if(blocked){
      return Object.assign(new Error('Save the deletion/compaction before adding or expanding text on this or an earlier page. This prevents conflicting upward and downward page flow.'),{
        code:'UPWARD_REFLOW_MIXED_INSERT_UNSAFE',pageIndex:Number(blocked.pageIndex),
      });
    }
  }
  return null;
}

function groupDesiredShrink(group,blocks){
  let total=0;
  for(const tx of group.items){
    const source=tx.block;
    const spacing=relatedFlowBlocks(blocks.filter(block=>block.id!==source?.id),source);
    const fallback=Math.max(blockSize(source),Number(source?.bounds?.height)||blockSize(source));
    total+=neighborLineStep(source,spacing,fallback);
  }
  return total;
}

function refineGroupShrink(plan,desired,pageHeight,lineCount){
  if(!plan?.enabled)return plan;
  const ceiling=Number(plan?.compaction?.ceiling),flowTop=Number(plan?.flowTopY);
  const fallback=Math.abs(Number(plan.requestedDelta)||0);
  const safe=Number.isFinite(ceiling)&&Number.isFinite(flowTop)?Math.max(0,ceiling-flowTop):fallback;
  const shrink=Math.min(desired,safe,Number(pageHeight)*.35);
  if(!(shrink>.5))return {...plan,enabled:false,reason:'COMPACTION_CLEARANCE_INSUFFICIENT'};
  return {...plan,requestedDelta:-shrink,compaction:{...plan.compaction,removedLineCount:lineCount,lineStep:desired/Math.max(1,lineCount),desiredShrink:desired,shrink}};
}

/**
 * Adds conservative inverse layout for complete visual-line deletions. Adjacent
 * deleted lines are compacted as one group so a three-line removal closes three
 * line advances at once. Original page breaks are never pulled backward here.
 */
export async function exportEditedPdf(originalBytes,transactions,{validate=true,preview=false}={}){
  const txs=Array.isArray(transactions)?transactions:[];
  const candidates=txs.filter(isSimpleDeletion);
  if(!candidates.length)return exportCore(originalBytes,txs,{validate,preview});
  const conflict=compactionConflict(txs,candidates);if(conflict)throw conflict;

  const deletedBlockIds=new Set(candidates.map(tx=>tx?.block?.id||tx?.blockId).filter(Boolean));
  const groups=groupDeletionCandidates(candidates);
  const core=await exportCore(originalBytes,txs,{validate:false,preview});
  const doc=await PDFDocument.load(core.bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const renderer=new PdfRenderer(originalBytes);
  const warnings=[...(core.warnings||[])];
  const reflowMetrics=[...(core.reflowMetrics||[])];
  const cache=new Map();
  let appliedCount=0,compactedLineCount=0,flowOrder=0;

  try{
    await renderer.load();
    for(const group of groups){
      const pageIndex=group.pageIndex;
      if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())continue;
      if(!cache.has(pageIndex))cache.set(pageIndex,await pageAnalysis(renderer,pageIndex));
      const {info,blocks}=cache.get(pageIndex);
      const anchorTx=group.items[0];
      const sourceBlock=anchorTx.block||blocks.find(block=>block.id===anchorTx.blockId);
      if(!sourceBlock){warnings.push({code:'UPWARD_REFLOW_REFUSED',pageIndex,transactionId:anchorTx.id,reason:'COMPACTION_BLOCK_MISSING'});continue;}

      const spacingBlocks=relatedFlowBlocks(blocks.filter(block=>block.id!==sourceBlock.id),sourceBlock);
      const flowBlocks=spacingBlocks.filter(block=>!deletedBlockIds.has(block.id));
      let plan=planReplacementCompaction({
        blocks:flowBlocks,block:sourceBlock,replacementUnicode:'',pageWidth:info.width,pageHeight:info.height,pageRotation:info.rotation,
        existingMetrics:metricForPage(reflowMetrics,pageIndex),
      });
      plan=refineGroupShrink(plan,groupDesiredShrink(group,blocks),info.height,group.items.length);
      if(!plan?.enabled){
        warnings.push({code:'UPWARD_REFLOW_REFUSED',pageIndex,transactionId:anchorTx.id,reason:plan?.reason||'COMPACTION_UNAVAILABLE'});
        continue;
      }

      const flowTx={...anchorTx,reflowPlan:plan};
      const result=await applyVerticalRegionReflow(doc,flowTx,null,{preview,sequenceIndex:flowOrder++});
      if(result?.metric)reflowMetrics.push(result.metric);
      if(result?.applied){
        appliedCount++;compactedLineCount+=group.items.length;
        warnings.push({code:'LAYOUT_COMPACTED',pageIndex,transactionId:anchorTx.id,delta:result.metric?.delta||0,lineCount:group.items.length,message:`${group.items.length} deleted line${group.items.length===1?'':'s'} compacted upward.`});
      }else{
        warnings.push({code:'UPWARD_REFLOW_REFUSED',pageIndex,transactionId:anchorTx.id,reason:result?.reason||'COMPACTION_UNAVAILABLE',message:'The text was deleted, but surrounding content was not moved because the page could not be compacted safely.'});
      }
    }
  }finally{try{renderer.destroy?.();}catch{}}

  if(!appliedCount)return validate?exportCore(originalBytes,txs,{validate:true,preview}):core;

  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const validation=validate?await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks:validationChecks(txs)}):null;
  if(validation&&!validation.ok)throw Object.assign(new Error('Export validation failed after upward compaction.'),{code:'EXPORT_VALIDATION_FAILED',validation});
  return {...core,bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):null,validation,warnings,reflowMetrics,upwardCompactionCount:appliedCount,upwardCompactedLineCount:compactedLineCount};
}
