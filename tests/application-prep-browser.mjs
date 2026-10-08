// Task 3 integration smoke: actual browser uploads, crop, image export, PDF and error recovery.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';

const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const browserName=process.env.BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[browserName];
if(!browserType)throw Error('Unsupported browser: '+browserName);
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:375,height:812}});
const errors=[];
const outbound=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{
 const dest=request.url();
 if(!dest.startsWith('http://127.0.0.1:8765/') &&
    !dest.startsWith('blob:') && !dest.startsWith('data:') &&
    !dest.startsWith('about:')) outbound.push(dest);
});
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
const ready=(selector,text)=>page.waitForFunction(([s,v])=>
 document.querySelector(s)?.textContent?.includes(v),[selector,text],{timeout:20000});
try{
 await page.goto(base+'/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#app-workflow').waitFor();
 assert.equal(await page.locator('#app-crop-panel').count(),0); // structural semantics
 assert.equal(await page.locator('.app-crop-panel').isVisible(),false);
 // Generate a real 128×80 browser PNG and upload as an ordinary file.
 const pngBase64=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=128;c.height=80;
   const ctx=c.getContext('2d');ctx.fillStyle='#204e70';ctx.fillRect(0,0,128,80);
   ctx.fillStyle='#fcffef';ctx.fillRect(20,10,80,60);
   return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({
   name:'sample.png',mimeType:'image/png',buffer:Buffer.from(pngBase64,'base64')
 });
 await ready('.selected-files','Selected: sample.png');
 assert.equal(await page.locator('#width').inputValue(),'128');
 assert.equal(await page.locator('#height').inputValue(),'80');
 assert.equal(await page.locator('.app-crop-panel').isVisible(),true);
 await page.locator('#app-workflow').selectOption('signature');
 assert.match(await page.locator('.app-guidance').textContent(),/Signature/);
 await page.locator('#app-workflow').selectOption('document');
 // Changing guide must not reset file, crop or output dimensions.
 assert.equal(await page.locator('#width').inputValue(),'128');
 await page.locator('#app-crop-x').fill('25');
 await page.locator('#app-crop-y').fill('25');
 await page.locator('#app-crop-w').fill('50');
 await page.locator('#app-crop-h').fill('50');
 await page.getByRole('button',{name:'Apply crop values'}).press('Enter');
 await ready('.app-crop-help','Crop applied');
 assert.equal(await page.locator('#width').inputValue(),'64');
 assert.equal(await page.locator('#height').inputValue(),'40');
 await page.locator('#format').selectOption('image/png');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await ready('.app-output-status','Ready: 64 × 40 px');
 const imageDownload=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const img=await imageDownload;
 assert.match(img.suggestedFilename(),/\.png$/);
 const imageBytes=await fs.readFile(await img.path());
 assert.ok(imageBytes.length>20,'PNG should not be empty');
 const imageDimensions=await page.evaluate(async bytes=>{
   const blob=new Blob([new Uint8Array(bytes)],{type:'image/png'});
   const bitmap=await createImageBitmap(blob);const out=[bitmap.width,bitmap.height];bitmap.close();return out;
 },[...imageBytes]);
 assert.deepEqual(imageDimensions,[64,40]);
 // A corrupt replacement must preserve both the usable input and its last download.
 await page.locator('#file-input').setInputFiles({
   name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')
 });
 await ready('.selected-files','Could not open');
 assert.equal(await page.locator('#width').inputValue(),'64');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.equal(await page.locator('.app-crop-panel').isVisible(),true);
 // Export true one-page A4 PDF with live PDF-lib library.
 await page.locator('#format').selectOption('image/jpeg');
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await ready('.app-output-status','Ready: single-page A4 PDF');
 const pdfDownload=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const pdf=await pdfDownload;
 assert.match(pdf.suggestedFilename(),/\.pdf$/);
 const pdfBytes=await fs.readFile(await pdf.path());
 assert.match(pdfBytes.subarray(0,5).toString(),/%PDF-/);
 const doc=await PDFLib.PDFDocument.load(pdfBytes);
 assert.equal(doc.getPageCount(),1);
 const pageSize=doc.getPages()[0].getSize();
 assert.ok(Math.abs(pageSize.width-595.28)<0.3);
 assert.ok(Math.abs(pageSize.height-841.89)<0.3);
 // On impossible KB requests, keep the last successfully generated PDF.
 await page.locator('#target').fill('0.001');
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await ready('#status','exceeding the requested');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.equal(await page.locator('#downloads a[download]').getAttribute('download'),pdf.suggestedFilename());
 await page.locator('#target').fill('0');
 // At mobile viewport, tool content must remain within the workspace.
 const overflow=await page.evaluate(()=>{
  const root=document.querySelector('#workspace');
  return Math.round(root.scrollWidth-root.clientWidth);
 });
 assert.ok(overflow<=2,'Workspace overflows narrow viewport by '+overflow+'px');
 await page.setViewportSize({width:1280,height:800});
 const desktopOverflow=await page.evaluate(()=>{
   const root=document.querySelector('#workspace');
   return Math.round(root.scrollWidth-root.clientWidth);
 });
 assert.ok(desktopOverflow<=2,'Workspace overflows desktop by '+desktopOverflow+'px');
 assert.deepEqual(outbound,[],'Document processing sent requests to remote URLs');
 assert.deepEqual(errors,[],'Unexpected browser errors');
 console.log('BROWSER_SMOKE_PASS: '+browserName+' upload, keyboard crop, PNG pixel check, failed-import recovery, PDF A4 roundtrip, mobile viewport');
}finally{await browser.close();}
