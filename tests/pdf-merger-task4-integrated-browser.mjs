// PDF Merger Task 4 — actual browser privacy, filename safety, mobile/tablet/desktop
// semantics, accessibility and complete merge through the verified output engine.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
import axe from 'axe-core';
const require=createRequire(import.meta.url),pdfLib=require('../assets/vendor/pdf-lib.js');
const engine=process.env.BROWSER||'chromium',browser=await {chromium,firefox,webkit}[engine].launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:760},acceptDownloads:true});
page.setDefaultTimeout(30000);
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
const SECRET='PRIVATE-PDF-CONTENT-NEVER-UPLOAD-76219';
const unsafeName='<img src=x onerror=window.__pdfMergerInjected=true>.pdf';
const mk=async(name,width)=>{
 const doc=await pdfLib.PDFDocument.create(),pg=doc.addPage([width,700]);
 const font=await doc.embedFont(pdfLib.StandardFonts.Helvetica);
 pg.drawText(SECRET,{x:10,y:320,font,size:8});
 return {name,mimeType:'application/pdf',buffer:Buffer.from(await doc.save())};
};
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 const meta=await page.evaluate(()=>({
  lang:document.documentElement.lang,
  title:document.title,
  description:document.querySelector('meta[name="description"]')?.content,
  h1:document.querySelector('h1')?.textContent,
  copy:document.querySelector('.pdf-merger-queue-hint')?.textContent||'',
  privacy:[...document.querySelectorAll('#workspace .notice')].map(e=>e.textContent).join(' ')
 }));
 assert.equal(meta.lang,'en');
 assert.match(meta.title,/PDF Merger/);
 assert.match(meta.description,/PDF/);
 assert.equal(meta.h1.trim(),'PDF Merger');
 assert.match(meta.copy,/numbered order is the merge order/);
 assert.match(meta.privacy,/Browser-based page copying may not preserve bookmarks/);
 await page.locator('#file-input').setInputFiles([
  await mk(unsafeName,390),await mk('résumé — global.pdf',540)
 ]);
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===2);
 const source=page.locator('.pdf-merger-item');
 assert.equal(await page.evaluate(()=>window.__pdfMergerInjected),undefined);
 assert.match(await source.first().locator('.pdf-merger-file-title').textContent(),/<img src=x onerror=/);
 assert.equal(await page.locator('.pdf-merger-item img').count(),0);
 assert.equal(await source.first().getByRole('button',{name:'Move up '+unsafeName}).isDisabled(),true);
 const a=await source.nth(1).getByRole('button',{name:'Move up résumé — global.pdf'});
 await a.focus();
 await page.keyboard.press('Enter');
 assert.match(await source.first().locator('.pdf-merger-file-title').textContent(),/résumé — global/);
 assert.match(await page.locator('.pdf-merger-queue-live').textContent(),/Moved résumé — global.pdf to position 1/);
 // The focus target changes to the next available action when Move Up is disabled.
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Move down résumé — global.pdf');
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const d=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const bytes=await readFile(await (await d).path());
 const merged=await pdfLib.PDFDocument.load(bytes);
 assert.deepEqual(merged.getPages().map(p=>Math.round(p.getWidth())),[540,390]);
 // Layout/keyboard/a11y audit at narrow mobile, typical phone, tablet and desktop.
 for(const width of [320,360,390,768,1280]){
  await page.setViewportSize({width,height:760});
  const layout=await page.evaluate(()=>{
   const container=document.querySelector('#workspace');
   return {overflow:container.scrollWidth-container.clientWidth,
    btnHeight:Math.round(document.querySelector('.pdf-merger-file-controls button').getBoundingClientRect().height),
    status:document.querySelector('#status')?.getAttribute('role')
   };
  });
  assert.ok(layout.overflow<=2,width+'px workspace overflow: '+JSON.stringify(layout));
  assert.ok(layout.btnHeight>=44,width+'px action tap target less than 44px');
  assert.equal(layout.status,'status');
 }
 if(engine==='chromium'){
  await page.addScriptTag({content:axe.source});
  const result=await page.evaluate(()=>window.axe.run(document.querySelector('#workspace'),{
   runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},
   resultTypes:['violations']
  }));
  const blockers=result.violations.filter(x=>['serious','critical'].includes(x.impact));
  assert.deepEqual(blockers.map(x=>x.id),[],'Serious WCAG violations: '+JSON.stringify(blockers));
 }
 const unexpected=requests.filter(r=>r.method!=='GET'&&r.method!=='HEAD'||
  r.url.includes(SECRET));
 assert.deepEqual(unexpected,[],'Potential document egress: '+JSON.stringify(unexpected));
 assert.deepEqual(errors,[],'Unexpected browser exceptions');
 console.log('PDF_MERGER_TASK4_BROWSER_PASS '+engine+': private local PDF workflow, safe untrusted filenames, 5 responsive widths, accessible keyboard queue, verified order, SEO essentials');
}finally{await browser.close();}
