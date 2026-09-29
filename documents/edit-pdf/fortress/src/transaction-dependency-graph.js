export const EFFECT={NONE:'NONE',GROW:'GROW',SHRINK:'SHRINK',MOVE:'MOVE',UNKNOWN:'UNKNOWN'};

const STATIC_INSERT_REASONS=new Set(['EXISTING_WHITESPACE_SUFFICIENT','NO_CONTENT_BELOW_INSERTION']);
function text(value){return String(value??'');}
function finite(value){return Number.isFinite(Number(value));}
function deletionBaseline(tx){
  const lineY=Number(tx?.block?.lines?.[0]?.y);
  if(Number.isFinite(lineY))return lineY;
  const y=Number(tx?.block?.bounds?.y),height=Number(tx?.block?.bounds?.height),size=Math.max(1,Number(tx?.block?.fontSize)||12);
  if(Number.isFinite(y))return y+(Number.isFinite(height)?height:0)-size*.24;
  return null;
}

export function isStaticNonFlowInsert(tx){
  if(tx?.kind!=='INSERT_TEXT')return false;
  const plan=tx?.reflowPlan;
  return plan?.enabled===false&&STATIC_INSERT_REASONS.has(String(plan?.reason||''));
}

export function transactionStructuralEffect(tx){
  if(!tx||typeof tx!=='object')return EFFECT.NONE;
  if(tx.structuralEffect&&Object.values(EFFECT).includes(tx.structuralEffect))return tx.structuralEffect;
  if(tx.kind==='INSERT_TEXT')return isStaticNonFlowInsert(tx)?EFFECT.NONE:EFFECT.GROW;
  if(tx.kind==='REPLACE_TEXT'){
    const before=text(tx.originalUnicode??tx.block?.text).trim();
    const after=text(tx.replacementUnicode).trim();
    if(before&&!after)return EFFECT.SHRINK;
    if(!before&&after)return EFFECT.GROW;
    const beforeLines=Math.max(1,text(tx.originalUnicode??tx.block?.text).split(/\r?\n/).length);
    const afterLines=Math.max(1,text(tx.replacementUnicode).split(/\r?\n/).length);
    if(afterLines>beforeLines)return EFFECT.GROW;
    if(afterLines<beforeLines)return EFFECT.SHRINK;
    return EFFECT.NONE;
  }
  return EFFECT.NONE;
}

export function buildTransactionDependencyGraph(transactions=[]){
  const nodes=[];const byId=new Map();const priorStructuralByPage=new Map();
  for(let index=0;index<(transactions||[]).length;index++){
    const tx=transactions[index];const id=String(tx?.id||`tx-${index}`);const pageIndex=Number(tx?.pageIndex);
    const effect=transactionStructuralEffect(tx);const structural=effect!==EFFECT.NONE;
    const prior=Number.isInteger(pageIndex)?(priorStructuralByPage.get(pageIndex)||[]):[];
    const node={id,index,pageIndex:Number.isInteger(pageIndex)?pageIndex:null,effect,structural,dependsOn:[...prior],dependents:[],tx};
    nodes.push(node);byId.set(id,node);
    if(structural&&Number.isInteger(pageIndex))priorStructuralByPage.set(pageIndex,[...prior,id]);
  }
  for(const node of nodes)for(const dependencyId of node.dependsOn){const dep=byId.get(dependencyId);if(dep)dep.dependents.push(node.id);}
  return {nodes,byId};
}

export function downstreamStructuralDependencies(transactions,targetId){
  const graph=buildTransactionDependencyGraph(transactions);const target=graph.byId.get(String(targetId||''));
  if(!target)return [];
  return graph.nodes.filter(node=>node.index>target.index&&node.pageIndex===target.pageIndex&&node.structural);
}

