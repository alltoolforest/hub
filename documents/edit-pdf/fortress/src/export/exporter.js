import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const result=await exportEditedPdfCore(originalBytes,preparedTransactions,options);
  return applyUpwardCompaction(result,preparedTransactions,{preview:!!options.preview});
}
