// 20-PDF mobile browser integration: real worker, 400-page output and responsive UI.
// Mobile-like viewport/touch emulation, not a physical device certification.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true,hasTouch:true});
page.setDefaultTimeout(90000);
const errors=[],workers=[],nonlocal=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('worker',w=>workers.push(w.url()));
page.on('request',r=>{
 if(!r.url().startsWith('http://127.0.0.1:8765/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))
  nonlocal.push(r.method()+' '+r.url());
});
async function sample(i){
 const doc=await lib.PDFDocument.create();
 const font=await doc.embedFont(lib.StandardFonts.Helvetica);
 for(let p=0;p<20;p++){
  const pg=doc.addPage([350+i*7,480+p]);
  if(p===0&&i%3===0)pg.setRotation(lib.degrees(90));
  pg.drawText('MOBILE PDF '+(i+1)+' PAGE '+(p+1),{font,x:24,y:240,size:13});
 }
 return {name:'mobile-'+String(i+1).padStart(2,'0')+'.pdf',
  mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
}
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 const files=[];
 for(let i=0;i<20;i++)files.push(await sample(i));
 await page.locator('#file-input').setInputFiles(files);
 await page.waitForFunction(()=>{
  const summary=document.querySelector('.pdf-merger-admission')?.textContent||'';
  return document.querySelectorAll('.pdf-merger-item').length===20 &&
   summary.includes('20 PDF(s)') && summary.includes('400 page(s)');
 },null,{timeout:90000});
 assert.equal(await page.locator('.pdf-merger-file-title').count(),20);
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/35 files, 1200 pages, 200 MB total/);
 const first=await page.locator('.pdf-merger-file-title').first().textContent();
 const last=await page.locator('.pdf-merger-file-title').last().textContent();
 assert.match(first,/mobile-01\.pdf/);assert.match(last,/mobile-20\.pdf/);
 const t0=Date.now();
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>{
  const text=document.querySelector('#status')?.textContent||'';
  return text.includes('verified and ready')||document.querySelector('#status')?.classList.contains('error');
 },null,{timeout:90000});
 const message=await page.locator('#status').textContent();
 assert.match(message,/verified and ready/,message);
 assert.ok(workers.some(url=>url.includes('pdf-merger-worker.js')),
  '20 files must trigger background Worker: '+JSON.stringify(workers));
 const waitDownload=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const bytes=await readFile(await (await waitDownload).path());
 const pdf=await lib.PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(),400);
 for(let i=0;i<20;i++){
  const p=pdf.getPage(i*20);
  assert.equal(Math.round(p.getWidth()),350+i*7,'document '+(i+1)+' order');
  assert.equal(p.getRotation().angle,i%3===0?90:0);
 }
 for(const width of [320,360,390,700]){
  await page.setViewportSize({width,height:844});
  const overflow=await page.evaluate(()=>{
   const root=document.querySelector('#workspace');
   return root.scrollWidth-root.clientWidth;
  });
  assert.ok(overflow<=2,'Mobile horizontal overflow at '+width+'px: '+overflow);
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(nonlocal,[]);
 console.log('PDF_MERGER_MOBILE20_BROWSER_PASS '+engine+': 20 PDFs, 400 ordered verified pages, real background worker, mobile widths, '+(Date.now()-t0)+'ms merging');
}finally{await browser.close();}
