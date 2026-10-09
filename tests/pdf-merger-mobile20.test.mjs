import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PDF_MERGER_LIMITS,limitsFor,preparePdfBatch} from '../assets/js/pdf-merger-input.js';
import {shouldUsePdfMergeWorker,mergePdfBatch} from '../assets/js/pdf-merger-runner.js';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
async function fixture(name,pages=1){
 const document=await lib.PDFDocument.create();
 for(let i=0;i<pages;i++)document.addPage([300+i,500]);
 const data=new Uint8Array(await document.save());
 return {name,size:data.length,lastModified:Date.now(),
  slice:(start,end)=>({arrayBuffer:async()=>data.slice(start,end).buffer}),
  arrayBuffer:async()=>data.slice().buffer};
}
test('mobile and desktop share count, byte, page and individual file limits',()=>{
 assert.equal(PDF_MERGER_LIMITS.mobile.maxFiles,35);
 assert.equal(PDF_MERGER_LIMITS.mobile.maxPages,1200);
 assert.equal(PDF_MERGER_LIMITS.mobile.maxTotalBytes,200*1024**2);
 assert.equal(PDF_MERGER_LIMITS.mobile.maxFileBytes,100*1024**2);
 assert.deepEqual(limitsFor(true),limitsFor(false));
});
test('20 ordinary PDFs pass mobile transactional validation',async()=>{
 const files=await Promise.all(Array.from({length:20},(_,i)=>fixture('mobile-'+i+'.pdf',20)));
 const batch=await preparePdfBatch([],files,{isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes)});
 assert.equal(batch.entries.length,20);
 assert.equal(batch.totalPages,400);
 assert.equal(batch.skipped.length,0);
 assert.deepEqual(batch.entries.map(x=>x.file.name),files.map(x=>x.name));
 assert.equal(shouldUsePdfMergeWorker(batch.entries),true);
});
test('background engine threshold protects longer, larger and multi-page jobs',()=>{
 const make=(size,pageCount=1)=>({file:{size},pageCount});
 assert.equal(shouldUsePdfMergeWorker(Array.from({length:12},()=>make(1))),false);
 assert.equal(shouldUsePdfMergeWorker(Array.from({length:13},()=>make(1))),true);
 assert.equal(shouldUsePdfMergeWorker([make(49*1024**2),make(1)]),true);
 assert.equal(shouldUsePdfMergeWorker([make(1,299),make(1,1)]),true);
});
test('without worker support verified merge still operates in browser main-thread fallback',async()=>{
 const docs=await Promise.all([fixture('a.pdf',2),fixture('b.pdf',3)]);
 const batch=await preparePdfBatch([],docs,{isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes)});
 const result=await mergePdfBatch(batch.entries,{isMobile:true,loadEngine:async()=>lib});
 assert.equal(result.pageCount,5);
 assert.equal((await lib.PDFDocument.load(await result.blob.arrayBuffer())).getPageCount(),5);
});
test('pre-aborted signal prevents creating an output',async()=>{
 const docs=await Promise.all([fixture('a.pdf'),fixture('b.pdf')]);
 const batch=await preparePdfBatch([],docs,{isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes)});
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>mergePdfBatch(batch.entries,{
  isMobile:true,signal:controller.signal,loadEngine:async()=>lib
 }),{name:'AbortError'});
});
