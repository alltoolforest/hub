// PDF Merger postdeployment controls, stale output and responsive behavior.
// Browser-only fixture. No frozen tool components are loaded or modified.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true});
page.setDefaultTimeout(45000);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function fixture(name,width){
 const doc=await lib.PDFDocument.create();doc.addPage([width,540]);
 return {name,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
try{
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:async()=>undefined});
 });
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').setInputFiles([await fixture('one.pdf',301),await fixture('two.pdf',302)]);
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===2);
 // CSS hidden must override display:block even if preview rendering is unavailable.
 assert.equal(await page.locator('.pdf-merger-thumbnail').first().evaluate(c=>{
  c.hidden=true;return getComputedStyle(c).display;
 }), 'none');
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const share=page.getByRole('button',{name:'Share / Save'});
 assert.equal(await share.count(),1,'Simulated mobile sharing action must be present');
 await share.click();
 assert.equal(await page.getByRole('button',{name:'Cancel merge'}).isDisabled(),true,
  'Share must not re-enable Cancel when the merge is idle');
 assert.equal(await page.locator('.pdf-merger-item').first().getByRole('button',{name:'Move up one.pdf'}).isDisabled(),true);
 assert.equal(await page.locator('.pdf-merger-item').last().getByRole('button',{name:'Move down two.pdf'}).isDisabled(),true);
 await page.getByRole('button',{name:'Move down one.pdf'}).click();
 assert.match(await page.locator('.pdf-merger-result').textContent(),/Previous verified PDF/);
 assert.equal(await page.locator('#downloads .pdf-merger-old-order').count(),1);
 const more=[];
 for(let i=0;i<8;i++)more.push(await fixture('additional-'+i+'.pdf',350+i));
 await page.locator('#file-input').setInputFiles(more);
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===10);
 assert.equal(await page.getByRole('link',{name:'Jump to Create PDF'}).isVisible(),true);
 await page.getByRole('link',{name:'Jump to Create PDF'}).click();
 assert.equal(new URL(await page.url()).hash,'#pdf-merger-actions');
 await page.getByRole('button',{name:'Reset'}).click();
 assert.equal(await page.getByRole('link',{name:'Jump to Create PDF'}).isVisible(),false);
 assert.equal(await page.locator('#downloads .download-row').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PDF_MERGER_POSTDEPLOY_BROWSER_PASS '+engine+': share control integrity, stale output, preview hidden state, mobile 10-PDF navigation and reset');
}finally{await browser.close();}
