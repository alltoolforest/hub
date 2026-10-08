// Task 3: shared scanned-PDF OCR regression (legacy route must stay intact).
// Mock only the text classifier; exercise actual PDF generation/render and page order.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const type=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[type].launch({headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const failedRequests=[];
page.on('requestfailed',r=>failedRequests.push(r.url()+': '+r.failure()?.errorText));
const browserWarnings=[];
page.on('console',m=>{if(m.type()==='error')browserWarnings.push(m.text());});
try{
 const mock="window.__scannedRecognitions=0;window.__scannedTerminations=0;"+
 "window.Tesseract={createWorker:async()=>({"+
 "recognize:async()=>({data:{text:'SCANNED DOCUMENT TEXT '+(++window.__scannedRecognitions)}}),"+
 "terminate:async()=>{window.__scannedTerminations++;}})};";
 await page.route('**/assets/vendor/ocr.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:mock}));
 await page.goto('http://127.0.0.1:8765/documents/scanned-pdf-to-text/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 const pdf=await PDFLib.PDFDocument.create();
 pdf.addPage([595,842]);pdf.addPage([595,842]);
 const pdfBuffer=Buffer.from(await pdf.save());
 await page.locator('#file-input').setInputFiles({name:'scanned-test.pdf',mimeType:'application/pdf',buffer:pdfBuffer});
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('scanned-test.pdf'));
 await page.locator('#ranges').fill('1-2');
 await page.getByRole('button',{name:'Recognize text'}).click();
 try{
  await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value?.includes('SCANNED DOCUMENT TEXT 2'),null,{timeout:18000});
 }catch(error){
  const details=await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,
    text:document.querySelector('#ocr-text')?.value,
    activeButtons:[...document.querySelectorAll('#workspace button')].map(b=>({text:b.textContent,disabled:b.disabled})),
    selected:document.querySelector('.selected-files')?.textContent}));
  throw Error(type+' scanned PDF OCR did not produce page 2: '+JSON.stringify({details,errors,browserWarnings,failedRequests,cause:error.message}));
 }
 const actual=await page.locator('#ocr-text').inputValue();
 assert.match(actual,/Page 1\s+SCANNED DOCUMENT TEXT 1/);
 assert.match(actual,/Page 2\s+SCANNED DOCUMENT TEXT 2/);
 assert.equal(await page.evaluate(()=>window.__scannedRecognitions),2);
 assert.equal(await page.evaluate(()=>window.__scannedTerminations),1);
 assert.deepEqual(errors,[]);
 console.log('IMAGE_OCR_TASK3_SCANNED_PDF_PASS: '+type+' 2 pages correct order, untouched PDF rendering route');
}finally{await browser.close();}
