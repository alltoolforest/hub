// Isolated engine compatibility test worker; not the production lifecycle/UI.
import '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import createModule from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createQpdfLosslessProvider,runVerifiedLossless} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
self.onmessage=async event=>{
  try{
    const result=await runVerifiedLossless(event.data.bytes,{PDF:self.PDFLib,
      readPages:createIndependentInputReader(pdfjs),optimize:createQpdfLosslessProvider(createModule)});
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??error.name,message:error.message,
    diagnostic:error.cause?.message??null});}
};
