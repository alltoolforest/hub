import '../assets/vendor/pdf-lib.js';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import createModule from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
import {JpegImage} from '../node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
const decodeJpeg=createPDFJpegDecoder(JpegImage);
pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
self.onmessage=async event=>{
  if(!event.data?.bytes)return;
  try{
    if(event.data.op==='inspect'){
      const report=await inspectPDFInput(event.data.bytes,{PDF:self.PDFLib,readPages:createIndependentInputReader(pdfjs)});
      self.postMessage({ok:true,report});return;
    }
    if(event.data.op!=='compress')throw Error('unsupported-operation');
    const result=await compressAndVerifyPDF(event.data.bytes,{PDF:self.PDFLib,
      readPages:createIndependentInputReader(pdfjs),readText:createIndependentTextReader(pdfjs),optimize:createQpdfLosslessProvider(createModule),
      encodeJpeg:encodeBrowserJpeg,decodeJpeg,verifyJpeg:data=>verifyBrowserJpeg(data,{decodeJpeg}),
      mode:event.data.mode});
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??error.name,message:error.message});}
};
