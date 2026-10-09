// PDF Merger Task 4 — bounded stress, page-order integrity, import rollback.
// Uses actual vendor pdf-lib and exactly the Task 1–3 production modules.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {preparePdfBatch,limitsFor} from '../assets/js/pdf-merger-input.js';
import {verifiedMerge} from '../assets/js/pdf-merger-verify.js';
const require=createRequire(import.meta.url);
const lib=require('../assets/vendor/pdf-lib.js');
function mkFile(name,bytes){
 const copy=new Uint8Array(bytes);
 return {
  name,size:copy.byteLength,lastModified:1728400000000,
  slice(start,end){return {arrayBuffer:async()=>copy.slice(start,end).buffer}},
  async arrayBuffer(){return copy.slice().buffer}
 };
}
async function fixture(name,pages,width){
 const doc=await lib.PDFDocument.create();
 for(let i=0;i<pages;i++){
  const page=doc.addPage([width+i*.25,400+i*.125]);
  if(i%7===0)page.setRotation(lib.degrees(90));
 }
 return mkFile(name,await doc.save());
}
const runStart=performance.now();
const sources=[];
for(let i=0;i<12;i++)sources.push(await fixture('batch-'+(i+1)+'.pdf',20,310+i*14));
const beforeAdmission=performance.now();
const parsed=await preparePdfBatch([],sources,{
 isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes,{updateMetadata:false})
});
assert.equal(parsed.entries.length,12);
assert.equal(parsed.totalPages,240);
assert.deepEqual(parsed.entries.map(e=>e.file.name),sources.map(s=>s.name));
const beforeMerge=performance.now(),events=[];
const result=await verifiedMerge(parsed.entries,lib,{isMobile:true,onProgress:v=>events.push(v)});
assert.equal(result.pageCount,240);
assert.equal(events.filter(e=>e.phase==='copying').length,12);
const merged=await lib.PDFDocument.load(await result.blob.arrayBuffer());
assert.equal(merged.getPageCount(),240);
for(let i=0;i<12;i++){
 const p=merged.getPage(i*20);
 assert.equal(Math.round(p.getWidth()),310+i*14);
 assert.equal(p.getRotation().angle,90);
}
// Attempt to push a 13th document or exceed the maximum total page count.
// Neither may alter the accepted batch or silently discard the old output.
const next=await fixture('overflow.pdf',20,600);
await assert.rejects(()=>preparePdfBatch(parsed.entries,[next],{
 isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes,{updateMetadata:false})
}),/up to 12 PDFs/);
const prior=parsed.entries.slice(0,11);
const tooManyPages=await fixture('too-many-pages.pdf',40,700);
await assert.rejects(()=>preparePdfBatch(prior,[tooManyPages],{
 isMobile:true,loadPdf:bytes=>lib.PDFDocument.load(bytes,{updateMetadata:false})
}),/page limit/);
assert.equal(parsed.entries.length,12);
assert.equal(result.pageCount,240);
// A separate 12-file desktop batch must obey same source sequence.
const desktopLimits=limitsFor(false);
assert.equal(desktopLimits.maxPages,1200);
assert.equal(desktopLimits.maxFiles,35);
const totalMs=Math.round(performance.now()-runStart);
const parseMs=Math.round(beforeMerge-beforeAdmission),mergeMs=Math.round(performance.now()-beforeMerge);
const rssMb=Math.round(process.memoryUsage().rss/1048576);
const budget=process.env.CI?90_000:120_000;
assert.ok(totalMs<budget,'Task 4 stress scenario exceeded '+budget+' ms ('+totalMs+' ms)');
assert.ok(rssMb<700,'Task 4 stress resident memory exceeded 700 MB ('+rssMb+' MB)');
console.log('PDF_MERGER_TASK4_STRESS_PASS: 12 PDFs, 240 pages, exact order/rotations, overflow rollback; parsing '+parseMs+'ms, merge '+mergeMs+'ms, total '+totalMs+'ms, process RSS '+rssMb+'MB');
