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
  // Keep form pages and widget coordinates stable. Native text edits that fit
  // their existing regions remain available; form-aware reflow is not implied.
  if(flags.hasAcroForm||flags.formWidgets.length){
    if(result.reflowMetrics?.some(m=>Number(m.delta)||Number(m.shiftY)||m.overflowPageCount))throw Object.assign(new Error('This edit would move content in a PDF containing form fields. Shorten the text or use a smaller font.'),{code:'PDF_FORM_REFLOW_PROTECTED'});
    await verifyFormPreservation(originalBytes,result.bytes);
    return result;
  }
  return applyUpwardCompaction(result,styledTransactions,{preview:!!options.preview});
}
