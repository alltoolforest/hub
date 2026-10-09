// PDF Merger Task 1: real-browser queue validation and unchanged merge behavior.
// Uses actual bundled PDFLib, not a mocked parser.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),PDFLib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
page.setDefaultTimeout(25000);
const errors=[];page.on('pageerror',err=>errors.push(err.message));
const create=async(label,width)=>{
 const doc=await PDFLib.PDFDocument.create();doc.addPage([width,500]);
 return {name:label,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
};
const current=()=>page.locator('.file-list li');
const labels=()=>page.locator('.file-list li span').allTextContents();
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 const first=await create('first.pdf',301),second=await create('second.pdf',577),third=await create('third.pdf',703);
 await page.locator('#file-input').setInputFiles([first,second]);
 await page.waitForFunction(()=>document.querySelectorAll('.file-list li').length===2);
 assert.match((await labels())[0],/first.pdf.*1 page/);
 assert.match((await labels())[1],/second.pdf.*1 page/);
 // Preserve established ↑ ↓ file order behavior.
 await current().nth(1).getByRole('button',{name:'↑'}).click();
 assert.match((await labels())[0],/second.pdf/);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#downloads a[download]')!==null);
 const dl=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const result=await dl;
 const bytes=await readFile(await result.path());
 const merged=await PDFLib.PDFDocument.load(bytes);
 assert.deepEqual(merged.getPages().map(p=>Math.round(p.getWidth())),[577,301]);
 const previousLinks=await page.locator('#downloads a[download]').count();
 // Transactional failure: one good PDF followed by invalid content.
 await page.locator('#file-input').setInputFiles([third,{
  name:'invalid.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid file')
 }]);
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent==='Could not open the selected file.');
 assert.equal(await current().count(),2);
 assert.match((await labels())[0],/second.pdf/);
 assert.match((await labels())[1],/first.pdf/);
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/Previously selected 2 PDF\(s\) retained/);
 assert.equal(await page.locator('#downloads a[download]').count(),previousLinks);
 // A malformed but header-looking PDF fails engine parsing.
 await page.locator('#file-input').setInputFiles({name:'corrupt.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nCorrupt body')});
 await page.waitForFunction(()=>document.querySelector('.pdf-merger-admission')?.textContent?.includes('corrupt.pdf'));
 assert.equal(await current().count(),2);
 // Proper file remains usable after failure, a new batch appends atomically.
 await page.locator('#file-input').setInputFiles(third);
 await page.waitForFunction(()=>document.querySelectorAll('.file-list li').length===3);
 assert.match((await labels())[2],/third.pdf/);
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/3 PDF\(s\).*3 page/);
 await current().nth(2).getByRole('button',{name:'Remove'}).click();
 assert.equal(await current().count(),2);
 // Zero-page PDF rejected before admission.
 const blank=await PDFLib.PDFDocument.create();
 await page.locator('#file-input').setInputFiles({name:'blank.pdf',mimeType:'application/pdf',buffer:Buffer.from(await blank.save())});
 await page.waitForFunction(()=>document.querySelector('.pdf-merger-admission')?.textContent?.includes('no usable PDF pages'));
 assert.equal(await current().count(),2);
 assert.deepEqual(errors,[]);
 const width=await page.evaluate(()=>document.querySelector('#workspace').scrollWidth-document.querySelector('#workspace').clientWidth);
 assert.ok(width<=2,'Unexpected mobile horizontal overflow: '+width);
 console.log('PDF_MERGER_TASK1_BROWSER_PASS '+engine+': multi-select, PDF page metadata, reorder and output, transactional error rollback, malformed/blank PDF, retry, mobile');
}finally{await browser.close();}
