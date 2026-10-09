// PDF Merger browser regression: bookmarked source is page-mergeable only after consent.
// Covers the screenshot's seven-PDF case and the 13+ PDF worker path.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,acceptDownloads:true});
page.setDefaultTimeout(65000);
const errors=[],workers=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('worker',w=>workers.push(w.url()));
function outline(doc){
 const N=lib.PDFName.of;
 const outlineRoot=doc.context.obj({Type:N('Outlines'),Count:1});
 const rootRef=doc.context.register(outlineRoot);
 const item=doc.context.obj({Title:lib.PDFString.of('Section'),Parent:rootRef,Dest:[doc.getPages()[0].ref,N('Fit')]});
 const itemRef=doc.context.register(item);
 outlineRoot.set(N('First'),itemRef);outlineRoot.set(N('Last'),itemRef);
 doc.catalog.set(N('Outlines'),rootRef);
}
async function sample(i,pages=1,bookmarked=false){
 const doc=await lib.PDFDocument.create();
 for(let j=0;j<pages;j++)doc.addPage([300+i*7,500+j]);
 if(bookmarked)outline(doc);
 return {name:bookmarked?'PremiumTablePlanB.pdf':'ordinary-'+i+'.pdf',
  mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
async function ready(expected){
 await page.waitForFunction(n=>document.querySelectorAll('.pdf-merger-item').length===n,expected);
}
async function successful(){
 await page.waitForFunction(()=>{
  const status=document.querySelector('#status');
  return status?.textContent?.includes('verified and ready')||status?.classList.contains('error');
 });
 const message=await page.locator('#status').textContent();
 assert.match(message,/verified and ready/,message);
 const download=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 return lib.PDFDocument.load(await readFile(await (await download).path()));
}
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 const consent=page.getByRole('checkbox',{name:'Merge pages only (remove bookmarks)'});
 assert.equal(await consent.isChecked(),false,'Opt-in must be off by default');
 const files=[];
 for(const [i,pages] of [2,3,4,5,3,5,4].entries())files.push(await sample(i+1,pages,i===0));
 await page.locator('#file-input').setInputFiles(files);
 await ready(7);
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/26 page\(s\)/);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('bookmarks'));
 assert.match(await page.locator('#status').textContent(),/Merge pages only.*Original PDFs stay unchanged/);
 assert.equal(await page.locator('#downloads .download-row').count(),0);
 assert.equal(await consent.isChecked(),false);
 await consent.check();
 await page.getByRole('button',{name:'Create PDF'}).click();
 const seven=await successful();
 assert.equal(seven.getPageCount(),26);
 assert.equal(seven.catalog.get(lib.PDFName.of('Outlines')),undefined);
 assert.match(await page.locator('.pdf-merger-result').textContent(),/Bookmarks were intentionally not copied/);
 await page.getByRole('button',{name:'Reset'}).click();
 assert.equal(await consent.isChecked(),false);
 assert.equal(await page.locator('.pdf-merger-item').count(),0);
 // 13 inputs force the dedicated Web Worker rather than the main-thread fallback.
 const many=[];
 for(let i=0;i<13;i++)many.push(await sample(i+1,1,i===0));
 await page.locator('#file-input').setInputFiles(many);
 await ready(13);
 await consent.check();
 await page.getByRole('button',{name:'Create PDF'}).click();
 const thirteen=await successful();
 assert.equal(thirteen.getPageCount(),13);
 assert.equal(thirteen.catalog.get(lib.PDFName.of('Outlines')),undefined);
 assert.ok(workers.some(url=>url.includes('pdf-merger-worker.js')),'Worker did not run for 13 PDFs');
 assert.deepEqual(errors,[]);
 console.log('PDF_MERGER_BOOKMARK_OPTIN_BROWSER_PASS '+engine+': 7 PDFs / 26 pages + 13-PDF worker, explicit consent and source safety');
}finally{await browser.close();}
