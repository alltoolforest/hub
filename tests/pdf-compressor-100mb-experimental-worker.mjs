import '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import createModule from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {INPUT_LIMITS} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
import {JpegImage} from '../node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
let diagnostic=null;
const provider=createQpdfLosslessProvider(createModule,{maximumBytes:100000000});
const optimize=async bytes=>{try{return await provider(bytes);}catch(e){diagnostic=e.message;throw e;}};
const decodeJpeg=createPDFJpegDecoder(JpegImage);
pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
self.onmessage=async event=>{
  if(!event.data?.bytes)return;
  try{
    const result=await compressAndVerifyPDF(event.data.bytes,{PDF:self.PDFLib,
      readPages:createIndependentInputReader(pdfjs),readText:createIndependentTextReader(pdfjs),optimize,
      encodeJpeg:encodeBrowserJpeg,decodeJpeg,verifyJpeg:data=>verifyBrowserJpeg(data,{decodeJpeg}),
      limits:{...INPUT_LIMITS,maxBytes:100000000},mode:event.data.mode});
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??error.name,message:error.message,diagnostic});}
};
