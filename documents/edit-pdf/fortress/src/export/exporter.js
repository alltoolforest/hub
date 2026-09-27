import { PDFDocument } from '../core/pdf-lib.js';
import { exportEditedPdf as exportEditedPdfCore } from './exporter-core.js';
import { applyUpwardCompaction } from './upward-compaction-v3.js';
import { addDeletionMarkerCompanions } from './list-marker-companions.js';
import { sanitizeEmbeddedPageSlices } from './embedded-slice-sanitizer.js';
import { validateRoundTrip } from './roundtrip-validator.js';

function validationChecks(transactions){
  return (transactions||[]).map(tx=>tx?.kind==='INSERT_TEXT'
    ?{kind:'insert',pageIndex:Number(tx.pageIndex),newText:String(tx.replacementUnicode||'').replace(/\n/g,' '),oldText:''}
    :{kind:'replace',pageIndex:Number(tx.pageIndex),newText:String(tx?.replacementUnicode||'').replace(/\n/g,' '),oldText:String(tx?.originalUnicode||'').replace(/\n/g,' ')}
  ).filter(x=>Number.isInteger(x.pageIndex)&&x.pageIndex>=0);
}

async function sanitizeUpwardSlices(result,transactions,{preview=false}={}){
  if(!Number(result?.upwardCompactionCount||0))return result;
  const doc=await PDFDocument.load(result.bytes.slice(),{ignoreEncryption:true,updateMetadata:false});
  const cleanup=await sanitizeEmbeddedPageSlices(doc);
  if(!cleanup.metrics.rootForms)return result;
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  let validation=result.validation||null;
  if(!preview){
    validation=await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks:validationChecks(transactions)});
    if(!validation.ok)throw Object.assign(new Error('Extraction-clean upward PDF failed final validation.'),{code:'UPWARD_EXTRACTION_CLEANUP_VALIDATION_FAILED',validation,cleanup});
  }
  return {...result,bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):result.blob||null,validation,warnings:[...(result.warnings||[]),...(cleanup.warnings||[])]};
}

export async function exportEditedPdf(originalBytes,transactions,options={}){
  const preparedTransactions=await addDeletionMarkerCompanions(originalBytes,transactions);
  const result=await exportEditedPdfCore(originalBytes,preparedTransactions,options);
  const compacted=await applyUpwardCompaction(result,preparedTransactions,{preview:!!options.preview});
  return sanitizeUpwardSlices(compacted,preparedTransactions,{preview:!!options.preview});
}