export function assertMoveDependencySafety(transactions,targetId){
  const downstream=downstreamStructuralDependencies(transactions,targetId);
  const contraction=downstream.find(node=>node.effect===EFFECT.SHRINK);
  if(contraction){
    throw Object.assign(new Error('A later deletion depends on this page geometry. Move was refused until grow/shrink dependencies can be recomputed together.'),{code:'MOVE_DEPENDENCY_CONTRACTION_UNSAFE',dependentId:contraction.id});
  }
  const unknown=downstream.find(node=>node.effect===EFFECT.UNKNOWN);
  if(unknown){
    throw Object.assign(new Error('A later structural edit has unknown layout impact.'),{code:'MOVE_DEPENDENCY_UNKNOWN_UNSAFE',dependentId:unknown.id});
  }
  return downstream;
}

export function transactionsForUpwardCompaction(transactions=[]){
  const deletionsByPage=new Map();
  for(const tx of transactions||[]){
    if(transactionStructuralEffect(tx)!==EFFECT.SHRINK)continue;
    const pageIndex=Number(tx?.pageIndex);
    if(!Number.isInteger(pageIndex))continue;
    if(!deletionsByPage.has(pageIndex))deletionsByPage.set(pageIndex,[]);
    deletionsByPage.get(pageIndex).push(tx);
  }
  if(!deletionsByPage.size)return [...(transactions||[])];

  const filtered=[];
  for(const tx of transactions||[]){
    if(tx?.kind!=='INSERT_TEXT'){filtered.push(tx);continue;}
    const pageIndex=Number(tx?.pageIndex),deletions=deletionsByPage.get(pageIndex)||[];
    if(!deletions.length){filtered.push(tx);continue;}
    if(!isStaticNonFlowInsert(tx)){
      throw Object.assign(new Error('This same-page insertion changes flow and cannot yet be combined atomically with deletion compaction.'),{code:'COMPACTION_WITH_FLOW_INSERT_SAME_PAGE_UNSUPPORTED',pageIndex,transactionId:tx?.id});
    }
    const insertY=Number(tx?.y);
    if(!Number.isFinite(insertY)){
      throw Object.assign(new Error('Static insertion geometry is incomplete for mixed compaction.'),{code:'COMPACTION_STATIC_INSERT_GEOMETRY_MISSING',pageIndex,transactionId:tx?.id});
    }
    for(const deletion of deletions){
      const baseline=deletionBaseline(deletion);
      const size=Math.max(6,Number(deletion?.block?.fontSize||deletion?.block?.lines?.[0]?.fontSize)||12);
      if(!Number.isFinite(baseline)||insertY<=baseline+Math.max(2,size*.35)){
        throw Object.assign(new Error('A static insertion lies in or below a region that will compact upward, so the mixed edit was refused.'),{code:'COMPACTION_WITH_DOWNSTREAM_STATIC_INSERT_UNSUPPORTED',pageIndex,transactionId:tx?.id,deletionId:deletion?.id});
      }
    }
    // This insert is explicitly no-reflow and is above every contraction on
    // the page. Exclude it from the compaction transaction list so the v3
    // compactor does not reject an operation that cannot intersect its slice.
  }
  return filtered;
}

export function validateDependencySession(transactions=[]){
  const graph=buildTransactionDependencyGraph(transactions);const pages=new Map();
  for(const node of graph.nodes){
    if(!node.structural||!Number.isInteger(node.pageIndex))continue;
    if(!pages.has(node.pageIndex))pages.set(node.pageIndex,new Set());
    pages.get(node.pageIndex).add(node.effect);
  }
  const conflicts=[];
  for(const [pageIndex,effects] of pages){
    if(effects.has(EFFECT.GROW)&&effects.has(EFFECT.SHRINK))conflicts.push({pageIndex,code:'MIXED_GROW_SHRINK_SAME_PAGE_UNSUPPORTED'});
    if(effects.has(EFFECT.UNKNOWN))conflicts.push({pageIndex,code:'UNKNOWN_STRUCTURAL_EFFECT'});
  }
  return {ok:conflicts.length===0,graph,conflicts};
}
