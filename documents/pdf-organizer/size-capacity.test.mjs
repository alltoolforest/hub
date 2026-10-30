import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildCandidate, assertExpandedStreamBudget} from './engine.js';
import {MAX_PDF_FILE_BYTES, MAX_PDF_SESSION_BYTES, MAX_PDF_PAGES} from './limits.js';

const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const MB=1024*1024;

// Valid PDFs carry a large unfiltered document-level *synthetic test resource*.
// This is not random padding past %%EOF: it is an actual indirect PDF stream,
// so both PDF parsers must handle the real 100 MB input PDF bytes.
async function largePdf(unfilteredBytes){
  const d=await P.PDFDocument.create({updateMetadata:false});
  d.addPage([400,600]).drawText('100 MB CAPACITY BOUNDARY TEST', {x:40,y:480});
  d.catalog.set(P.PDFName.of('SyntheticQAData'),
    d.context.register(d.context.stream(new Uint8Array(unfilteredBytes))));
  return new Uint8Array(await d.save({useObjectStreams:false}));
}
const entry={src:1,page:0,rot:0,blank:false};

test('100 MB per-PDF and combined-session limits are centralized',()=>{
  assert.equal(MAX_PDF_FILE_BYTES,100*MB);
  assert.equal(MAX_PDF_SESSION_BYTES,100*MB);
  assert.equal(MAX_PDF_PAGES,2000);
});

test('accept a valid PDF over 64 MB and close to 100 MB through the production engine', {timeout:180000},async()=>{
  const source=await largePdf(MAX_PDF_FILE_BYTES-256*1024);
  assert(source.length>99*MB&&source.length<=MAX_PDF_FILE_BYTES,
    'PDF should be 99–100 MB, actual '+source.length);
  const start=performance.now();
  const result=await buildCandidate([{id:1,bytes:source}],[entry],P);
  assert(result.length>99*MB);
  const doc=await P.PDFDocument.load(result,{updateMetadata:false,throwOnInvalidObject:true});
  assert.equal(doc.getPageCount(),1);
  assert.equal(doc.catalog.has(P.PDFName.of('SyntheticQAData')),true,
    'document-level source data must survive unchanged');
  const retained=doc.context.lookup(doc.catalog.get(P.PDFName.of('SyntheticQAData')));
  assert.equal(retained.getContents().length,MAX_PDF_FILE_BYTES-256*1024,
    'large content must not be silently removed');
  console.log(JSON.stringify({audit:'near-100MB-PDF-export',sourceBytes:source.length,
    outputBytes:result.length,ms:Math.round(performance.now()-start)}));
});

test('export worker refuses PDFs over 100 MB before PDF parser use', {timeout:10000},async()=>{
  const tooLarge=new Uint8Array(MAX_PDF_FILE_BYTES+1);
  await assert.rejects(buildCandidate([{id:1,bytes:tooLarge}],[entry],P),
    /individual PDFs up to 100 MB/);
});

test('single compressed expansion guard remains at 24 MiB for memory safety',async()=>{
  const d=await P.PDFDocument.create({updateMetadata:false});
  d.addPage([400,600]);
  const raw=Buffer.from('q\\nQ\\n'.repeat(40*MB/4));
  const {deflateSync}=await import('node:zlib');
  const bytes=deflateSync(raw,{level:9});
  const stream=d.context.stream(Uint8Array.from(bytes),{Filter:'FlateDecode'});
  d.getPage(0).node.set(P.PDFName.of('Contents'),d.context.register(stream));
  await assert.rejects(assertExpandedStreamBudget(d,P),/decompression memory budget exceeded/i);
});
