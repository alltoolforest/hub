import { planInsertionReflow } from './layout/reflow-planner.js';
import { assertMoveDependencySafety } from './transaction-dependency-graph.js';

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

function metricOwner(metric,transactions){
  const id=String(metric?.transactionId||'');
  if(!id)return null;
  return (transactions||[]).find(tx=>{
    const own=String(tx?.id||'');
    return own&&(id===own||id.startsWith(`${own}:styled:`));
  })||null;
}

function assertNoCrossPageInsertDependency(preview,transactions,changedIds,targetPage){
  const changed=new Set(changedIds||[]);
  const insertedByPage=new Map();
  for(const tx of transactions||[]){
    if(tx?.kind!=='INSERT_TEXT'||Number(tx.pageIndex)===Number(targetPage))continue;
    const page=Number(tx.pageIndex);
    if(!Number.isInteger(page))continue;
    if(!insertedByPage.has(page))insertedByPage.set(page,[]);
    insertedByPage.get(page).push(tx.id);
  }
  if(!insertedByPage.size)return;

  for(const metric of preview?.reflowMetrics||[]){
    const owner=metricOwner(metric,transactions);
    if(!owner||!changed.has(owner.id)||Number(owner.pageIndex)!==Number(targetPage))continue;
    const cascaded=Math.max(0,Number(metric?.cascadedPageCount)||0);
    const appended=Math.max(0,Number(metric?.appendedPageCount)||0);
    if(appended>0){
      throw Object.assign(new Error('The move would create continuation pages while other pages already contain added text.'),{code:'MOVE_CROSS_PAGE_DEPENDENCY_UNSAFE',transactionId:owner.id});
    }
    if(!cascaded)continue;
    const pages=(owner?.reflowPlan?.cascadePages||[]).slice(0,cascaded).map(item=>Number(item?.pageIndex)).filter(Number.isInteger);
    const conflict=pages.find(page=>insertedByPage.has(page));
    if(Number.isInteger(conflict)){
      throw Object.assign(new Error('The move would cascade through a page that already contains added text.'),{code:'MOVE_CROSS_PAGE_DEPENDENCY_UNSAFE',transactionId:owner.id,pageIndex:conflict});
    }
  }
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

  // Task 10 dependency preflight: do not silently move an earlier insertion
  // when a later deletion/contracting edit depends on the same page geometry.
  // Later insertions remain supported and are replanned below.
  assertMoveDependencySafety(transactions,targetId);

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
  const changedIds=[];

  for(let i=targetIndex;i<working.length;i++){
    const tx=working[i];
    const affected=tx?.kind==='INSERT_TEXT'&&Number(tx.pageIndex)===targetPage;
    if(affected){
      if(i>targetIndex&&tx?.expandedFromBlockId){
        throw Object.assign(new Error('A later generated paragraph depends on this layout and cannot be replanned independently.'),{code:'MOVE_DEPENDENCY_EXPANDED_INSERT_UNSAFE',dependentId:tx.id});
      }
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
      changedIds.push(tx.id);
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
  assertNoCrossPageInsertDependency(preview,working,changedIds,targetPage);

  return {transactions:working,preview,replannedCount,targetIndex,changedIds};
}
