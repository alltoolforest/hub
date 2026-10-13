import PDF from '../assets/vendor/pdf-lib.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {JpegImage} from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import createQpdf from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createQpdfLosslessProvider,runVerifiedLossless} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {runVerifiedImageCompression} from '../assets/js/pdf-compressor-v2/image-compression.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
self.pdfjsWorker={WorkerMessageHandler};
const fontFactory=class {async fetch({filename}){if(!self.QA_FONTS[filename])throw Error('Unsupported font');return decode(self.QA_FONTS[filename]);}};
const reader=createIndependentInputReader({...pdfjs,getDocument:options=>pdfjs.getDocument({...options,StandardFontDataFactory:fontFactory})});
const decodeJpeg=createPDFJpegDecoder(JpegImage);
const provider=createQpdfLosslessProvider(options=>{const url=URL.createObjectURL(new Blob([decode(self.QA_WASM)],{type:'application/wasm'}));return createQpdf({...options,locateFile:()=>url}).finally(()=>URL.revokeObjectURL(url));});
const optimize=async bytes=>{try{return await provider(bytes);}catch(error){self.QA_LAST_ERROR=error.stack??String(error);throw error;}};
self.onmessage=async event=>{
  if(!event.data?.bytes)return;
  const started=performance.now();
  try{
    const {bytes,mode}=event.data;
    const result=mode==='lossless'?await runVerifiedLossless(bytes,{PDF,readPages:reader,
      optimize}):
      await runVerifiedImageCompression(bytes,{PDF,readPages:reader,decodeJpeg,
        encodeJpeg:encodeBrowserJpeg,verifyJpeg:data=>verifyBrowserJpeg(data,{decodeJpeg}),mode});
    self.postMessage({ok:true,result,elapsedMs:Math.round(performance.now()-started)},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,error:error.code??error.message??String(error),diagnostic:self.QA_LAST_ERROR??error.cause?.stack??error.stack??null});}
};
