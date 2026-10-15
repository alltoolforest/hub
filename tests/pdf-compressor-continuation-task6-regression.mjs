// Seven-task continuation Blueprint — Task 6 COMPREHENSIVE REGRESSION.
// Independent pipeline and final-output receipts. Synthetic PDFs only;
// image-encoding/quality tests run separately in real Chromium/Firefox/WebKit
// module workers, never substituted with this source-built lossless oracle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {JpegImage} from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createCanvas,ImageData} from '@napi-rs/canvas';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {inflateExact} from '../assets/js/pdf-compressor-v2/embedded-image-transform.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {compressAndVerifyPDF,digestPDFBytes} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
const modulePath=process.env.PDF_COMPRESSOR_QPDF_MODULE;
const fixtureDir=process.env.PDF_COMPRESSOR_INDEPENDENT_FIXTURES;
if(!modulePath||!fixtureDir)throw Error('Actual pinned qpdf source build and independently generated PDF fixtures required');
const createModule=(await import(pathToFileURL(resolve(modulePath)).href)).default;
const optimize=createQpdfLosslessProvider(createModule);
const readPages=createIndependentInputReader(pdfjs),readText=createIndependentTextReader(pdfjs);
const decodeJpeg=createPDFJpegDecoder(JpegImage);
// Actual independent test-only JPEG encoder: exercises image modes on the
// synthetic corpus. Browser QA independently repeats the visual pixel test.
async function encodeJpeg({rgb,width,height,quality,signal}){
 if(signal?.aborted)throw Error('cancelled');
 const canvas=createCanvas(width,height),rgba=new Uint8ClampedArray(width*height*4);
 for(let p=0;p<width*height;p++){
  rgba[p*4]=rgb[p*3];rgba[p*4+1]=rgb[p*3+1];
  rgba[p*4+2]=rgb[p*3+2];rgba[p*4+3]=255;
 }
 canvas.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);
 return new Uint8Array(await canvas.encode('jpeg',Math.round(quality*100)));
}
async function verifyJpeg({bytes,originalStream,descriptor,width,height,mode}){
 const encoded=await decodeJpeg({bytes,descriptor:{width,height,
  colorSpace:'/DeviceRGB',bitsPerComponent:8,filter:'/DCTDecode',streamBytes:bytes.length}});
 if(!(encoded instanceof Uint8Array)||encoded.length!==width*height*4)return false;
 const count=descriptor.width*descriptor.height;
 let original;
 if(descriptor.filter==='/DCTDecode')original=await decodeJpeg({
  bytes:originalStream.contents.slice(),descriptor});
 else{
  const gray=descriptor.colorSpace==='/DeviceGray';
  const raw=await inflateExact(originalStream.contents,count*(gray?1:3));
  original=new Uint8ClampedArray(count*4);
  for(let p=0;p<count;p++){
   original[p*4]=raw[p*(gray?1:3)];
   original[p*4+1]=raw[p*(gray?1:3)+(gray?0:1)];
   original[p*4+2]=raw[p*(gray?1:3)+(gray?0:2)];
   original[p*4+3]=255;
  }
 }
 if(!(original instanceof Uint8Array)||original.length!==count*4)return false;
 const canvas=createCanvas(descriptor.width,descriptor.height);
 canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(original),descriptor.width,descriptor.height),0,0);
 const target=createCanvas(width,height),ctx=target.getContext('2d');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(canvas,0,0,width,height);
 const expected=ctx.getImageData(0,0,width,height).data;
 let sq=0;const biases=[0,0,0];
 for(let p=0;p<width*height;p++)for(let c=0;c<3;c++){
  const delta=encoded[p*4+c]-expected[p*4+c];
  sq+=delta*delta;biases[c]+=delta;
 }
 const rms=Math.sqrt(sq/(width*height*3));
 const max=descriptor.filter==='/DCTDecode'?
  (mode==='maximum'?24:mode==='strong'?10:6):
  (mode==='maximum'?55:mode==='strong'?40:30);
 const biasMax=mode==='maximum'?12:5;
 return rms<=max&&biases.every(sum=>Math.abs(sum/(width*height))<=biasMax);
}
const base={PDF,readPages,readText,optimize,encodeJpeg,decodeJpeg,verifyJpeg};
const modes=['lossless','balanced','strong','maximum'];
const cases=['digital','scanned','image-heavy','mixed','form','bookmarks','attachment','tagged'];
const rows=[];
for(const id of cases){
 const {bytes}=await buildFixture(id);
 const source=bytes.slice(),before=await inspectPDFInput(source,{PDF,readPages});
 const originalText=await readText(source);
 for(const mode of modes){
  const start=performance.now();
  const result=await compressAndVerifyPDF(source,{...base,mode});
  assert.deepEqual(source,bytes,'source mutated '+id+' '+mode);
  assert.equal(result.mode,mode,id);
  assert.ok(result.outputBytes<=source.length,id+' '+mode);
  assert.equal(result.inputBytes,source.length,id+' '+mode);
  assert.equal(result.outputBytes,result.bytes.length,id+' '+mode);
  assert.equal(result.savedBytes,source.length-result.bytes.length,id+' '+mode);
  assert.equal(result.status,result.savedBytes>0?'compressed':'original-retained',id+' '+mode);
  assert.equal(result.integrity.mode,mode,id+' '+mode);
  assert.equal(result.integrity.independentTextVerified,true,id+' '+mode);
  assert.equal(result.integrity.inputBytes,source.length,id+' '+mode);
  assert.equal(result.integrity.outputBytes,result.bytes.length,id+' '+mode);
  assert.equal(result.integrity.savedBytes,result.savedBytes,id+' '+mode);
  assert.equal(result.integrity.sourceDigest,await digestPDFBytes(source),id+' '+mode);
  assert.equal(result.integrity.outputDigest,await digestPDFBytes(result.bytes),id+' '+mode);
  if(result.savedBytes===0){
   assert.deepEqual(result.bytes,source,id+' '+mode+' original fallback must be exact');
   assert.equal(result.integrity.sourceDigest,result.integrity.outputDigest,id+' '+mode);
  }
  assert.equal(result.settings.imageQualityReductionAllowed,mode!=='lossless',id+' '+mode);
  if(id==='digital'||mode==='lossless')assert.equal(result.settings.imageTransformationApplied,false,id+' '+mode);
  const final=await inspectPDFInput(result.bytes,{PDF,readPages});
  for(const field of ['pageCount','geometry','pages','structures','classification','hasTextLayer','possibleOCR']){
   assert.deepEqual(final[field],before[field],id+' '+mode+' modified '+field);
  }
  assert.deepEqual(await readText(result.bytes),originalText,id+' '+mode+' altered selectable text');
  const independentlyReopened=await PDF.PDFDocument.load(result.bytes,{
   updateMetadata:false,throwOnInvalidObject:true
  });
  assert.equal(independentlyReopened.getPageCount(),before.pageCount,id+' '+mode);
  rows.push({id,mode,status:result.status,inputBytes:source.length,
    outputBytes:result.outputBytes,savedBytes:result.savedBytes,
    pageCount:before.pageCount,elapsedMs:Math.round(performance.now()-start),
    independentProfile:true,independentText:true,receiptBoundToBytes:true});
 }
}
test('Task 6 all document categories and four compression modes: independently verified receipts',()=>{
 assert.equal(rows.length,cases.length*modes.length);
 assert.ok(rows.every(row=>row.independentText&&row.independentProfile&&row.receiptBoundToBytes));
 assert.ok(rows.some(row=>row.savedBytes>0),'real source-built engine must reduce at least one fixture');
 console.log(JSON.stringify({blueprintTask:6,scope:'real source-built pipeline with independently checked lossy JPEG candidates',
   count:rows.length,fixtureClasses:cases,modeCount:modes.length,rows}));
});

