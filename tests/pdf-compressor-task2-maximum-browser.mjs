// Task 2: actual browser compression and final integrity for Maximum vs Strong.
// Synthetic raster-and-searchable-text fixture; no user document bytes.
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {writeFile,unlink} from 'node:fs/promises';
import {chromium} from 'playwright';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
const width=1600,height=1000,rgb=new Uint8Array(width*height*3);
let seed=12345;
for(let p=0;p<width*height;p++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const y=Math.floor(p/width),x=p%width;
 const ink=(y%70>=9&&y%70<=15&&x>70&&x<1500&&x%56<49);
 const value=ink?25+((seed>>>29)&7):225+((seed>>>27)&15);
 rgb.fill(value,p*3,p*3+3);
}
const doc=await PDF.PDFDocument.create();
const page=doc.addPage([600,800]),N=PDF.PDFName.of;
const scan=doc.context.register(doc.context.stream(new Uint8Array(deflateSync(rgb)),{
 Type:'XObject',Subtype:'Image',Width:width,Height:height,
 BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'FlateDecode'}));
page.node.set(N('Resources'),doc.context.obj({XObject:{Scan:scan}}));
page.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Scan'),PDF.popGraphicsState());
page.drawText('Selectable OCR retained on the original page',{x:30,y:765,size:10});
const bytes=new Uint8Array(await doc.save({useObjectStreams:false}));
const fixture=new URL('./.pdf-compressor-maximum-fixture.pdf',import.meta.url);
await writeFile(fixture,bytes);
const browser=await chromium.launch({headless:true});
try{
 const view=await browser.newPage();
 await view.goto('http://127.0.0.1:8766/tests/',{waitUntil:'domcontentloaded'});
 await view.addScriptTag({url:'/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js'});
 const result=await view.evaluate(async()=>{
  const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const {createIndependentReaders}=await import('/assets/js/pdf-compressor-v2/independent-readers.mjs');
  const {createQpdfLosslessProvider}=await import('/assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs');
  const {compressAndVerifyPDF}=await import('/assets/js/pdf-compressor-v2/output-integrity.mjs');
  const {encodeBrowserJpeg,verifyBrowserJpeg}=await import('/assets/js/pdf-compressor-v2/browser-image-codec.mjs');
  const qpdf=await import('/assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
  const data=new Uint8Array(await (await fetch('/tests/.pdf-compressor-maximum-fixture.pdf')).arrayBuffer());
  const reader=createIndependentReaders(pdfjs),rows=[];
  for(const mode of ['strong','maximum']){
   try{
    const result=await compressAndVerifyPDF(data,{PDF:window.PDFLib,
      ...reader,optimize:createQpdfLosslessProvider(qpdf.default),
      encodeJpeg:encodeBrowserJpeg,mode,
      verifyJpeg:value=>verifyBrowserJpeg(value,{decodeJpeg:async()=>({status:'preserve'})}),
      decodeJpeg:async()=>({status:'preserve'})});
    const reopened=await window.PDFLib.PDFDocument.load(result.bytes,{updateMetadata:false});
    rows.push({mode,status:result.status,inputBytes:result.inputBytes,
      outputBytes:result.outputBytes,savings:result.savedBytes,
      receipt:result.integrity.independentTextVerified,
      pageCount:reopened.getPageCount(),
      imageTransformationApplied:result.settings.imageTransformationApplied});
   }catch(e){return {error:mode+': '+String(e),stack:String(e?.stack).slice(0,1200)};}
  }
  return {rows};
 });
 assert.equal(result.error,undefined,JSON.stringify(result));
 const [strong,maximum]=result.rows;
 assert.equal(strong.mode,'strong');assert.equal(maximum.mode,'maximum');
 assert.equal(maximum.status,'compressed',JSON.stringify(result));
 assert.equal(maximum.receipt,true);assert.equal(maximum.pageCount,1);
 assert.equal(maximum.imageTransformationApplied,true,JSON.stringify(result));
 assert.ok(maximum.outputBytes<=strong.outputBytes,JSON.stringify(result));
 assert.ok(maximum.outputBytes<maximum.inputBytes,JSON.stringify(result));
 console.log(JSON.stringify({task2:'maximum-compression-browser',
   strongBytes:strong.outputBytes,maximumBytes:maximum.outputBytes,
   imageCompression:true,independentTextAndPDFVerified:true}));
}finally{await browser.close();await unlink(fixture).catch(()=>{});}
