import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {verifyFinalOutput,digestPDFBytes,compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
const options={PDF,readPages:createIndependentInputReader(pdfjs),readText:createIndependentTextReader(pdfjs)};
const raw=(await buildFixture('digital')).bytes;
const source=new Uint8Array(Buffer.concat([raw,Buffer.from('\n%'+'.'.repeat(20000)+'\n%%EOF\n')]));
const report=bytes=>({bytes,mode:'balanced',status:'compressed',inputBytes:source.length,
  outputBytes:bytes.length,savedBytes:source.length-bytes.length});
test('final receipt binds independently readable bytes and exact text/geometry to measured sizes',async()=>{
  const receipt=await verifyFinalOutput(source,report(raw),options);
  assert.equal(receipt.outputDigest,await digestPDFBytes(raw));
  assert.equal(receipt.sourceDigest,await digestPDFBytes(source));
  assert.equal(receipt.pageCount,3);assert.equal(Object.isFrozen(receipt),true);
});
test('corrupt bytes, inaccurate reports and same-size altered original fallback are withheld',async()=>{
  const corrupted=raw.slice();corrupted[0]=0;
  await assert.rejects(verifyFinalOutput(source,report(corrupted),options));
  await assert.rejects(verifyFinalOutput(source,{...report(raw),savedBytes:0},options),e=>e.code==='invalid-output-report');
  const altered=source.slice();altered[20]^=1;
  await assert.rejects(verifyFinalOutput(source,{...report(altered),status:'original-retained'},options),e=>e.code==='false-original-fallback');
  await assert.rejects(verifyFinalOutput(source,report(raw),{...options,signal:AbortSignal.abort()}),e=>e.code==='cancelled');
});
test('same-count native text mutation cannot pass final independent text validation',async()=>{
  const doc=await PDF.PDFDocument.load(raw,{updateMetadata:false});let modified=false;
  for(const [ref,stream] of doc.context.enumerateIndirectObjects()){
    if(!(stream instanceof PDF.PDFRawStream))continue;
    const data=PDF.decodePDFRawStream(stream).decode();
    const text=new TextDecoder().decode(data);
    if(!/<[0-9a-f]+> Tj/i.test(text))continue;
    const changed=text.replace(/<([0-9a-f]+)> Tj/i,(_,hex)=>'<'+(hex.slice(0,2)==='65'?'64':'65')+hex.slice(2)+'> Tj');
    doc.context.assign(ref,PDF.PDFRawStream.of(stream.dict.clone(doc.context),new Uint8Array(deflateSync(new TextEncoder().encode(changed)))));
    modified=true;break;
  }
  assert.equal(modified,true);
  const changed=new Uint8Array(await doc.save({useObjectStreams:false}));
  await assert.rejects(verifyFinalOutput(source,report(changed),options),e=>e.code==='final-text-or-geometry-changed');
});
test('text budgets apply across pages and reject excessive content',async()=>{
  const reader=createIndependentTextReader(pdfjs);
  await assert.rejects(reader(raw,{maxCharacters:1}),e=>e.code==='text-character-limit');
  await assert.rejects(reader(raw,{maxPages:1}),e=>e.code==='text-page-limit');
});
test('an optimizer changing metadata cannot reach a verified final result',async()=>{
  await assert.rejects(compressAndVerifyPDF(source,{...options,mode:'lossless',
    optimize:async input=>{
      const doc=await PDF.PDFDocument.load(input,{updateMetadata:false});
      doc.setTitle('ALTERED');
      return new Uint8Array(await doc.save({useObjectStreams:true}));
    }}),e=>e.code==='preservation-check-failed');
});
