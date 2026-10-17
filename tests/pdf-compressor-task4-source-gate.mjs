// Actual source-built engine + independent text and exact rendered-pixel gate.
// Synthetic/independently generated QA documents only; no user data or upload.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {createIndependentInputReader,readPageTextContent} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createQpdfLosslessProvider,runVerifiedLossless} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
const modulePath=process.env.PDF_COMPRESSOR_QPDF_MODULE;
if(!modulePath)throw Error('A real source-built qpdf module is required; this gate must not use the old npm experiment.');
const createModule=(await import(pathToFileURL(resolve(modulePath)).href)).default;
const optimize=createQpdfLosslessProvider(createModule),readPages=createIndependentInputReader(pdfjs);
const outputDir=process.env.PDF_COMPRESSOR_GATE_OUTPUT??'/tmp/atf-qpdf-verified-outputs';
await mkdir(outputDir,{recursive:true});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function independentlyRender(bytes){
  const task=pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,stopAtErrors:true,
    disableFontFace:true,useSystemFonts:false,verbosity:0,
    standardFontDataUrl:resolve('assets/vendor/standard_fonts')+'/'});
  try{
    const doc=await task.promise,report=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),viewport=page.getViewport({scale:.5});
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      const context=canvas.getContext('2d');
      await page.render({canvasContext:context,viewport}).promise;
      const text=await readPageTextContent(page);
      report.push({view:page.view,rotation:page.rotate,
        text:text.items.filter(x=>typeof x.str==='string').map(x=>({str:x.str,transform:x.transform,width:x.width,height:x.height,dir:x.dir})),
        pixels:digest(context.getImageData(0,0,canvas.width,canvas.height).data)});
      page.cleanup();
    }
    return report;
  }finally{await task.destroy();}
}
const report=[];
const inputs=[];
for(const id of ['digital','scanned','image-heavy','mixed','form','bookmarks','attachment','tagged'])
  inputs.push({id,bytes:(await buildFixture(id)).bytes});
const independentDirectory=process.env.PDF_COMPRESSOR_INDEPENDENT_FIXTURES;
if(!independentDirectory)throw Error('Generate the independent QA inputs before this gate.');
for(const name of ['independent-text.pdf','independent-scan-color.pdf','independent-scan-gray.pdf','independent-repeated-fonts.pdf'])
  inputs.push({id:name.replace('.pdf',''),bytes:new Uint8Array(await readFile(resolve(independentDirectory,name)))});
{
  const source=(await buildFixture('scanned')).bytes;
  const doc=await PDF.PDFDocument.load(source,{updateMetadata:false}),N=PDF.PDFName.of;
  const images=doc.context.enumerateIndirectObjects().filter(([,stream])=>
    stream instanceof PDF.PDFRawStream&&String(stream.dict.get(N('Subtype')))==='/Image');
  doc.context.assign(images[1][0],PDF.PDFRawStream.of(images[0][1].dict.clone(doc.context),images[0][1].contents.slice()));
  inputs.push({id:'duplicate-image-resources',bytes:new Uint8Array(await doc.save({useObjectStreams:true}))});
}
for(const {id,bytes} of inputs){
  const snapshot=bytes.slice(),started=performance.now();
  const result=await runVerifiedLossless(bytes,{PDF,readPages,optimize});
  assert.deepEqual(bytes,snapshot,'Input mutation: '+id);
  assert.ok(result.outputBytes<=bytes.length);
  assert.deepEqual(await independentlyRender(result.bytes),await independentlyRender(bytes),'Render/text mismatch: '+id);
  await writeFile(resolve(outputDir,id+'.pdf'),result.bytes);
  const row={fixture:id,status:result.status,inputBytes:bytes.length,outputBytes:result.outputBytes,
    savedBytes:result.savedBytes,elapsedMs:Math.round(performance.now()-started),
    outputSHA256:digest(result.bytes),independentText:true,exactRenderedPixels:true};
  report.push(row);console.log(JSON.stringify(row));
}
assert.ok(report.filter(row=>row.savedBytes>0).length>=2,'At least two suitable actual PDFs must compress');
const signed=(await buildFixture('signed-marker')).bytes;
await assert.rejects(runVerifiedLossless(signed,{PDF,readPages,optimize}),e=>e.code==='signed-pdf');
for(const [name,code] of [['signed.pdf','signed-pdf'],['encrypted.pdf','encrypted-pdf']]){
  const bytes=new Uint8Array(await readFile(resolve(independentDirectory,name)));
  await assert.rejects(runVerifiedLossless(bytes,{PDF,readPages,optimize}),e=>e.code===code);
}
await writeFile(resolve(outputDir,'evidence.json'),JSON.stringify({sourceBuilt:true,productionApproved:false,
  scope:'Task 4 actual source-built lossless synthetic corpus; not real-device acceptance',report},null,2));