test('Task 6 processing failure retains verified original and never reports false savings',async()=>{
 const bytes=(await buildFixture('digital')).bytes,snapshot=bytes.slice();
 for(const mode of modes){
  let calls=0;
  const result=await compressAndVerifyPDF(bytes,{...base,mode,optimize:async()=>{
   calls++;throw Object.assign(Error('synthetic qpdf failure'),{code:'qpdf-unclean-exit'});
  }});
  assert.ok(calls>0,mode+' injected provider must actually be called');
  assert.equal(result.status,'original-retained',mode);
  assert.equal(result.savedBytes,0,mode);
  assert.deepEqual(result.bytes,bytes,mode);
  assert.equal(result.integrity.sourceDigest,result.integrity.outputDigest,mode);
  assert.equal(result.stages.at(-1).status,'preserved-after-failure',mode);
  assert.deepEqual(bytes,snapshot,mode);
 }
});

test('Task 6 corrupt/signed/encrypted inputs cannot invoke an optimizer or return downloadable bytes',async()=>{
 const examples=[
  {id:'corrupt',bytes:(await buildFixture('invalid')).bytes},
  {id:'marker-signed',bytes:(await buildFixture('signed-marker')).bytes,code:'signed-pdf'},
  {id:'signed',bytes:new Uint8Array(await readFile(resolve(fixtureDir,'signed.pdf'))),code:'signed-pdf'},
  {id:'encrypted',bytes:new Uint8Array(await readFile(resolve(fixtureDir,'encrypted.pdf'))),code:'encrypted-pdf'}
 ];
 for(const {id,bytes,code} of examples){
  const original=bytes.slice();
  for(const mode of modes){
   let optimized=false;
   await assert.rejects(compressAndVerifyPDF(bytes,{...base,mode,
    optimize:async()=>{optimized=true;throw Error('not allowed');}
   }),err=>code?err.code===code:Boolean(err?.code||err?.message),id+' '+mode);
   assert.equal(optimized,false,id+' '+mode+' cannot reach the optimizer');
   assert.deepEqual(bytes,original,id+' '+mode+' cannot mutate rejected source');
  }
 }
});

test('Task 6 cancellation always stops before optimization in each mode',async()=>{
 const bytes=(await buildFixture('digital')).bytes;
 for(const mode of modes){
  let called=false;
  await assert.rejects(compressAndVerifyPDF(bytes,{...base,mode,
   signal:AbortSignal.abort(),optimize:async()=>{called=true;return bytes;}
  }),err=>err.code==='cancelled',mode);
  assert.equal(called,false,mode);
 }
});
