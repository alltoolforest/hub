// Task 3: actual PDF first-page previews, mobile arrangement, keyboard/aria and graceful preview failure.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
import axe from 'axe-core';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium';
const browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:740},acceptDownloads:true});
page.setDefaultTimeout(35000);
const errors=[],leaks=[];
page.on('pageerror',err=>errors.push(err.message));
page.on('request',req=>{
 const path=req.url();
 if(req.method()!=='GET'&&req.method()!=='HEAD'&&!path.startsWith('data:')&&!path.startsWith('blob:'))leaks.push(req.method()+' '+path);
});
async function pdf(name,width,rotation=0){
 const document=await lib.PDFDocument.create();
 const one=document.addPage([width,500]);
 one.setRotation(lib.degrees(rotation));
 one.drawRectangle({x:10,y:10,width:width-20,height:25,color:lib.rgb(.2,.3,.4)});
 return {name,mimeType:'application/pdf',buffer:Buffer.from(await document.save())};
}
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').setInputFiles([
  await pdf('Alpha.pdf',390),
  await pdf('Beta.pdf',540,90),
  await pdf('Very long 文字国际-'.repeat(8)+'.pdf',600)
 ]);
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===3);
 const rows=page.locator('.pdf-merger-item');
 assert.equal(await page.locator('.pdf-merger-file-title').count(),3);
 assert.match(await page.locator('.pdf-merger-admission').textContent(),/3 PDF\(s\) · 3 page\(s\)/);
 // Preview must contain actual non-blank first-page pixels.
 await rows.first().locator('.pdf-merger-preview-frame').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.pdf-merger-item .pdf-merger-thumbnail')?.width>0 &&
   !document.querySelector('.pdf-merger-item .pdf-merger-thumbnail')?.hidden,{timeout:30000});
 const pixels=await rows.first().locator('canvas').evaluate(c=>{
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  const white=[...data].filter((n,i)=>i%4!==3 && n<245).length;
  return {width:c.width,height:c.height,white};
 });
 assert.ok(pixels.width<=158&&pixels.height<=210&&pixels.white>25,JSON.stringify(pixels));
 await rows.nth(1).locator('.pdf-merger-preview-frame').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-thumbnail:not([hidden])').length>=2,{timeout:30000});
 // Keyboard moves preserve focus and announce the new sequence.
 const up=rows.nth(1).getByRole('button',{name:'Move up Beta.pdf'});
 await up.focus();await page.keyboard.press('Enter');
 assert.match(await rows.first().locator('.pdf-merger-file-title').textContent(),/Beta.pdf/);
 assert.match(await page.locator('.pdf-merger-queue-live').textContent(),/Moved Beta.pdf to position 1 of 3/);
 const focus1=await page.evaluate(()=>({label:document.activeElement.getAttribute('aria-label'),tag:document.activeElement.tagName}));
 assert.equal(focus1.tag,'BUTTON');
 assert.equal(focus1.label,'Move down Beta.pdf');
 await page.keyboard.press('Enter');
 assert.match(await rows.nth(1).locator('.pdf-merger-file-title').textContent(),/Beta.pdf/);
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Move down Beta.pdf');
 // The same focused control should support another move without restarting keyboard navigation.
 await page.keyboard.press('Enter');
 assert.match(await rows.nth(2).locator('.pdf-merger-file-title').textContent(),/Beta.pdf/);
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Move up Beta.pdf');
 // Restore the file order used for the existing output-order acceptance check.
 await rows.nth(2).getByRole('button',{name:'Move up Beta.pdf'}).click();
 const removal=rows.nth(2).getByRole('button',{name:'Remove'});
 await removal.focus();await page.keyboard.press('Enter');
 assert.equal(await rows.count(),2);
 assert.match(await page.locator('.pdf-merger-queue-live').textContent(),/Removed/);
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'BUTTON');
 assert.match(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')||''),/Remove/);
 // Basic merge remains accurate after visually arranging files.
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const download=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const merged=await lib.PDFDocument.load(await readFile(await (await download).path()));
 assert.deepEqual(merged.getPages().map(p=>Math.round(p.getWidth())),[390,540]);
 const overflow=await page.evaluate(()=>{
  const workspace=document.querySelector('#workspace');
  return workspace.scrollWidth-workspace.clientWidth;
 });
 assert.ok(overflow<=2,'360px mobile workspace overflow '+overflow);
 if(engine==='chromium'){
  await page.addScriptTag({content:axe.source});
  const report=await page.evaluate(()=>window.axe.run(document.querySelector('#workspace'),{
   runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},
   resultTypes:['violations']
  }));
  const high=report.violations.filter(item=>['serious','critical'].includes(item.impact));
  assert.equal(high.length,0,JSON.stringify(high.map(item=>({id:item.id,nodes:item.nodes.map(n=>n.target)}))));
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(leaks,[]);
 // Make sure a PDF renderer failure does NOT make a valid source unusable.
 const second=await browser.newPage({viewport:{width:360,height:740},acceptDownloads:true});
 await second.route('**/assets/vendor/pdf.mjs',route=>route.fulfill({
  status:200,contentType:'application/javascript',body:"throw Error('test preview renderer unavailable')"
 }));
 try{
  await second.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
  await second.locator('#file-input').setInputFiles([await pdf('fallback-a.pdf',321),await pdf('fallback-b.pdf',470)]);
  await second.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===2);
  await second.waitForFunction(()=>document.querySelector('.pdf-merger-preview-status')?.textContent?.includes('Preview unavailable'),null,{timeout:30000});
  await second.getByRole('button',{name:'Create PDF'}).click();
  await second.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 }finally{await second.close();}
 console.log('PDF_MERGER_TASK3_BROWSER_PASS '+engine+': real first-page thumbnail, mobile order, keyboard focus, aria, preview fallback and unchanged merge');
}finally{await browser.close();}
