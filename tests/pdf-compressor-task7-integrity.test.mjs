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

test('operation page reports are bound to bytes and limits, isolated, and never reused after cancellation',async()=>{
 const {createOperationPageReader}=await import('../assets/js/pdf-compressor-v2/operation-page-reader.mjs');
 let calls=0;const reader=createOperationPageReader(async()=>{calls++;return {pages:[{textItems:1}]};});
 const bytes=new Uint8Array([1,2,3]);const a=await reader(bytes,{maxPages:5});a.pages[0].textItems=99;
 assert.equal((await reader(bytes.slice(),{maxPages:5})).pages[0].textItems,1);assert.equal(calls,1);
 bytes[0]=9;await reader(bytes,{maxPages:5});assert.equal(calls,2);
 await reader(bytes,{maxPages:4});assert.equal(calls,3);
 const controller=new AbortController();controller.abort();
 await assert.rejects(reader(bytes,{maxPages:4,signal:controller.signal}));assert.equal(calls,3);
 const second=createOperationPageReader(async()=>{calls++;return {pages:[]};});await second(bytes,{maxPages:4});assert.equal(calls,4);
});

test('combined independent readers reuse exact text only for the same bytes and standard limits',async()=>{
 const {createIndependentReaders}=await import('../assets/js/pdf-compressor-v2/independent-readers.mjs');
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');let loads=0;
 const parser={...pdfjs,getDocument:options=>{loads++;return pdfjs.getDocument(options);}};
 const readers=createIndependentReaders(parser),bytes=(await buildFixture('digital')).bytes;
 const independent=createIndependentTextReader(pdfjs);
 await readers.readPages(bytes);const text=await readers.readText(bytes);
 assert.equal(loads,1);assert.deepEqual(text,await independent(bytes));
 text[0]='changed';assert.notEqual((await readers.readText(bytes))[0],'changed');
 await assert.rejects(readers.readText(bytes,{maxCharacters:1}),e=>e.code==='text-character-limit');assert.equal(loads,2);
 const other=(await buildFixture('mixed')).bytes;await readers.readText(other);assert.equal(loads,3);
 const abort=new AbortController();abort.abort();await assert.rejects(readers.readText(bytes,{signal:abort.signal}));
});

test('operation inspection reuse cannot bypass byte changes, stricter limits or cancellation',async()=>{
 const {createOperationInspector}=await import('../assets/js/pdf-compressor-v2/operation-inspector.mjs');
 const {INPUT_LIMITS}=await import('../assets/js/pdf-compressor-v2/input-inspector.mjs');
 let calls=0;const inspect=createOperationInspector({PDF,readPages:async(...args)=>{calls++;return options.readPages(...args);}});
 const bytes=(await buildFixture('digital')).bytes;
 const a=await inspect(bytes);a.pageCount=999;assert.notEqual((await inspect(bytes.slice())).pageCount,999);assert.equal(calls,1);
 await assert.rejects(inspect(bytes,{limits:{...INPUT_LIMITS,maxBytes:16}}),e=>e.code==='file-limit');
 await inspect((await buildFixture('mixed')).bytes);assert.equal(calls,2);
 const abort=new AbortController();abort.abort();await assert.rejects(inspect(bytes,{signal:abort.signal}));
});
