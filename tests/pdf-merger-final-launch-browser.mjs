// PDF Merger final regression: admission controls, reset and bfcache recovery.
// Only the PDF Merger route is exercised; frozen tools remain untouched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true,hasTouch:true});
page.setDefaultTimeout(65000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function pdf(name,width){
 const doc=await lib.PDFDocument.create();
 doc.addPage([width,500]);
 return {name,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
async function waitCount(count){
 await page.waitForFunction(n=>document.querySelectorAll('.pdf-merger-item').length===n,count);
}
async function disabledState(first,last){
 assert.equal(await page.getByRole('button',{name:'Cancel merge'}).isDisabled(),true,'Cancel should be unavailable at idle');
 assert.equal(await page.locator('.pdf-merger-item').first().getByRole('button',{name:'Move up '+first}).isDisabled(),true);
 assert.equal(await page.locator('.pdf-merger-item').last().getByRole('button',{name:'Move down '+last}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Create PDF'}).isEnabled(),true);
}
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').setInputFiles([await pdf('first.pdf',325),await pdf('second.pdf',450)]);
 await waitCount(2);
 await disabledState('first.pdf','second.pdf');
 assert.match(await page.locator('.selected-files').textContent(),/first.pdf/);
 // A rejected selection must not disturb admitted PDFs or enable unsafe controls.
 await page.locator('#file-input').setInputFiles({
  name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')
 });
 await page.waitForFunction(()=>document.querySelector('#status')?.classList.contains('error'));
 await waitCount(2);
 await disabledState('first.pdf','second.pdf');
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/2 PDF\(s\) retained/);
 // Same file(s) can be reselected after a failed upload.
 await page.locator('#file-input').setInputFiles([await pdf('third.pdf',475)]);
 await waitCount(3);
 assert.equal(await page.locator('#status').getAttribute('class'),'status');
 assert.equal(await page.getByRole('button',{name:'Cancel merge'}).isDisabled(),true);
 assert.equal(await page.locator('.pdf-merger-item').first().getByRole('button',{name:'Move up first.pdf'}).isDisabled(),true);
 assert.equal(await page.locator('.pdf-merger-item').last().getByRole('button',{name:'Move down third.pdf'}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'Merge pages only (remove bookmarks)'}).check();
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const firstDownload=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const output=await lib.PDFDocument.load(await readFile(await (await firstDownload).path()));
 assert.deepEqual(output.getPages().map(p=>p.getWidth()),[325,450,475]);
 // Simulate the browser's pagehide + bfcache pageshow path. Core revokes URLs
 // on pagehide; the local merger must not leave those dead links visible.
 await page.evaluate(()=>{
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 assert.equal(await page.locator('.pdf-merger-item').count(),3);
 assert.equal(await page.locator('#downloads .download-row').count(),0);
 assert.match(await page.locator('.pdf-merger-result').textContent(),/Previous download expired/);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.getByRole('button',{name:'Reset'}).click();
 assert.equal(await page.locator('.pdf-merger-item').count(),0);
 assert.equal(await page.locator('#downloads .download-row').count(),0);
 assert.equal(await page.locator('#status').textContent(),'');
 assert.equal(await page.locator('.selected-files').textContent(),'');
 assert.equal(await page.getByRole('checkbox',{name:'Merge pages only (remove bookmarks)'}).isChecked(),false);
 assert.equal(await page.getByRole('button',{name:'Cancel merge'}).isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PDF_MERGER_FINAL_LAUNCH_BROWSER_PASS '+engine+': idle disabled states, failed upload recovery, verified output, simulated BFCache return and clean reset');
}finally{await browser.close();}
