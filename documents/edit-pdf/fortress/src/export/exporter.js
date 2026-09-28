import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { expandDeletionCompactionTransactions } from './deletion-compaction-plan.js';
import { validateDependencySession } from '../transaction-dependency-graph.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { prepareStructuredVectorTransactions } from './structured-vector-plan.js';
import { expandStyleAwareInsertTransactions } from './style-aware-insert.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const structuredTransactions=await prepareStructuredVectorTransactions(originalBytes,preparedTransactions);
  const styledTransactions=await expandStyleAwareInsertTransactions(originalBytes,structuredTransactions);
  const dependencySession=validateDependencySession(styledTransactions);
  if(!dependencySession.ok){
    const conflict=dependencySession.conflicts[0];
    throw Object.assign(new Error('This combination of structural edits cannot yet be recomputed safely as one page transaction.'),{code:conflict?.code||'TRANSACTION_DEPENDENCY_UNSAFE',pageIndex:conflict?.pageIndex,conflicts:dependencySession.conflicts});
  }
  const result=await exportEditedPdfCore(originalBytes,styledTransactions,options);
  const compactionTransactions=expandDeletionCompactionTransactions(styledTransactions);
  return applyUpwardCompaction(result,compactionTransactions,{preview:!!options.preview});
}
