// Task 1 browser verification: actual user requirements, stale download status, recovery, PDF output.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
const contains=(selector,value)=>page.waitForFunction(
 ([selector,value])=>document.querySelector(selector)?.textContent?.includes(value),
 [selector,value],{timeout:20000});
try{
 await page.goto(base+'/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#min-kb').waitFor();
 const source=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=140;c.height=60;
  const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,140,60);
  ctx.fillStyle='black';ctx.fillText('Signature Sample',10,30);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({
  name:'signature.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')
 });
 await contains('.selected-files','Selected: signature.png');
 await page.locator('#min-kb').fill('50');
 await page.locator('#target').fill('10');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await contains('#status','Minimum file size cannot exceed');
 assert.equal(await page.locator('#downloads a[download]').count(),0);
 await page.locator('#min-kb').fill('0');
 await page.locator('#target').fill('0');
 await page.locator('#format').selectOption('image/png');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await contains('.app-output-status','Verified: file bytes, decoded dimensions');
 assert.equal(await page.locator('.app-output-status').getAttribute('data-output-state'),'verified');
 assert.equal(await page.locator('#downloads a[download]').count(),1);

 // A changed requirement must mark the retained download as outdated, even if reverted.
 await page.locator('#min-kb').fill('10');
 await contains('.app-output-status','Outdated result');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#min-kb').fill('0');
 assert.equal(await page.locator('.app-output-status').getAttribute('data-output-state'),'outdated');

 // Impossible minimum leaves the last good export available, and shows an actionable error.
 await page.locator('#min-kb').fill('100');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await contains('#status','below the requested minimum');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#min-kb').fill('0');

 // Unapplied numeric crop edits must not silently produce an old-crop output.
 await page.locator('#app-crop-x').fill('20');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await contains('#status','Crop values have not been applied');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#app-crop-w').fill('80');
 await page.getByRole('button',{name:'Apply crop values'}).click();
 await contains('.app-crop-help','Crop applied');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await contains('.app-output-status','Ready: 112 × 60 px');
 assert.equal(await page.locator('.app-output-status').getAttribute('data-output-state'),'verified');

 const event=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const downloaded=await event;
 assert.match(downloaded.suggestedFilename(),/\.png$/);

 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await contains('.app-output-status','Verified: PDF file bytes, one A4 page');
 assert.equal(await page.locator('.app-output-status').getAttribute('data-output-state'),'verified');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.deepEqual(errors,[]);
 console.log('TASK1_BROWSER_PASS: ranges, verified exports, stale downloads, crop guard, PDF round-trip');
}finally{await browser.close();}
