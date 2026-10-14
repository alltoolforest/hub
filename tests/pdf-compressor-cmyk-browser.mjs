// Synthetic Adobe YCCK fixture; no user-owned PDF content is committed.
// Checks independently verified image recompression, color and text stability.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import {checkRenderedOutput} from './pdf-compressor-task5-render-check.mjs';
const ycck=Buffer.from(`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`,'base64');
assert.equal(ycck[3],0xee);
// Regression for scanned PDFs with a valid JPEG EOI followed by PDF newline.
const paddedYcck=Buffer.concat([ycck,Buffer.from([10])]);
const doc=await PDF.PDFDocument.create(),page=doc.addPage([200,200]);
const N=PDF.PDFName.of;
const image=doc.context.register(doc.context.stream(new Uint8Array(paddedYcck),{
  Type:'XObject',Subtype:'Image',Width:64,Height:64,BitsPerComponent:8,
  ColorSpace:'DeviceCMYK',Filter:'DCTDecode'}));
page.node.set(N('Resources'),doc.context.obj({XObject:{Photo:image}}));
page.pushOperators(PDF.pushGraphicsState(),PDF.scale(200,200),PDF.drawObject('Photo'),PDF.popGraphicsState());
page.drawText('CMYK YCCK TEST',{x:10,y:10,size:8});
const original=new Uint8Array(await doc.save({useObjectStreams:false}));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8766/tests/');
 await page.addScriptTag({url:'/assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js'});
 const r=await page.evaluate(async bytes=>{
   const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
   const {JpegImage}=await import('/node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs');
   const {createPDFJpegDecoder}=await import('/assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs');
   const {createIndependentInputReader}=await import('/assets/js/pdf-compressor-v2/independent-input-reader.mjs');
   const {runVerifiedImageCompression}=await import('/assets/js/pdf-compressor-v2/image-compression.mjs');
   const {encodeBrowserJpeg,verifyBrowserJpeg}=await import('/assets/js/pdf-compressor-v2/browser-image-codec.mjs');
   const decodeJpeg=createPDFJpegDecoder(JpegImage);
   pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
   try{
     const data=new Uint8Array(bytes);
     const result=await runVerifiedImageCompression(data,{PDF:window.PDFLib,
       readPages:createIndependentInputReader(pdfjs),mode:'strong',
       encodeJpeg:encodeBrowserJpeg,decodeJpeg,
       verifyJpeg:value=>verifyBrowserJpeg(value,{decodeJpeg})});
     return {status:result.status,replacements:result.replacements,
       originalBytes:data.length,outputBytes:result.bytes.length,
       output:Array.from(result.bytes)};
   }catch(e){return {error:String(e),stack:e?.stack?.slice(0,1000)};}
 },Array.from(original));
 assert.equal(r.error,undefined,JSON.stringify(r).slice(0,1600));
 assert.equal(r.status,'compressed',JSON.stringify(r).slice(0,1000));
 assert.equal(r.replacements,1);
 const out=new Uint8Array(r.output);
 assert.ok(out.length<original.length);
 const output=await PDF.PDFDocument.load(out);assert.equal(output.getPageCount(),1);
 const before=(await PDF.PDFDocument.load(original)).getPage(0);
 assert.deepEqual(output.getPage(0).getSize(),before.getSize());
 const renderedRMS=await checkRenderedOutput(original,out,'strong');
 console.log(JSON.stringify({status:r.status,input:r.originalBytes,output:r.outputBytes,
  independentlyVerified:true,renderedRMS,sourceEncoding:'Adobe YCCK transform=2'}));
}finally{await browser.close();}
