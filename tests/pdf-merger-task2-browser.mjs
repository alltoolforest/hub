import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
page.setDefaultTimeout(30000);
const failures=[];page.on('pageerror',e=>failures.push(e.message));
async function sample(name,width,{rotate=0,form=false}={}){
 const doc=await lib.PDFDocument.create(),p=doc.addPage([width,500]);
 p.setRotation(lib.degrees(rotate));
 const font=await doc.embedFont(lib.StandardFonts.Helvetica);
 p.drawText('PDF MERGER CONTENT '+name,{x:20,y:200,size:17,font});
 if(form)doc.getForm().createTextField('customer').addToPage(p);
 return {name,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
const rows=()=>page.locator('.file-list li');
async function downloadPdf(){
 const d=page.waitForEvent('download');await page.locator('#downloads a[download]').last().click();
 return lib.PDFDocument.load(await readFile(await (await d).path()));
}
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 const a=await sample('a.pdf',317),b=await sample('b.pdf',521,{rotate:90});
 await page.locator('#file-input').setInputFiles([a,b]);
 await page.waitForFunction(()=>document.querySelectorAll('.file-list li').length===2);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const result1=await downloadPdf();
 assert.deepEqual(result1.getPages().map(p=>Math.round(p.getWidth())),[317,521]);
 assert.deepEqual(result1.getPages().map(p=>p.getRotation().angle),[0,90]);
 assert.match(await page.locator('.pdf-merger-result').textContent(),/Verified output: 2 pages/);
 const initialLinks=await page.locator('#downloads a[download]').count();
 assert.equal(initialLinks,1);
 // Reordering must identify existing output as belonging to the old sequence.
 await rows().nth(1).getByRole('button',{name:'↑'}).click();
 assert.match(await page.locator('.pdf-merger-old-order').textContent(),/Previous file arrangement/);
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 // Reparse fails for the second source while the earlier verified download survives.
 await page.evaluate(()=>{
  window.__pdfFail=true;window.__pdfDelay=false;
  const native=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=async function(){
   if(window.__pdfFail&&this.name==='a.pdf')throw Error('simulated memory failure');
   if(window.__pdfDelay&&this.name==='a.pdf')await new Promise(r=>setTimeout(r,400));
   return native.call(this);
  };
 });
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Could not merge "a.pdf"'));
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 const retained=await downloadPdf();
 assert.deepEqual(retained.getPages().map(p=>Math.round(p.getWidth())),[317,521]);
 // Cancellation during the second document preserves previous verified result.
 await page.evaluate(()=>{window.__pdfFail=false;window.__pdfDelay=true;});
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Merging 2 of 2'));
 await page.getByRole('button',{name:'Cancel merge'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('cancelled'),null,{timeout:12000});
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 // A retry succeeds, replacing only after output verification.
 await page.evaluate(()=>{window.__pdfDelay=false;});
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.equal(await page.locator('.pdf-merger-old-order').count(),0);
 const result2=await downloadPdf();
 assert.deepEqual(result2.getPages().map(p=>Math.round(p.getWidth())),[521,317]);
 // An interactive form enters validated source queue, but cannot be silently merged.
 const form=await sample('form.pdf',400,{form:true});
 await page.locator('#file-input').setInputFiles(form);
 await page.waitForFunction(()=>document.querySelectorAll('.file-list li').length===3);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('interactive form fields'));
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.match(await page.locator('.pdf-merger-old-order').textContent(),/Previous file arrangement/);
 const width=await page.evaluate(()=>{
  const root=document.querySelector('#workspace');return root.scrollWidth-root.clientWidth;
 });
 assert.ok(width<=2,'Mobile horizontal overflow '+width);
 assert.deepEqual(failures,[]);
 console.log('PDF_MERGER_TASK2_BROWSER_PASS '+engine+': accurate order, dimensions, rotation, output reopening, cancel and retry, previous result preservation, stale link, unsupported form rejection');
}finally{await browser.close();}
