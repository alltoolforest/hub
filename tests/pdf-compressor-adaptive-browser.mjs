// Full oversized-image compression probe: actual browser JPEG, preserved PDF
// structure and independent reader. Not a production deployment test.
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {writeFile,unlink} from 'node:fs/promises';
import {chromium} from 'playwright';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
const width=3400,height=3400,raw=new Uint8Array(width*height*3);
let seed=53;
for(let i=0;i<raw.length;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  raw[i]=seed>>>24;
}
const doc=await PDF.PDFDocument.create(),N=PDF.PDFName.of;
const pageDoc=doc.addPage([600,800]);
const ref=doc.context.register(doc.context.stream(new Uint8Array(deflateSync(raw)),{
  Type:'XObject',Subtype:'Image',Width:width,Height:height,
  BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'FlateDecode'}));
pageDoc.node.set(N('Resources'),doc.context.obj({XObject:{Scan:ref}}));
pageDoc.pushOperators(PDF.pushGraphicsState(),PDF.scale(600,800),PDF.drawObject('Scan'),PDF.popGraphicsState());
const input=new Uint8Array(await doc.save({useObjectStreams:false}));
assert.ok(input.length<100000000);
const fixture=new URL('./.pdf-compressor-adaptive-fixture.pdf',import.meta.url);
await writeFile(fixture,input);
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8766/tests/',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:'/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js'});
  const result=await page.evaluate(async()=>{
    const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    const {createIndependentInputReader}=await import('/assets/js/pdf-compressor-v2/independent-input-reader.mjs');
    const {runVerifiedImageCompression}=await import('/assets/js/pdf-compressor-v2/image-compression.mjs');
    const {encodeBrowserJpeg,verifyBrowserJpeg}=await import('/assets/js/pdf-compressor-v2/browser-image-codec.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
    const readPages=createIndependentInputReader(pdfjs),
      data=new Uint8Array(await (await fetch('/tests/.pdf-compressor-adaptive-fixture.pdf')).arrayBuffer());
    try{
      const result=await runVerifiedImageCompression(data,{
        PDF:window.PDFLib,readPages,mode:'strong',encodeJpeg:encodeBrowserJpeg,
        decodeJpeg:async()=>({status:'preserve'}),
        verifyJpeg:input=>verifyBrowserJpeg(input,{decodeJpeg:async()=>({status:'preserve'})})});
      const {createIndependentReaders}=await import('/assets/js/pdf-compressor-v2/independent-readers.mjs');
      const {createQpdfLosslessProvider}=await import('/assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs');
      const {compressAndVerifyPDF}=await import('/assets/js/pdf-compressor-v2/output-integrity.mjs');
      const qpdf=await import('/assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs');
      const readers=createIndependentReaders(pdfjs);
      const final=await compressAndVerifyPDF(data,{PDF:window.PDFLib,
        ...readers,optimize:createQpdfLosslessProvider(qpdf.default),
        mode:'strong',encodeJpeg:encodeBrowserJpeg,decodeJpeg:async()=>({status:'preserve'}),
        verifyJpeg:input=>verifyBrowserJpeg(input,{decodeJpeg:async()=>({status:'preserve'})})});
      return {status:result.status,inputBytes:data.length,outputBytes:result.bytes.length,
        replacements:result.replacements,finalStatus:final.status,finalBytes:final.outputBytes,
        integrityVerified:final.integrity?.independentTextVerified};
    }catch(e){return {error:String(e),stack:String(e?.stack).slice(0,1200)};}
  });
  assert.equal(result.error,undefined,JSON.stringify(result));
  assert.equal(result.status,'compressed',JSON.stringify(result));
  assert.ok(result.outputBytes<result.inputBytes,JSON.stringify(result));
  assert.equal(result.replacements,1);
  assert.equal(result.finalStatus,'compressed',JSON.stringify(result));
  assert.ok(result.finalBytes<result.inputBytes,JSON.stringify(result));
  assert.equal(result.integrityVerified,true);
  console.log(JSON.stringify(result));
}finally{await browser.close();await unlink(fixture).catch(()=>{}); }
