import '../assets/vendor/pdf-lib.js';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {runVerifiedImageCompression} from '../assets/js/pdf-compressor-v2/image-compression.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
self.onmessage=async event=>{
  if(!event.data?.bytes)return;
  try{
    const result=await runVerifiedImageCompression(event.data.bytes,{PDF:self.PDFLib,
      readPages:createIndependentInputReader(pdfjs),encodeJpeg:encodeBrowserJpeg,
      verifyJpeg:verifyBrowserJpeg,mode:event.data.mode});
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??error.name,message:error.message});}
};
