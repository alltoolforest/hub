import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {verifiedMerge,checkComplexStructure,pdfPageGeometry,sameGeometry,cancellationError} from '../assets/js/pdf-merger-verify.js';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
async function source(name,widths,opts={}){
 const d=await lib.PDFDocument.create();
 const font=await d.embedFont(lib.StandardFonts.Helvetica);
 for(let i=0;i<widths.length;i++){
  const p=d.addPage([widths[i],460+i*20]);
  p.setRotation(lib.degrees(opts.rotation||0));
  if(opts.crop)p.setCropBox(7,12,widths[i]-10,380);
  p.drawText('SOURCE '+name+' PAGE '+(i+1),{x:22,y:225,size:16,font});
  p.drawRectangle({x:25,y:90,width:40,height:40,color:lib.rgb(0.22,0.55,0.2)});
 }
 if(opts.bookmark)d.catalog.set(lib.PDFName.of('Outlines'),d.context.obj({Type:'Outlines'}));
 if(opts.form){d.getForm().createTextField('employee-number').addToPage(d.getPages()[0]);}
 const bytes=await d.save();
 return {file:{name,size:bytes.byteLength,arrayBuffer:async()=>bytes.slice().buffer},pageCount:widths.length};
}
test('ordered merge reopens valid output and preserves page dimensions, rotations and crop',async()=>{
 const b=await source('B',[330,480],{rotation:90,crop:true});
 const a=await source('A',[620],{rotation:180});
 const progress=[];
 const result=await verifiedMerge([b,a],lib,{isMobile:true,onProgress:p=>progress.push(p.phase)});
 assert.equal(result.pageCount,3);
 assert.ok(result.blob.size>200);
 const parsed=await lib.PDFDocument.load(await result.blob.arrayBuffer());
 const pages=parsed.getPages();
 assert.deepEqual(pages.map(p=>Math.round(p.getWidth())),[330,480,620]);
 assert.deepEqual(pages.map(p=>p.getRotation().angle),[90,90,180]);
 assert.equal(pages[0].getCropBox().x,7);
 assert.deepEqual(progress,['copying','copying','saving','verifying','ready']);
});
test('page geometry verifier checks order, rotation and crop box',async()=>{
 const a=(await lib.PDFDocument.load(await (await source('a',[500])).file.arrayBuffer())).getPages()[0];
 const g=pdfPageGeometry(a);
 assert.ok(sameGeometry(g,{...g,crop:{...g.crop}}));
 assert.equal(sameGeometry(g,{...g,width:g.width+50}),false);
 assert.equal(sameGeometry(g,{...g,rotation:90}),false);
 assert.equal(sameGeometry(g,{...g,crop:{...g.crop,x:g.crop.x+2}}),false);
});
test('complex document with bookmarks is rejected rather than quietly dropping links',async()=>{
 const s=await source('bookmarks.pdf',[330],{bookmark:true});
 const plain=await source('plain.pdf',[340]);
 await assert.rejects(()=>verifiedMerge([s,plain],lib),/bookmarks\.pdf.*bookmarks/);
});
test('interactive form fields are rejected rather than silently lost',async()=>{
 const form=await source('form.pdf',[340],{form:true});
 const plain=await source('ordinary.pdf',[310]);
 await assert.rejects(()=>verifiedMerge([form,plain],lib),/form\.pdf.*interactive form/);
});
test('attachment or signature catalog roots receive actionable errors',async()=>{
 const doc=await lib.PDFDocument.create();doc.addPage([480,500]);
 for(const name of ['AF','Perms','OpenAction','Names','AA']){
  const key=lib.PDFName.of(name),original=doc.catalog.get(key);
  doc.catalog.set(key,doc.context.obj({Example:1}));
  assert.throws(()=>checkComplexStructure(doc,lib,'unsafe.pdf'),/unsafe\.pdf/);
  if(original===undefined)doc.catalog.delete(key);else doc.catalog.set(key,original);
 }
});
test('queue page count mismatch prevents publishing a result',async()=>{
 const a=await source('first.pdf',[300]),b=await source('second.pdf',[350]);
 await assert.rejects(()=>verifiedMerge([{...a,pageCount:2},b],lib),/first\.pdf.*changed since selection/);
});
test('cancel before merge starts, and between files, prevents output',async()=>{
 const a=await source('first.pdf',[300]),b=await source('second.pdf',[350]);
 const pre=new AbortController();pre.abort();
 await assert.rejects(()=>verifiedMerge([a,b],lib,{signal:pre.signal}),{name:'AbortError'});
 const ctrl=new AbortController();
 await assert.rejects(()=>verifiedMerge([a,b],lib,{signal:ctrl.signal,onProgress:p=>{
  if(p.phase==='copying'&&p.index===2)ctrl.abort();
 }}),{name:'AbortError'});
 assert.match(cancellationError().message,/previous successful download/);
});
test('post-save PDF validation catches corrupted/unexpected output',async()=>{
 const a=await source('one.pdf',[320]),b=await source('two.pdf',[400]);
 let opens=0;
 const fake={...lib,PDFDocument:{
  create:lib.PDFDocument.create.bind(lib.PDFDocument),
  load:async(bytes,options)=>{
   opens++;
   if(opens===3)return lib.PDFDocument.create(); // wrong output: 0 pages
   return lib.PDFDocument.load(bytes,options);
  }
 }};
 await assert.rejects(()=>verifiedMerge([a,b],fake),/Merged PDF could not be verified.*unexpected number of pages/);
 assert.equal(opens,3);
});
test('bad saved byte content never escapes to a download',async()=>{
 const a=await source('one.pdf',[320]),b=await source('two.pdf',[400]);
 const bogus={...lib,PDFDocument:{
  load:lib.PDFDocument.load.bind(lib.PDFDocument),
  create:async()=>({
   getPageCount:()=>2,copyPages:async()=>[],addPage(){},save:async()=>new Uint8Array([1,2,3])
  })
 }};
 await assert.rejects(()=>verifiedMerge([a,b],bogus),/Merged PDF could not be verified.*No new download was created/);
});
test('safe page and file limits enforced even if UI is bypassed',async()=>{
 const a=await source('first.pdf',[300]);
 const large=Array.from({length:36},()=>a);
 await assert.rejects(()=>verifiedMerge(large,lib),/Too many source documents/);
 await assert.rejects(()=>verifiedMerge([a],lib),/two PDFs/);
});
test('all errors are source-specific, and do not echo source content',async()=>{
 const original=await source('damaged.pdf',[300]),other=await source('valid.pdf',[350]);
 const fake={...lib,PDFDocument:{
  create:lib.PDFDocument.create.bind(lib.PDFDocument),
  load:async(bytes)=>{
   if(bytes.byteLength===original.file.size)throw Error('Secret PDF content\nPERSONAL NOTE');
   return lib.PDFDocument.load(bytes);
  }
 }};
 await assert.rejects(()=>verifiedMerge([original,other],fake),e=>
  /damaged\.pdf/.test(e.message)&&!/PERSONAL NOTE/.test(e.message));
});
test('Task 2 leaves Task 1 input validation untouched and shared PDF dispatcher isolated',()=>{
 const merger=readFileSync(new URL('../assets/js/pdf-merger.js',import.meta.url),'utf8');
 const dispatch=readFileSync(new URL('../assets/js/pdf.js',import.meta.url),'utf8');
 assert.match(merger,/verifiedMerge\(snapshot,engine/);
 assert.match(merger,/output\(result\.blob,'merged\.pdf'\)/);
 assert.match(merger,/markOldResult\(\)/);
 assert.match(merger,/Cancel merge/);
 assert.match(dispatch,/if\(slug==='pdf-merger'\).*pdf-merger\.js/);
 assert.doesNotMatch(merger,/clearOutputs\(\);await (?:process|verifiedMerge)\(/);
});
