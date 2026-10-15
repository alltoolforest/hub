import '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import createModule from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {compressAndVerifyPDF,digestPDFBytes} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
import {createIndependentReaders} from '../assets/js/pdf-compressor-v2/independent-readers.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
import {JpegImage} from '../node_modules/pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
const decodeJpeg=createPDFJpegDecoder(JpegImage);
pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
self.onmessage=async event=>{
  if(!event.data?.bytes&&!event.data?.file)return;
  try{
    if((event.data.file?.size??event.data.bytes.length)>100000000)throw {code:'file-limit'};
    const bytes=event.data.file?new Uint8Array(await event.data.file.arrayBuffer()):event.data.bytes;
    if(event.data.op==='inspect'){
      const inspected=await inspectPDFInput(bytes,{PDF:self.PDFLib,readPages:createIndependentInputReader(pdfjs)});
      const report={...inspected,sourceDigest:await digestPDFBytes(bytes)};
      self.postMessage({ok:true,report});return;
    }
    const {readPages,readText}=createIndependentReaders(pdfjs);
    const result=await compressAndVerifyPDF(bytes,{PDF:self.PDFLib,
      readPages,readText,optimize:createQpdfLosslessProvider(createModule),
      encodeJpeg:encodeBrowserJpeg,decodeJpeg,verifyJpeg:data=>verifyBrowserJpeg(data,{decodeJpeg}),
      mode:event.data.mode,onProgress:stage=>self.postMessage({type:'progress',stage})});
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??error.name,message:error.message});}
};
