import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { expandDeletionCompactionTransactions } from './deletion-compaction-plan.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { prepareStructuredVectorTransactions } from './structured-vector-plan.js';
import { expandStyleAwareInsertTransactions } from './style-aware-insert.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const structuredTransactions=await prepareStructuredVectorTransactions(originalBytes,preparedTransactions);
  const styledTransactions=await expandStyleAwareInsertTransactions(originalBytes,structuredTransactions);
  const result=await exportEditedPdfCore(originalBytes,styledTransactions,options);
  const compactionTransactions=expandDeletionCompactionTransactions(styledTransactions);
  return applyUpwardCompaction(result,compactionTransactions,{preview:!!options.preview});
}
