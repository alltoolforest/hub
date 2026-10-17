// Task 5 full pipeline: legacy metadata must survive real source-built qpdf
// optimization and all supported modes. Synthetic QA document only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCanvas} from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {JpegImage} from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {createQpdfLosslessProvider} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {createPDFJpegDecoder} from '../assets/js/pdf-compressor-v2/jpeg-source-decoder.mjs';
import {compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';

const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const modulePath=process.env.PDF_COMPRESSOR_QPDF_MODULE;
if(!modulePath)throw Error('Task 5 legacy output gate requires actual source-built qpdf');
const createModule=(await import(pathToFileURL(resolve(modulePath)).href)).default;
const optimize=createQpdfLosslessProvider(createModule);
const N=PDF.PDFName.of;

function images(bytes){
 return PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true})
  .then(doc=>doc.context.enumerateIndirectObjects()
   .filter(([,obj])=>obj instanceof PDF.PDFRawStream&&
    String(obj.dict.get(N('Subtype')))==='/Image')
   .map(([,obj])=>new Uint8Array(obj.contents)));
}
async function fixture(){
 const canvas=createCanvas(512,512),ctx=canvas.getContext('2d');
 for(let y=0;y<512;y+=16){
  ctx.fillStyle=y%32?'#567f91':'#c1d3ac';
  ctx.fillRect(0,y,512,16);
 }
 const jpeg=new Uint8Array(await canvas.encode('jpeg',76));
 assert.deepEqual([...jpeg.slice(0,2)],[255,216]);
 const exif=Uint8Array.from([255,225,0,8,69,120,105,102,0,0]);
 const ps=Uint8Array.from([255,237,0,8,56,66,73,77,0,0]);
 const tagged=new Uint8Array(jpeg.length+exif.length+ps.length);
 tagged.set(jpeg.subarray(0,2));
 tagged.set(exif,2);tagged.set(ps,2+exif.length);
 tagged.set(jpeg.subarray(2),2+exif.length+ps.length);
 const doc=await PDF.PDFDocument.create({updateMetadata:false});
 const img=doc.context.register(doc.context.stream(tagged,{
  Type:'XObject',Subtype:'Image',Width:512,Height:512,
  BitsPerComponent:8,ColorSpace:'DeviceRGB',Filter:'DCTDecode'
 }));
 for(let i=0;i<2;i++){
  const page=doc.addPage([550,690]);
  page.drawText('EXIF and Photoshop metadata preservation '+i,{x:30,y:620});
  page.node.set(N('Resources'),doc.context.obj({XObject:{Photo:img}}));
  page.pushOperators(PDF.pushGraphicsState(),PDF.scale(500,500),
   PDF.drawObject('Photo'),PDF.popGraphicsState());
 }
 return {source:new Uint8Array(await doc.save({useObjectStreams:false})),tagged};
}
const {source,tagged}=await fixture();
const before=source.slice();
const readPages=createIndependentInputReader(pdfjs);
const readText=createIndependentTextReader(pdfjs);
const decodeJpeg=createPDFJpegDecoder(JpegImage);
for(const mode of ['lossless','balanced','strong','maximum']){
 const result=await compressAndVerifyPDF(source,{PDF,readPages,readText,
  optimize,mode,decodeJpeg,
  encodeJpeg:async()=>{throw Error('EXIF/Photoshop preserve-only image was re-encoded');},
  verifyJpeg:async()=>{throw Error('preserved image must not need candidate verification');}
 });
 assert.ok(['compressed','original-retained'].includes(result.status),mode);
 assert.ok(result.outputBytes<=source.length,mode);
 assert.equal(result.integrity.independentTextVerified,true,mode);
 assert.equal(result.integrity.pageCount,2,mode);
 const actual=await images(result.bytes);
 assert.equal(actual.length,1,'shared image must stay shared in '+mode);
 assert.deepEqual(actual[0],tagged,'metadata-bearing original JPEG must remain exact in '+mode);
 assert.deepEqual(source,before,'source is immutable in '+mode);
 console.log(JSON.stringify({task:5,fixture:'legacy-exif-photoshop-shared',
  mode,status:result.status,inputBytes:source.length,outputBytes:result.outputBytes,
  verifiedOutput:true,originalJpegUnchanged:true}));
}
