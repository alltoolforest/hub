import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { prepareStructuredVectorTransactions } from './structured-vector-plan.js';
import { expandStyleAwareInsertTransactions } from './style-aware-insert.js';
import {PDFDocument} from '../core/pdf-lib.js';
import {detectDocumentFlags} from '../core/document-model.js';
import {verifyFormPreservation} from '../core/form-protection.js';

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const source=await PDFDocument.load(originalBytes.slice(),{updateMetadata:false});
  const flags=detectDocumentFlags(source);
  if(transactions.length&&(flags.signed||flags.encrypted))throw new Error('Signed or encrypted PDFs cannot be edited directly.');
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const structuredTransactions=await prepareStructuredVectorTransactions(originalBytes,preparedTransactions);
  const styledTransactions=await expandStyleAwareInsertTransactions(originalBytes,structuredTransactions);
  const result=await exportEditedPdfCore(originalBytes,styledTransactions,options);
  const hasForms=flags.hasAcroForm||flags.formWidgets.length;
  if(hasForms){
    const moved=(result.reflowMetrics||[]).filter(m=>Number(m.delta)||Number(m.shiftY)||Number(m.cascadedPageCount)||Number(m.appendedPageCount)||Number(m.overflowPageCount));
    if(moved.some(m=>!flags.formSafetyKnown||((Number(m.cascadedPageCount)||Number(m.appendedPageCount)||Number(m.overflowPageCount))&&!m.flowSlices)))throw Object.assign(new Error('Page cascades in PDFs with form fields remain protected.'),{code:'PDF_FORM_REFLOW_PROTECTED'});
    // Unknown/XFA form geometry cannot establish a safe moving band.
    if(!flags.formSafetyKnown&&styledTransactions.some(tx=>tx.kind==='REPLACE_TEXT'&&!String(tx.replacementUnicode||'').trim())){await verifyFormPreservation(originalBytes,result.bytes);return result;}
  }
  const final=await applyUpwardCompaction(result,styledTransactions,{preview:!!options.preview});
  if(hasForms)await verifyFormPreservation(originalBytes,final.bytes,{reflowMetrics:final.reflowMetrics||[]});
  return final;
}
