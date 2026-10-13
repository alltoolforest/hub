import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {JpegImage} from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import createQpdf from '../assets/js/pdf-compressor-v2/vendor/qpdf/qpdf.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {DEVICE_PROFILES} from '../assets/js/pdf-compressor-v2/device-policy.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {encodeBrowserJpeg,verifyBrowserJpeg} from '../assets/js/pdf-compressor-v2/browser-image-codec.mjs';
const decode=s=>{const raw=atob(s),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
self.pdfjsWorker={WorkerMessageHandler};
const fontFactory=class {async fetch({filename}){if(!self.QA_FONTS[filename])throw Error('Unsupported font');return decode(self.QA_FONTS[filename]);}};
const parser={...pdfjs,getDocument:options=>pdfjs.getDocument({...options,StandardFontDataFactory:fontFactory})};
const reader=createIndependentInputReader(parser),readText=createIndependentTextReader(parser);
const decodeJpeg=createPDFJpegDecoder(JpegImage);
const progress=stage=>self.postMessage({type:'progress',stage});
const optimize=createQpdfLosslessProvider(options=>{const url=URL.createObjectURL(new Blob([decode(self.QA_WASM)],{type:'application/wasm'}));return createQpdf({...options,locateFile:()=>url}).then(module=>{progress('lossless-optimization');return module;}).finally(()=>URL.revokeObjectURL(url));});
self.onmessage=async event=>{
  if(!event.data?.bytes&&!event.data?.file)return;
  const started=performance.now();
  try{
    const {mode}=event.data;
    const profile=DEVICE_PROFILES[event.data.profile];if(!profile)throw Error('unsupported-device-profile');
    const size=event.data.file?.size??event.data.bytes.length;
    if(size>profile.limits.maxBytes)throw {code:'file-limit'};
    const bytes=event.data.file?new Uint8Array(await event.data.file.arrayBuffer()):event.data.bytes;
    if(event.data.op==='inspect'){
      progress('inspect');const report=await inspectPDFInput(bytes,{PDF,readPages:reader,limits:profile.limits});
      self.postMessage({ok:true,report});return;
    }
    if(event.data.op!=='compress')throw Error('unsupported-operation');
    const result=await compressAndVerifyPDF(bytes,{PDF,readPages:reader,readText,optimize,decodeJpeg,
      encodeJpeg:encodeBrowserJpeg,verifyJpeg:data=>verifyBrowserJpeg(data,{decodeJpeg}),mode,limits:profile.limits,onProgress:progress});
    result.engineMs=Math.round(performance.now()-started);
    self.postMessage({ok:true,result},[result.bytes.buffer]);
  }catch(error){self.postMessage({ok:false,code:error.code??'processing-failed'});}
};
