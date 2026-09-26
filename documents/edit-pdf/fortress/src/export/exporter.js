import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const result=await exportEditedPdfCore(originalBytes,transactions,options);
  return applyUpwardCompaction(result,transactions,{preview:!!options.preview});
}
