import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { prepareStructuredVectorTransactions } from './structured-vector-plan.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const structuredTransactions=await prepareStructuredVectorTransactions(originalBytes,preparedTransactions);
  const result=await exportEditedPdfCore(originalBytes,structuredTransactions,options);
  return applyUpwardCompaction(result,structuredTransactions,{preview:!!options.preview});
}
