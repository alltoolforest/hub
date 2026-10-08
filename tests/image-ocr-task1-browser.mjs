// Task 1 browser integration: mocked recognition, not OCR quality benchmarking.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const exceptions=[];
page.on('pageerror',e=>exceptions.push(e.message));
try{
 const workerMock = "window.__ocrMode='success';window.__ocrTerminations=0;"+
  "window.Tesseract={createWorker:async()=>{"+
  "const mode=window.__ocrMode;"+
  "if(mode==='initFail')throw Error('Failed to fetch traineddata');"+
  "return {recognize:async()=>{"+
  "if(mode==='recognitionFail')throw Error('Recognition test failure');"+
  "if(mode==='empty')return {data:{text:''}};"+
  "return {data:{text:mode==='second'?'SECOND RESULT':'FIRST RESULT'}};"+
  "},terminate:async()=>{window.__ocrTerminations++}};"+
  "}};";
 await page.route('**/assets/vendor/ocr.js',route=>route.fulfill({
  status:200,contentType:'application/javascript',body:workerMock
 }));
 await page.goto('http://127.0.0.1:8765/documents/image-to-text/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 const png=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=160;c.height=100;
  c.getContext('2d').fillRect(0,0,160,100);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({name:'valid.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>document.querySelector('.selected-ocr-source')?.textContent?.includes('valid.png'));
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value==='FIRST RESULT');
 assert.equal(await page.evaluate(()=>window.__ocrTerminations),1);
 await page.locator('#ocr-text').fill('FIRST RESULT — manually corrected');
 await page.getByRole('button',{name:'Download TXT'}).click();
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.evaluate(()=>window.__ocrMode='recognitionFail');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Recognition test failure'));
 assert.equal(await page.locator('#ocr-text').inputValue(),'FIRST RESULT — manually corrected');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.equal(await page.evaluate(()=>window.__ocrTerminations),2);
 assert.equal(await page.locator('#ocr-text').getAttribute('readonly'),null);
 await page.evaluate(()=>window.__ocrMode='initFail');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('could not load'));
 assert.equal(await page.locator('#ocr-text').inputValue(),'FIRST RESULT — manually corrected');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#file-input').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('bad file')});
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('Could not open'));
 assert.match(await page.locator('.selected-ocr-source').textContent(),/valid.png/);
 assert.equal(await page.locator('#ocr-text').inputValue(),'FIRST RESULT — manually corrected');
 const huge=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(huge);
 Buffer.from('IHDR').copy(huge,12);huge.writeUInt32BE(9000,16);huge.writeUInt32BE(9000,20);
 await page.locator('#file-input').setInputFiles({name:'oversized.png',mimeType:'image/png',buffer:huge});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('too large'));
 assert.match(await page.locator('.selected-ocr-source').textContent(),/valid.png/);
 await page.evaluate(()=>window.__ocrMode='second');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value==='SECOND RESULT');
 assert.equal(await page.locator('#downloads a[download]').count(),0);
 assert.equal(await page.evaluate(()=>window.__ocrTerminations),3);
 assert.deepEqual(exceptions,[]);
 console.log('IMAGE_OCR_TASK1_BROWSER_PASS: upload, edit retention, retries, init failure, recognition failure, corrupt/oversize replacement, worker cleanup');
}finally{await browser.close();}
