import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
page.setDefaultTimeout(25000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const mock="window.__mode='normal';window.__run=0;window.__closed=0;"+
 "window.Tesseract={createWorker:async()=>({recognize:async()=>{window.__run++;"+
 "if(window.__mode==='hang')return new Promise(()=>{});"+
 "return {data:{text:'SOURCE '+window.__run}};},terminate:async()=>{window.__closed++}})};";
try{
 await page.route('**/assets/vendor/ocr.js',r=>r.fulfill({contentType:'application/javascript',status:200,body:mock}));
 await page.goto('http://127.0.0.1:8765/documents/image-to-text/',{waitUntil:'networkidle'});
 const src=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=130;c.height=80;
  c.getContext('2d').fillRect(0,0,130,80);
  return c.toDataURL('image/png').split(',')[1];
 });
 const image=name=>({name,mimeType:'image/png',buffer:Buffer.from(src,'base64')});
 await page.locator('#file-input').setInputFiles([image('A.png'),image('B.png')]);
 await page.waitForFunction(()=>document.querySelectorAll('.ocr-batch-item').length===2);
 const entries=page.locator('.ocr-batch-item');
 // Keyboard reordering must preserve focus on the same image's action.
 await entries.nth(1).getByRole('button',{name:'Move up'}).focus();
 await page.keyboard.press('Enter');
 assert.match(await entries.first().textContent(),/B.png/);
 const focused=await page.evaluate(()=>{
  const e=document.activeElement;
  return {label:e?.textContent?.trim(),item:e?.closest('.ocr-batch-item')?.textContent||''};
 });
 // At the top boundary Move up is disabled, so focus safely moves to View.
 assert.equal(focused.label,'View');
 assert.match(focused.item,/B.png/);
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value?.includes('SOURCE 2'));
 await page.getByRole('button',{name:'Download TXT'}).click();
 assert.equal(await page.locator('.download-row').count(),1);
 // Reordering marks old links explicitly; it does not silently destroy prior outputs.
 await entries.nth(0).getByRole('button',{name:'Move down'}).click();
 assert.match(await page.locator('.ocr-stale-label').textContent(),/Previous image order/);
 assert.equal(await page.locator('.download-row').count(),1);
 await page.getByRole('button',{name:'Download TXT'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Run OCR again'));
 assert.equal(await page.locator('.download-row').count(),1);
 // New OCR in the revised order succeeds and clears old downloads.
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value?.includes('SOURCE 4'));
 assert.equal(await page.locator('.download-row').count(),0);
 // Shared copy and export controls must NEVER unlock selected images while OCR is busy.
 await page.evaluate(()=>window.__mode='hang');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>window.__run===5);
 await page.getByRole('button',{name:'Download TXT'}).click();
 assert.equal(await page.locator('#file-input').isDisabled(),true);
 assert.equal(await page.locator('#ocr-rotate').isDisabled(),true);
 assert.equal(await page.locator('.ocr-batch-item').first().getByRole('button',{name:'Move down'}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Cancel OCR'}).isEnabled(),true);
 await page.getByRole('button',{name:'Cancel OCR'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('OCR cancelled'));
 assert.equal(await page.locator('#file-input').isDisabled(),false);
 assert.equal(await page.locator('.download-row').count(),1);
 // A rendering exception during a replacement batch must roll back all staged images,
 // avoiding closed image references and retaining old OCR downloads/text.
 await page.evaluate(()=>{
  window.__failThumbOnce=true;
  const native=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(...args){
   if(window.__failThumbOnce&&this.classList.contains('ocr-thumb')){
    window.__failThumbOnce=false;throw Error('Simulated preview failure');
   }
   return native.apply(this,args);
  };
 });
 const priorText=await page.locator('#ocr-text').inputValue();
 await page.locator('#file-input').setInputFiles([image('C.png')]);
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('Could not open'));
 assert.equal(await page.locator('.ocr-batch-item').count(),2);
 assert.equal(await page.locator('#ocr-text').inputValue(),priorText);
 assert.equal(await page.locator('.download-row').count(),1);
 await page.locator('.ocr-batch-item').first().getByRole('button',{name:'Rotate right'}).click();
 await page.waitForFunction(()=>document.querySelector('.ocr-source canvas')?.width===80);
 // Intl characters that cannot be encoded by WinAnsi produce a valid visual PDF.
 const intl='தமிழ் العربية 日本語 हिन्दी — International OCR';
 await page.locator('#ocr-text').fill(intl);
 await page.getByRole('button',{name:'Download PDF'}).click();
 try{
  await page.waitForFunction(()=>document.querySelector('#downloads')?.textContent?.includes('extracted-text.pdf'),null,{timeout:9000});
 }catch(error){
  const state=await page.evaluate(()=>({
   status:document.querySelector('#status')?.textContent,
   downloads:document.querySelector('#downloads')?.textContent,
   text:document.querySelector('#ocr-text')?.value,
   disabled:[...document.querySelectorAll('#workspace button')].filter(b=>b.disabled).map(b=>b.textContent)
  }));
  throw Error('International PDF export failed: '+JSON.stringify(state)+' / '+error.message);
 }
 const d=page.waitForEvent('download');
 await page.locator('.download-row').last().locator('a[download]').click();
 const bytes=await readFile(await (await d).path());
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const pdf=await PDFLib.PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(),1);
 assert.equal(Math.round(pdf.getPages()[0].getWidth()),595);
 assert.match(await page.locator('#status').textContent(),/visually/);
 assert.deepEqual(errors,[]);
 console.log('IMAGE_OCR_FINAL_BROWSER_PASS: action lock, keyboard focus, old-download warning, batch rollback, visual Unicode PDF A4, no browser errors');
}finally{await browser.close();}
