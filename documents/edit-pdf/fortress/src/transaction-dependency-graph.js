export const EFFECT={NONE:'NONE',GROW:'GROW',SHRINK:'SHRINK',MOVE:'MOVE',UNKNOWN:'UNKNOWN'};

function text(value){return String(value??'');}
export function transactionStructuralEffect(tx){
  if(!tx||typeof tx!=='object')return EFFECT.NONE;
  if(tx.structuralEffect&&Object.values(EFFECT).includes(tx.structuralEffect))return tx.structuralEffect;
  if(tx.kind==='INSERT_TEXT')return EFFECT.GROW;
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
