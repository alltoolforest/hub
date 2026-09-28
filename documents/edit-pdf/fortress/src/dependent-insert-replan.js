import { planInsertionReflow } from './layout/reflow-planner.js';

function copyPlan(plan){
  if(!plan||typeof plan!=='object')return plan;
  try{return structuredClone(plan);}catch{return JSON.parse(JSON.stringify(plan));}
}

function cloneTransaction(tx){
  if(!tx||typeof tx!=='object')return tx;
  return {...tx,reflowPlan:copyPlan(tx.reflowPlan)};
}

function metricsForPage(preview,pageIndex){
  return (preview?.reflowMetrics||[])
    .filter(metric=>Number(metric?.pageIndex)===Number(pageIndex)&&Number(metric?.delta)>0)
    .sort((a,b)=>(Number(a.sequenceIndex)||0)-(Number(b.sequenceIndex)||0));
}

export async function replanDependentInsertions({
  transactions=[],
  targetId,
  patch={},
  blocks=[],
  geometryForPage,
  previewTransactions,
  planner=planInsertionReflow,
}={}){
  if(typeof previewTransactions!=='function')throw new TypeError('previewTransactions is required');
  if(typeof geometryForPage!=='function')throw new TypeError('geometryForPage is required');

  const targetIndex=(transactions||[]).findIndex(tx=>tx?.id===targetId);
  if(targetIndex<0)throw Object.assign(new Error('The added text could not be found.'),{code:'MOVE_TRANSACTION_MISSING'});
  const originalTarget=transactions[targetIndex];
  if(originalTarget?.kind!=='INSERT_TEXT'||originalTarget?.expandedFromBlockId){
    throw Object.assign(new Error('This generated text cannot be moved independently.'),{code:'MOVE_TRANSACTION_UNSAFE'});
  }

  const working=(transactions||[]).map(cloneTransaction);
  const moved=working[targetIndex];
  if(Number.isFinite(Number(patch.x)))moved.x=Number(patch.x);
  if(Number.isFinite(Number(patch.y)))moved.y=Number(patch.y);
  if(Number.isFinite(Number(patch.maxWidth)))moved.maxWidth=Math.max(40,Math.min(1000,Number(patch.maxWidth)));

  const targetPage=Number(moved.pageIndex);
  let prefix=working.slice(0,targetIndex);
  let prefixPreview=prefix.length?await previewTransactions(prefix):null;
  let previewLength=prefix.length?prefix.length:0;
  let replannedCount=0;

  for(let i=targetIndex;i<working.length;i++){
    const tx=working[i];
    const affected=tx?.kind==='INSERT_TEXT'&&Number(tx.pageIndex)===targetPage;
    if(affected){
      // Rebuild the prefix preview if unrelated transactions were appended
      // since the last affected insert. REPLACE_TEXT/upward-compaction entries
      // can contribute page-flow metrics too, so a later insert must see them.
      if(prefix.length!==previewLength){
        prefixPreview=prefix.length?await previewTransactions(prefix):null;
        previewLength=prefix.length;
      }
      const geometry=geometryForPage(tx.pageIndex)||{};
      tx.reflowPlan=planner({
        blocks,
        x:Number(tx.x)||0,
        y:Number(tx.y)||0,
        maxWidth:Number(tx.maxWidth)||300,
        fontSize:Number(tx.fontSize)||12,
        pageWidth:Math.max(1,Number(geometry.width)||595),
        pageHeight:Math.max(1,Number(geometry.height)||842),
        pageRotation:Number(geometry.rotation)||0,
        existingMetrics:metricsForPage(prefixPreview,tx.pageIndex),
      });
      replannedCount++;
    }
    prefix.push(tx);
    if(affected){
      prefixPreview=await previewTransactions(prefix);
      previewLength=prefix.length;
    }
  }

  const preview=previewLength===working.length&&prefixPreview
    ?prefixPreview
    :await previewTransactions(working);

  return {transactions:working,preview,replannedCount,targetIndex};
}
