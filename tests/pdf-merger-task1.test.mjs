import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PDF_MERGER_LIMITS,inputLimits,limitsFor,validatePdfFile,preparePdfBatch,describePdfError} from '../assets/js/pdf-merger-input.js';
const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const file=(name,bytes,lastModified=10)=>({
 name, size:bytes.length,lastModified,
 slice:(from,to)=>({arrayBuffer:async()=>bytes.slice(from,to).buffer}),
 arrayBuffer:async()=>bytes.slice().buffer
});
async function pdf(name,pages=1){
 const doc=await PDFLib.PDFDocument.create();
 for(let i=0;i<pages;i++)doc.addPage([i+350,500]);
 return file(name,new Uint8Array(await doc.save()));
}
const loadPdf=bytes=>PDFLib.PDFDocument.load(bytes,{updateMetadata:false});

test('device limits are conservative and include file, combined size, count and total pages',()=>{
 assert.equal(limitsFor(true).maxFiles,12);
 assert.equal(limitsFor(false).maxFiles,35);
 assert.equal(PDF_MERGER_LIMITS.mobile.maxTotalBytes,60*1024*1024);
 assert.equal(PDF_MERGER_LIMITS.desktop.maxTotalBytes,200*1024*1024);
 assert.equal(PDF_MERGER_LIMITS.mobile.maxPages,250);
 assert.equal(PDF_MERGER_LIMITS.desktop.maxPages,1200);
});
test('valid PDF returns correct parsed page count',async()=>{
 const source=await pdf('first.pdf',3);
 assert.equal(await validatePdfFile(source,loadPdf,limitsFor(true)),3);
});
test('multiple valid files preserve incoming selection order',async()=>{
 const a=await pdf('a.pdf',2),b=await pdf('b.pdf',4);
 const x=await preparePdfBatch([],[b,a],{loadPdf,isMobile:true});
 assert.deepEqual(x.entries.map(e=>e.file.name),['b.pdf','a.pdf']);
 assert.deepEqual(x.entries.map(e=>e.pageCount),[4,2]);
 assert.equal(x.totalPages,6);
});
test('selected batch is not committed on any bad file',async()=>{
 const old=await pdf('old.pdf',1),good=await pdf('new.pdf',1);
 const existing=[{file:old,pageCount:1}];
 const bad=file('bad.pdf',new TextEncoder().encode('Not a PDF file'));
 await assert.rejects(()=>preparePdfBatch(existing,[good,bad],{loadPdf,isMobile:true}),/bad.pdf.*not a PDF/);
 assert.deepEqual(existing.map(e=>e.file.name),['old.pdf']);
 assert.equal(existing[0].pageCount,1);
});
test('valid-looking PDF header followed by broken bytes is rejected',async()=>{
 const fake=file('fake.pdf',new TextEncoder().encode('%PDF-1.7\nthis is broken'));
 await assert.rejects(()=>preparePdfBatch([],[fake],{loadPdf}),/fake.pdf.*could not be read/);
});
test('extension spoofing and zero-byte PDF are rejected',async()=>{
 await assert.rejects(()=>preparePdfBatch([],[file('paper.txt',new Uint8Array([1,2,3]))],{loadPdf}),/paper.txt/);
 await assert.rejects(()=>preparePdfBatch([],[file('empty.pdf',new Uint8Array([]))],{loadPdf}),/empty.pdf.*empty/);
});
test('encrypted/password errors have a file-specific actionable explanation',async()=>{
 const f=await pdf('locked.pdf');
 await assert.rejects(()=>preparePdfBatch([],[f],{loadPdf:()=>{throw Error('Input document is encrypted')}}),/locked.pdf.*password-protected.*Unlock/);
 assert.match(describePdfError(f,Error('password needed')).message,/locked.pdf/);
});
test('zero-page parser result is rejected before queue admission',async()=>{
 const source=await pdf('no-pages.pdf');
 await assert.rejects(()=>preparePdfBatch([],[source],{
  loadPdf:async()=>({getPageCount:()=>0})
 }),/no-pages.pdf.*no usable PDF pages/);
});
test('all input limits reject early, before trying to read large data',async()=>{
 let reads=0;const small=await pdf('small.pdf');
 const oversized={name:'large.pdf',size:31*1024*1024,lastModified:1,slice(){reads++;throw Error('should not read')}};
 await assert.rejects(()=>preparePdfBatch([],[oversized],{loadPdf,isMobile:true}),/large.pdf.*per-file/);
 assert.equal(reads,0);
 const existing=Array.from({length:12},(_,i)=>({file:{...small,name:'item'+i+'.pdf',size:512,lastModified:i},pageCount:1}));
 await assert.rejects(()=>preparePdfBatch(existing,[small],{loadPdf,isMobile:true}),/up to 12/);
 assert.equal(reads,0);
});
test('over combined size keeps existing queue intact',async()=>{
 const original=await pdf('first.pdf');
 const previous=[{file:{...original,size:58*1024*1024},pageCount:1}];
 const next={name:'valid.pdf',size:4*1024*1024,lastModified:20};
 await assert.rejects(()=>preparePdfBatch(previous,[next],{loadPdf,isMobile:true}),/Combined PDFs exceed/);
 assert.equal(previous.length,1);
 assert.equal(previous[0].file.name,'first.pdf');
});
test('over page limit rejects a batch without mutating existing entries',async()=>{
 const source=await pdf('over.pdf',3),previous=[{file:await pdf('keep.pdf'),pageCount:249}];
 await assert.rejects(()=>preparePdfBatch(previous,[source],{loadPdf,isMobile:true}),/page limit.*250/);
 assert.equal(previous[0].pageCount,249);
});
test('same name, size, timestamp duplicates are skipped but distinct files remain allowed',async()=>{
 const a=await pdf('a.pdf'),b=await pdf('b.pdf');
 const x=await preparePdfBatch([],[a,a,b],{loadPdf,isMobile:true});
 assert.equal(x.added,2);
 assert.deepEqual(x.skipped,['a.pdf']);
 const second=await preparePdfBatch(x.entries,[a],{loadPdf,isMobile:true});
 assert.equal(second.added,0);
 assert.deepEqual(second.skipped,['a.pdf']);
});
test('validation does not retain full source ArrayBuffers in queue metadata',async()=>{
 const x=await preparePdfBatch([],[await pdf('a.pdf')],{loadPdf,isMobile:true});
 assert.deepEqual(Object.keys(x.entries[0]),['file','pageCount']);
});
test('PDF Merger routing remains isolated from frozen document tools',()=>{
 const shared=readFileSync(new URL('../assets/js/pdf.js',import.meta.url),'utf8');
 assert.match(shared,/if\(slug==='pdf-merger'\)return \(await import\('\.\/pdf-merger\.js'\)\)\.mount\(root\)/);
 assert.match(shared,/if\(slug==='edit-pdf'\)return mountEditor\(root\)/);
 assert.match(shared,/if\(slug==='image-to-text'\)/);
});
test('file upload UI uses validated batch result and retains old merge engine operation',()=>{
 const merger=readFileSync(new URL('../assets/js/pdf-merger.js',import.meta.url),'utf8');
 assert.match(merger,/const result=await preparePdfBatch\(files,selected/);
 assert.match(merger,/if\(result\.entries\.length\)files=\[\.\.\.files,\.\.\.result\.entries\]/);
 assert.match(merger,/for\(const page of await out\.copyPages\(source,source\.getPageIndices\(\)\)\)out\.addPage\(page\)/);
 assert.match(merger,/clearOutputs\(\);await process\(\)/);
});
