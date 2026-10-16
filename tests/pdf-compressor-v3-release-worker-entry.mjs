// Production-candidate V3 worker. Built from pinned local PDF.js/PDF-lib only.
// Neither benchmark allow-all callbacks nor user files are uploaded.
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {WorkerMessageHandler} from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createImageOutputVerifier} from '../assets/js/pdf-compressor-v2/image-output-verifier.mjs';
import {inspectV3Source} from '../assets/js/pdf-compressor-v3/security-preflight.mjs';
import {rasterizePdfAggressively,installV3StreamIterator} from '../assets/js/pdf-compressor-v3/aggressive-raster-core.mjs';
import {recompressJpegXObjects} from '../assets/js/pdf-compressor-v3/nonflatten-jpeg-recode.mjs';
import {selectSmallestVerifiedPDF} from '../assets/js/pdf-compressor-v3/strategy-selector.mjs';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
const MAX_INPUT_BYTES=100_000_000;
const decode=s=>{const raw=atob(s),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;};
self.pdfjsWorker={WorkerMessageHandler};
const fontFactory=class {
 async fetch({filename}){
   if(!Object.hasOwn(self.V3_FONTS??{},filename))throw Error('unsupported-font');
   return decode(self.V3_FONTS[filename]);
 }
};
const parser={...pdfjs,getDocument:options=>pdfjs.getDocument({
 ...options,StandardFontDataFactory:fontFactory,isEvalSupported:false
})};
installV3StreamIterator(self);
const progress=(stage,detail)=>self.postMessage({type:'progress',stage,detail});
const safeError=error=>{
 const code=typeof error?.code==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(error.code)?
   error.code:'processing-failed';
 return {type:'error',code};
};
async function verifyCandidate({bytes,original,destructive,security,signal}){
 if(signal?.aborted)throw {code:'cancelled'};
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>=original.length)
   throw {code:'invalid-candidate'};
 const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
 if(doc.getPageCount()!==security.pages)throw {code:'page-count-changed'};
 for(const page of doc.getPages()){
   const box=page.getMediaBox();
   if(!(box.width>0&&box.height>0))throw {code:'output-geometry-invalid'};
 }
 // Independent second parser: all output pages must be individually addressable.
 const task=parser.getDocument({data:bytes.slice(),stopAtErrors:true,
   isEvalSupported:false,disableAutoFetch:true});
 try{
   const loaded=await task.promise;
   if(loaded.numPages!==security.pages)throw {code:'independent-page-count-changed'};
   for(let i=1;i<=security.pages;i++){
     if(signal?.aborted)throw {code:'cancelled'};
     const pg=await loaded.getPage(i);
     const v=pg.getViewport({scale:1});
     if(!(v.width>0&&v.height>0))throw {code:'independent-page-invalid'};
     pg.cleanup?.();
   }
 }finally{await task.destroy();}
 // Non-flattening graph preservation is independently enforced inside
 // recompressJpegXObjects via createImageOutputVerifier.
 return true;
}
self.onmessage=async event=>{
 if(event.data?.op!=='compress')return;
 const {file,mode='maximum',allowFlatten=false}=event.data;
 const start=performance.now();
 try{
   if(!(file instanceof Blob)||file.size<16||file.size>MAX_INPUT_BYTES)
     throw {code:'file-limit'};
   if(!['balanced','strong','maximum','lossless'].includes(mode))
     throw {code:'invalid-mode'};
   const original=new Uint8Array(await file.arrayBuffer());
   progress('inspect');
   const security=await inspectV3Source(original,{PDF,maxBytes:MAX_INPUT_BYTES});
   // Lossless must not silently rasterize: save a structure-optimized copy,
   // require a complete independent graph fingerprint, then reopen every page.
   if(mode==='lossless'){
     let result=null;
     try{
       const doc=await PDF.PDFDocument.load(original,{updateMetadata:false,throwOnInvalidObject:true});
       const output=new Uint8Array(await doc.save({useObjectStreams:true,addDefaultPage:false}));
       if(output.length<original.length){
         const graphOpts={PDF,maxEntries:250000,maxTotalDecodedBytes:512000000,
           maxStreamBytes:64000000};
         const fingerprint=await losslessFingerprint(original,graphOpts);
         if(fingerprint!==await losslessFingerprint(output,graphOpts))
           throw {code:'lossless-structure-differs'};
         await verifyCandidate({original,bytes:output,security,destructive:false});
         const sha256=async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),
           n=>n.toString(16).padStart(2,'0')).join('');
         result={type:'result',status:'compressed',mode,
           inputBytes:original.length,outputBytes:output.length,
           savedBytes:original.length-output.length,
           reductionPercent:Number((100*(1-output.length/original.length)).toFixed(2)),
           destructive:false,selectedStrategy:'lossless',integrity:{
             sourceDigest:await sha256(original),outputDigest:await sha256(output)},
           engineMs:Math.round(performance.now()-start),bytes:output};
       }
     }catch{
       // A failed or unverified candidate is never released, even when smaller.
       result=null;
     }
     if(result){self.postMessage(result,[result.bytes.buffer]);}
     else self.postMessage({type:'result',status:'original-retained',mode,
       inputBytes:original.length,outputBytes:original.length,savedBytes:0,
       destructive:false,engineMs:Math.round(performance.now()-start)});
     return;
   }
   const readPages=createIndependentInputReader(parser);
   const verifyJpeg=async({bytes,width,height})=>{
     const bmp=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
     try{return bmp.width===width&&bmp.height===height;}
     finally{bmp.close();}
   };
   const verifiedImages=createImageOutputVerifier({PDF,readPages,verifyJpeg});
   const result=await selectSmallestVerifiedPDF(original,{
     mode,allowDestructiveFlattening:allowFlatten,
     inspectRestrictions:async()=>security,
     nonFlatten:(bytes,opts)=>recompressJpegXObjects(bytes,{
       PDF,mode:opts.mode,inspectRestrictions:async()=>security,
       verifyOutput:verifiedImages,onProgress:value=>progress('nonflatten',value)
     }),
     raster:(bytes,opts)=>rasterizePdfAggressively(bytes,{
       pdfjs:parser,PDF,mode:opts.mode,consentToFlatten:allowFlatten,
       inspectRestrictions:async()=>security,workerOwnsInput:false,
       maxRunMs:180000,maxOutputBytes:MAX_INPUT_BYTES,
       onProgress:value=>progress('raster',value)
     }),
     verifyResult:value=>verifyCandidate({...value,security}),
     onProgress:value=>progress(value.stage,value.strategy)
   });
   if(result.status!=='compressed'){
     self.postMessage({type:'result',status:result.status,mode,
       inputBytes:original.length,outputBytes:original.length,
       savedBytes:0,destructive:false,stages:result.stages,
       engineMs:Math.round(performance.now()-start)});
     return;
   }
   const sha256=async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),
     n=>n.toString(16).padStart(2,'0')).join('');
   const integrity={sourceDigest:await sha256(original),outputDigest:await sha256(result.bytes)};
   progress('verified');
   self.postMessage({type:'result',status:'compressed',mode,
     inputBytes:result.inputBytes,outputBytes:result.outputBytes,
     savedBytes:result.savedBytes,reductionPercent:result.reductionPercent,
     destructive:result.destructive,selectedStrategy:result.selectedStrategy,
     stages:result.stages,integrity,
     engineMs:Math.round(performance.now()-start),
     bytes:result.bytes},[result.bytes.buffer]);
 }catch(error){self.postMessage(safeError(error));}
};
