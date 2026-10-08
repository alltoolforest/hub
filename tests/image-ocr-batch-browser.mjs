import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {unzipSync} from 'fflate';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const mock="window.__ocrRun=0;window.__ocrClosed=0;"+
 "window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'OCR RESULT '+(++window.__ocrRun)}}),"+
 "terminate:async()=>{window.__ocrClosed++}})};";
page.setDefaultTimeout(25000);
try{
 await page.route('**/assets/vendor/ocr.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:mock}));
 await page.goto('http://127.0.0.1:8765/documents/image-to-text/',{waitUntil:'networkidle'});
 const originals=await page.evaluate(()=>{
  return ['A','B','C'].map((title,i)=>{
   const c=document.createElement('canvas');c.width=140;c.height=80;
   const ctx=c.getContext('2d');ctx.fillStyle=['#112233','#244466','#448866'][i];
   ctx.fillRect(0,0,140,80);ctx.fillStyle='white';ctx.font='26px sans-serif';ctx.fillText(title,25,55);
   return c.toDataURL('image/png').split(',')[1];
  });
 });
 await page.locator('#file-input').setInputFiles(originals.map((b,i)=>({
  name:['A','B','C'][i]+'.png',mimeType:'image/png',buffer:Buffer.from(b,'base64')
 })));
 const queue=page.locator('.ocr-batch-item');
 await page.waitForFunction(()=>document.querySelectorAll('.ocr-batch-item').length===3);
 const names=()=>queue.locator('.ocr-batch-info strong').allTextContents();
 assert.deepEqual((await names()).map(n=>n.slice(3)),['A.png','B.png','C.png']);
 await queue.nth(2).getByRole('button',{name:'Move up'}).click();
 await queue.nth(1).getByRole('button',{name:'Move up'}).click();
 assert.deepEqual((await names()).map(n=>n.slice(3)),['C.png','A.png','B.png']);
 await queue.nth(0).getByRole('button',{name:'Rotate right'}).click();
 assert.equal(await page.locator('#ocr-rotate').inputValue(),'90');
 const preview=await page.locator('.ocr-source canvas').evaluate(c=>({w:c.width,h:c.height}));
 assert.deepEqual(preview,{w:80,h:140});
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value?.includes('OCR RESULT 3'));
 const extracted=await page.locator('#ocr-text').inputValue();
 assert.ok(extracted.indexOf('Image 1 — C.png')<extracted.indexOf('Image 2 — A.png'));
 assert.ok(extracted.indexOf('Image 2 — A.png')<extracted.indexOf('Image 3 — B.png'));
 assert.ok(extracted.indexOf('OCR RESULT 1')<extracted.indexOf('OCR RESULT 3'));
 assert.equal(await page.evaluate(()=>window.__ocrClosed),1);
 await page.locator('#ocr-text').fill(extracted.replace('OCR RESULT 2','CORRECTED OCR RESULT 2'));
 // Real DOCX export; inspect OOXML package to verify exact corrected text and order.
 await page.getByRole('button',{name:'Download DOCX'}).click();
 await page.waitForFunction(()=>document.querySelector('#downloads')?.textContent?.includes('extracted-text.docx'));
 const rowDocx=page.locator('.download-row').filter({hasText:'extracted-text.docx'});
 const d1=page.waitForEvent('download');await rowDocx.locator('a[download]').click();
 const docDownload=await d1;
 const zip=unzipSync(new Uint8Array(await readFile(await docDownload.path())));
 const documentXml=new TextDecoder().decode(zip['word/document.xml']);
 assert.match(documentXml,/CORRECTED OCR RESULT 2/);
 assert.ok(documentXml.indexOf('C.png')<documentXml.indexOf('A.png'));
 assert.ok(documentXml.indexOf('A.png')<documentXml.indexOf('B.png'));
 // Real PDF export; parse it as a PDF and confirm at least one A4 page.
 await page.getByRole('button',{name:'Download PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#downloads')?.textContent?.includes('extracted-text.pdf'));
 const rowPdf=page.locator('.download-row').filter({hasText:'extracted-text.pdf'});
 const d2=page.waitForEvent('download');await rowPdf.locator('a[download]').click();
 const pdfDownload=await d2;
 const pdfBytes=await readFile(await pdfDownload.path());
 assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
 const pdf=await PDFLib.PDFDocument.load(pdfBytes);
 assert.ok(pdf.getPageCount()>=1);
 assert.equal(Math.round(pdf.getPages()[0].getWidth()),595);
 // Changing the image order should preserve prior text, block a fresh mismatched export,
 // and rerunning OCR should create a new ordered transcript.
 await queue.nth(2).getByRole('button',{name:'Move up'}).click();
 const oldText=await page.locator('#ocr-text').inputValue();
 await page.getByRole('button',{name:'Download PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Run OCR again'));
 assert.equal(await page.locator('#ocr-text').inputValue(),oldText);
 assert.equal(await page.locator('.download-row').count(),2);
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value?.includes('OCR RESULT 6'));
 assert.equal(await page.locator('.download-row').count(),0);
 assert.equal(await page.evaluate(()=>window.__ocrClosed),2);
 assert.deepEqual(errors,[]);
 const overflow=await page.evaluate(()=>{
  const root=document.querySelector('#workspace');
  return Math.round(root.scrollWidth-root.clientWidth);
 });
 assert.ok(overflow<=2,'mobile workspace overflows by '+overflow+' px');
 console.log('IMAGE_OCR_BATCH_BROWSER_PASS: 3 uploads, reorder, live rotation, sequential output, editable TXT, DOCX OOXML, A4 PDF, stale-order guard and mobile layout');
}finally{await browser.close();}
