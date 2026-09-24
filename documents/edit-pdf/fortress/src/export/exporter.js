import { PDFDocument } from '../core/pdf-lib.js';
import { getPageContentStreams, replacePageContentStream } from '../core/document-model.js';
import { rewriteByteRanges } from '../mutation/content-stream-editor.js';
import { buildReplacementForSourceLine } from '../mutation/text-operator-rewriter.js';
import { validateReplacementLayout } from '../editing/collision-detector.js';
import { validateRoundTrip } from './roundtrip-validator.js';

export async function exportEditedPdf(originalBytes,transactions){
  const doc=await PDFDocument.load(originalBytes.slice(),{ignoreEncryption:true,updateMetadata:false}); const byStream=new Map(); const checks=[]; const warnings=[];
  for(const tx of transactions){
    const block=tx.block; if(block.tier!=='DIRECT_EDIT') throw new Error(`Block ${block.id} is not DIRECT_EDIT: ${block.reason||block.tier}`);
    const layout=validateReplacementLayout(block,tx.replacementUnicode);tx.layoutValidation=layout;if(!layout.ok) throw Object.assign(new Error(layout.message),{code:layout.reason});
    const outputLines=String(tx.replacementUnicode).split('\n'); const sourceLines=block.sourceLines||[];
    if(outputLines.length>sourceLines.length) throw Object.assign(new Error('Replacement requires additional source lines.'),{code:'TEXT_OVERFLOW'});
    for(let lineIndex=0;lineIndex<sourceLines.length;lineIndex++){
      const seq=sourceLines[lineIndex]; if(!seq?.length) continue; const streamIndex=seq[0].streamIndex; const key=`${tx.pageIndex}:${streamIndex}`;
      if(!byStream.has(key)) byStream.set(key,{pageIndex:tx.pageIndex,streamIndex,edits:[]});
      if(lineIndex<outputLines.length){
        const r=buildReplacementForSourceLine(seq,outputLines[lineIndex]); if(!r.success) throw Object.assign(new Error(`Cannot encode replacement: ${r.reason}`),{code:r.reason,unsupportedCharacters:r.unsupportedCharacters});
        byStream.get(key).edits.push({start:r.start,end:r.end,replacement:r.replacement});
      } else {
        byStream.get(key).edits.push({start:seq[0].instrStart,end:seq.at(-1).instrEnd,replacement:''});
      }
    }
    checks.push({pageIndex:tx.pageIndex,newText:tx.replacementUnicode.replace(/\n/g,' '),oldText:tx.originalUnicode.replace(/\n/g,' ')});
  }
  for(const {pageIndex,streamIndex,edits} of byStream.values()){
    const streams=getPageContentStreams(doc,pageIndex);const stream=streams.find(s=>s.streamIndex===streamIndex);if(!stream)throw new Error('SOURCE_STREAM_DISAPPEARED');
    const rewritten=rewriteByteRanges(stream.bytes,edits);const rep=replacePageContentStream(doc,pageIndex,streamIndex,rewritten);if(rep.sharedCloned)warnings.push({code:'SHARED_STREAM_CLONED',pageIndex,streamIndex});
  }
  const bytes=new Uint8Array(await doc.save({useObjectStreams:false,addDefaultPage:false,updateFieldAppearances:false}));
  const validation=await validateRoundTrip(bytes,{expectedPages:doc.getPageCount(),checks});
  if(!validation.ok) throw Object.assign(new Error('Export validation failed'),{validation});
  return {bytes,blob:typeof Blob!=='undefined'?new Blob([bytes],{type:'application/pdf'}):null,validation,warnings};
}
