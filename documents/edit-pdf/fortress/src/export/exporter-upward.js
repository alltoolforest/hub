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
      out.push({
        kind:'replace',
        pageIndex:Number(tx.pageIndex),
        newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),
        oldText:String(tx.originalUnicode||'').replace(/\n/g,' '),
      });
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

function metricForPage(metrics,pageIndex){
  return (metrics||[]).filter(metric=>Number(metric?.pageIndex)===pageIndex);
}

function horizontalOverlap(aLeft,aRight,bLeft,bRight){
  return Math.max(0,Math.min(aRight,bRight)-Math.max(aLeft,bLeft));
}

function relatedFlowBlocks(blocks,sourceBlock){
  const b=sourceBlock?.bounds||{};
  const left=Number(b.x),right=left+Number(b.width);
  const size=Math.max(6,Number(sourceBlock?.lines?.[0]?.fontSize||sourceBlock?.fontSize)||12);
  if(![left,right].every(Number.isFinite)||right<=left)return blocks;
  const laneLeft=left-Math.max(10,size),laneRight=right+Math.max(14,size*1.5);
  return (blocks||[]).filter(block=>{
    const r=block?.bounds||{};
    const x=Number(r.x),w=Number(r.width);
    if(!Number.isFinite(x)||!Number.isFinite(w)||w<=0)return false;
    const overlap=horizontalOverlap(x,x+w,laneLeft,laneRight);
    return overlap>=Math.min(8,Math.max(2,w*.15));
  });
}

function neighborLineStep(sourceBlock,blocks,fallback){
  const sourceLine=sourceBlock?.lines?.[0];
  const sourceY=Number(sourceLine?.y);
  const size=Math.max(6,Number(sourceLine?.fontSize||sourceBlock?.fontSize)||12);
  if(!Number.isFinite(sourceY))return fallback;
  const gaps=[];
  for(const block of blocks||[]){
    for(const line of block?.lines||[]){
      const y=Number(line?.y),otherSize=Math.max(1,Number(line?.fontSize||block?.fontSize)||size);
      if(!Number.isFinite(y)||Math.abs(otherSize-size)>Math.max(3,size*.45))continue;
      const gap=Math.abs(sourceY-y);
      if(gap>=size*.65&&gap<=size*3.2)gaps.push(gap);
    }
  }
  if(!gaps.length)return fallback;
  gaps.sort((a,b)=>a-b);
  return gaps[0];
}

function refineSingleLineShrink(plan,sourceBlock,blocks,pageHeight){
  if(!plan?.enabled||Number(plan?.compaction?.originalLineCount)!==1)return plan;
  const fallback=Math.abs(Number(plan.requestedDelta)||0);
  const desired=neighborLineStep(sourceBlock,blocks,fallback);
  const ceiling=Number(plan?.compaction?.ceiling);
  const flowTop=Number(plan?.flowTopY);
  const safe=Number.isFinite(ceiling)&&Number.isFinite(flowTop)?Math.max(0,ceiling-flowTop):fallback;
  const shrink=Math.min(desired,safe,Number(pageHeight)*.35);
  if(!(shrink>.5))return {...plan,enabled:false,reason:'COMPACTION_CLEARANCE_INSUFFICIENT'};
  return {
    ...plan,
    requestedDelta:-shrink,
    compaction:{...plan.compaction,lineStep:desired,desiredShrink:desired,shrink},
  };
}

function compactionConflict(transactions,candidates){
  if(!candidates.length)return null;
  const candidatePages=new Set(candidates.map(tx=>Number(tx.pageIndex)));
  for(const tx of transactions||[]){
    if(tx?.kind!=='INSERT_TEXT')continue;
    if(tx?.expandedFromBlockId)continue;
    if(candidatePages.has(Number(tx.pageIndex))){
      return Object.assign(new Error('Save the deletion/compaction before adding new text on the same page. This prevents conflicting up/down page flow.'),{
        code:'UPWARD_REFLOW_MIXED_INSERT_UNSAFE',
        pageIndex:Number(tx.pageIndex),
      });
    }
  }
  return null;
}

/**
 * Adds conservative upward compaction to the existing exporter without
 * changing its proven direct-edit/downward-overflow pipeline. Only complete
 * visual-line deletions are compacted. Original page breaks are never pulled
 * backward; this path only moves same-page content upward.
 */
