// Local input-inspection integration gate; no compression, product UI or upload.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {buildFixture} from './pdf-compressor-task1-fixtures.mjs';
const browser=await chromium.launch({headless:true,timeout:30000});
try{
  const page=await browser.newPage(),requests=[];
  await page.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://127.0.0.1:8765'||request.method()!=='GET'){
      requests.push({url:request.url(),method:request.method()});return route.abort();
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:8765/tests/',{waitUntil:'domcontentloaded'});
  await page.addScriptTag({url:'/assets/vendor/pdf-lib.js'});
  const rows=[];
  for(const id of ['digital','scanned','mixed','form','bookmarks','attachment','tagged']){
    const {bytes}=await buildFixture(id);
    const report=await page.evaluate(async data=>{
      const {inspectPDFInput}=await import('/assets/js/pdf-compressor-v2/input-inspector.mjs');
      const {createIndependentInputReader}=await import('/assets/js/pdf-compressor-v2/independent-input-reader.mjs');
      // Independent legacy reader polyfills browser features in this isolated
      // test realm only. It is not bundled into the production compressor.
      const pdfjs=await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
      return inspectPDFInput(new Uint8Array(data),{PDF:window.PDFLib,readPages:createIndependentInputReader(pdfjs)});
    },Array.from(bytes));
    assert.equal(report.valid,true);assert.equal(report.processingApproved,false);
    rows.push({fixture:id,classification:report.classification,pages:report.pageCount});
  }
  assert.deepEqual(rows.map(r=>r.classification),['digital','image-only','mixed','digital','digital','digital','digital']);
  const directory=process.env.PDF_COMPRESSOR_INDEPENDENT_FIXTURES;
  if(!directory)throw Error('Independent signed/encrypted fixtures required');
  for(const [name,expected] of [['encrypted.pdf','encrypted-pdf'],['signed.pdf','signed-pdf']]){
    const bytes=new Uint8Array(await readFile(resolve(directory,name)));
    const code=await page.evaluate(async data=>{
      const {inspectPDFInput}=await import('/assets/js/pdf-compressor-v2/input-inspector.mjs');
      try{await inspectPDFInput(new Uint8Array(data),{PDF:window.PDFLib,readPages:async()=>{throw Error('Restricted input must not reach renderer');}});}
      catch(e){return e.code;}
    },Array.from(bytes));
    assert.equal(code,expected);rows.push({fixture:name,status:code});
  }
  assert.deepEqual(requests,[],'Unexpected remote/network write request');
  console.log(JSON.stringify({browser:'Chromium',scope:'Task 3 isolated input inspection',
    productionIntegrated:false,requestsOutsideLocalGet:requests,rows},null,2));
}finally{await browser.close();}
