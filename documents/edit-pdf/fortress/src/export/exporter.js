import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { expandDeletionCompactionTransactions } from './deletion-compaction-plan.js';
import { validateDependencySession } from '../transaction-dependency-graph.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { prepareTableCellTransactions } from './table-cell-safety.js';
import { preflightTableCellInsertions } from './table-cell-insert-preflight.js';
import { prepareStructuredVectorTransactions } from './structured-vector-plan.js';
import { expandStyleAwareInsertTransactions } from './style-aware-insert.js';
import { validateVisualLayout } from './visual-validator.js';

function visualMappings(transactions=[]){
  const mappings=[],seen=new Set();
  const add=(outputPageIndex,baselinePageIndex=outputPageIndex)=>{
    const out=Number(outputPageIndex),base=Number(baselinePageIndex);
    if(!Number.isInteger(out)||out<0||seen.has(out))return;
    seen.add(out);mappings.push({outputPageIndex:out,baselinePageIndex:Number.isInteger(base)&&base>=0?base:out});
  };
  for(const tx of transactions||[]){
    add(tx?.pageIndex,tx?.pageIndex);
    for(const page of tx?.reflowPlan?.cascadePages||[])add(page?.pageIndex,page?.pageIndex);
  }
  return mappings;
}

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const cellAwareTransactions=await prepareTableCellTransactions(originalBytes,preparedTransactions);
  const structuredTransactions=await prepareStructuredVectorTransactions(originalBytes,cellAwareTransactions);
  const styledTransactions=await expandStyleAwareInsertTransactions(originalBytes,structuredTransactions);
  const cellSafeTransactions=await preflightTableCellInsertions(originalBytes,styledTransactions);
  const dependencySession=validateDependencySession(cellSafeTransactions);
  if(!dependencySession.ok){
    const conflict=dependencySession.conflicts[0];
    throw Object.assign(new Error('This combination of structural edits cannot yet be recomputed safely as one page transaction.'),{code:conflict?.code||'TRANSACTION_DEPENDENCY_UNSAFE',pageIndex:conflict?.pageIndex,conflicts:dependencySession.conflicts});
  }
  const result=await exportEditedPdfCore(originalBytes,cellSafeTransactions,options);
  const compactionTransactions=expandDeletionCompactionTransactions(cellSafeTransactions);
  const compacted=await applyUpwardCompaction(result,compactionTransactions,{preview:!!options.preview});
  if(options.preview)return compacted;

  const visual=await validateVisualLayout(compacted.bytes,visualMappings(cellSafeTransactions),{baselineBytes:originalBytes});
  if(!visual.ok){
    throw Object.assign(new Error('The exported PDF is structurally valid but the visual layout contains a new collision, duplicate, or clipped text region.'),{code:'VISUAL_EXPORT_VALIDATION_FAILED',visual});
  }
  const validation={...(compacted.validation||{}),visual,ok:(compacted.validation?.ok??true)&&visual.ok};
  return {...compacted,validation,visualValidation:visual};
}