export async function exportEditedPdf(originalBytes,transactions,{validate=true,preview=false}={}){
  const txs=Array.isArray(transactions)?transactions:[];
  const candidates=txs.filter(isSimpleDeletion);
  if(!candidates.length)return exportCore(originalBytes,txs,{validate,preview});

  const conflict=compactionConflict(txs,candidates);
  if(conflict)throw conflict;

  // Let the proven exporter perform all text/operator mutations first. We
  // validate only after the inverse-layout pass so the user never receives an
  // intermediate PDF whose deletion succeeded but whose layout did not.
  const core=await exportCore(originalBytes,txs,{validate:false,preview});
  const doc=await PDFDocument.load(core.bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const renderer=new PdfRenderer(originalBytes);
  const warnings=[...(core.warnings||[])];
  const reflowMetrics=[...(core.reflowMetrics||[])];
  const cache=new Map();
  let appliedCount=0;

  try{
    await renderer.load();
    for(let sequenceIndex=0;sequenceIndex<txs.length;sequenceIndex++){
      const tx=txs[sequenceIndex];
      if(!isSimpleDeletion(tx))continue;
      const pageIndex=Number(tx.pageIndex);
      if(!Number.isInteger(pageIndex)||pageIndex<0||pageIndex>=doc.getPageCount())continue;

      if(!cache.has(pageIndex))cache.set(pageIndex,await pageAnalysis(renderer,pageIndex));
      const {info,blocks}=cache.get(pageIndex);
      const sourceBlock=tx.block||blocks.find(block=>block.id===tx.blockId);
      if(!sourceBlock){
        warnings.push({code:'UPWARD_REFLOW_REFUSED',pageIndex,transactionId:tx.id,reason:'COMPACTION_BLOCK_MISSING'});
        continue;
      }

      const flowBlocks=relatedFlowBlocks(blocks.filter(block=>block.id!==sourceBlock.id),sourceBlock);
      let plan=planReplacementCompaction({
        blocks:flowBlocks,
        block:sourceBlock,
        replacementUnicode:tx.replacementUnicode,
        pageWidth:info.width,
        pageHeight:info.height,
        pageRotation:info.rotation,
        existingMetrics:metricForPage(reflowMetrics,pageIndex),
      });
      plan=refineSingleLineShrink(plan,sourceBlock,flowBlocks,info.height);
      if(!plan?.enabled){
        warnings.push({code:'UPWARD_REFLOW_REFUSED',pageIndex,transactionId:tx.id,reason:plan?.reason||'COMPACTION_UNAVAILABLE'});
        continue;
      }

      const flowTx={...tx,reflowPlan:plan};
      const result=await applyVerticalRegionReflow(doc,flowTx,null,{preview,sequenceIndex});
      if(result?.metric)reflowMetrics.push(result.metric);
      if(result?.applied){
        appliedCount++;
        warnings.push({
          code:'LAYOUT_COMPACTED',
          pageIndex,
          transactionId:tx.id,
          delta:result.metric?.delta||0,
          message:'Content below the deleted line moved upward automatically.',
        });
      }else{
        warnings.push({
          code:'UPWARD_REFLOW_REFUSED',
          pageIndex,
          transactionId:tx.id,
          reason:result?.reason||'COMPACTION_UNAVAILABLE',
          message:'The text was deleted, but surrounding content was not moved because the page could not be compacted safely.',
        });
      }
    }
  }finally{
    try{renderer.destroy?.();}catch{}
  }

  if(!appliedCount){
    // No layout mutation happened. Re-run the core exporter with its original
    // validation behavior rather than claiming a compaction took place.
    return validate?exportCore(originalBytes,txs,{validate:true,preview}):core;
  }

  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const checks=validationChecks(txs);
  const validation=validate?await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks}):null;
  if(validation&&!validation.ok){
    throw Object.assign(new Error('Export validation failed after upward compaction.'),{code:'EXPORT_VALIDATION_FAILED',validation});
  }

  return {
    ...core,
    bytes,
    blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):null,
    validation,
    warnings,
    reflowMetrics,
    upwardCompactionCount:appliedCount,
  };
}
