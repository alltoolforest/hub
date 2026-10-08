import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const mock="window.__ocrMode='normal';window.__ocrTerminations=0;window.__ocrStarts=0;window.__lastCanvas=null;"+
  "window.Tesseract={createWorker:async()=>({"+
  "recognize:async(canvas)=>{window.__ocrStarts++;window.__lastCanvas={width:canvas.width,height:canvas.height};"+
  "if(window.__ocrMode==='hang')return new Promise(()=>{});"+
  "return {data:{text:'SOURCE-FAITHFUL TEST TEXT'}};},"+
  "terminate:async()=>{window.__ocrTerminations++;}})};";
 await page.route('**/assets/vendor/ocr.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:mock}));
 await page.goto('http://127.0.0.1:8765/documents/image-to-text/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 const png=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=140;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,140,80);
  ctx.fillStyle='#111111';ctx.fillText('SOURCE',5,40);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.waitForFunction(()=>document.querySelector('.selected-ocr-source')?.textContent?.includes('photo.png'));
 assert.equal(await page.locator('.ocr-source').isVisible(),true);
 assert.ok((await page.locator('.ocr-source canvas').getAttribute('aria-label')).includes('photo.png'));
 await page.locator('#ocr-rotate').selectOption('90');
 await page.locator('#ocr-prepare').selectOption('contrast');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value==='SOURCE-FAITHFUL TEST TEXT');
 assert.deepEqual(await page.evaluate(()=>window.__lastCanvas),{width:80,height:140});
 assert.equal(await page.locator('#ocr-text').getAttribute('readonly'),null);
 assert.equal(await page.evaluate(()=>window.__ocrTerminations),1);
 await page.locator('#ocr-text').fill('SOURCE-FAITHFUL TEST TEXT — reviewed');
 await page.getByRole('button',{name:'Download TXT'}).click();
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.evaluate(()=>window.__ocrMode='hang');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>window.__ocrStarts===2);
 assert.equal(await page.getByRole('button',{name:'Cancel OCR'}).isEnabled(),true);
 await page.getByRole('button',{name:'Cancel OCR'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('OCR cancelled'));
 assert.equal(await page.locator('#ocr-text').inputValue(),'SOURCE-FAITHFUL TEST TEXT — reviewed');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.equal(await page.evaluate(()=>window.__ocrTerminations),2);
 assert.equal(await page.getByRole('button',{name:'Recognize text'}).isEnabled(),true);
 const webp=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=120;c.height=64;
  c.getContext('2d').fillRect(0,0,120,64);
  return c.toDataURL('image/webp').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({name:'camera.webp',mimeType:'image/webp',buffer:Buffer.from(webp,'base64')});
 await page.waitForFunction(()=>document.querySelector('.selected-ocr-source')?.textContent?.includes('camera.webp'));
 assert.match(await page.locator('.selected-ocr-source').textContent(),/120 × 64/);
 assert.equal(await page.locator('#ocr-text').inputValue(),'SOURCE-FAITHFUL TEST TEXT — reviewed');
 await page.locator('#file-input').setInputFiles({name:'invalid.heic',mimeType:'image/heic',buffer:Buffer.from('not heif')});
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('Could not open'));
 assert.match(await page.locator('.selected-ocr-source').textContent(),/camera.webp/);
 assert.equal(await page.locator('#ocr-text').inputValue(),'SOURCE-FAITHFUL TEST TEXT — reviewed');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.evaluate(()=>window.__ocrMode='normal');
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>document.querySelector('#ocr-text')?.value==='SOURCE-FAITHFUL TEST TEXT');
 assert.equal(await page.locator('#downloads a[download]').count(),0);
 assert.deepEqual(errors,[]);
 const overflow=await page.evaluate(()=>Math.round(document.querySelector('#workspace').scrollWidth-document.querySelector('#workspace').clientWidth));
 assert.ok(overflow<=2,'OCR workspace overflows mobile by '+overflow+'px');
 console.log('IMAGE_OCR_TASK2_BROWSER_PASS: PNG/WebP, source preview, rotation, contrast, cancel, invalid HEIC recovery, mobile');
}finally{await browser.close();}
