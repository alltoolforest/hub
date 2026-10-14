// Task 3 actual-browser reliability: landscape device budgets, import preflight,
// repeated processing, failed-file recovery, and live image/PDF exports.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const kind=process.env.BROWSER||'chromium';
const browser=await ({chromium,firefox,webkit}[kind]).launch({headless:true});
const context=await browser.newContext({
 viewport:{width:1280,height:720},
 acceptDownloads:true,
 userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Mobile Safari/537.36'
});
const page=await context.newPage(),exceptions=[],external=[];
page.on('pageerror',e=>exceptions.push(e.message));
page.on('request',r=>{if(!/^http:\/\/127\.0\.0\.1:8765\//.test(r.url())&&
 !/^(blob:|data:|about:)/.test(r.url()))external.push(r.url());});
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
async function statusIncludes(value){
 await page.waitForFunction(v=>document.querySelector('#status')?.textContent?.includes(v),value,{timeout:25000});
}
async function open(name,mimeType,buffer){
 await page.locator('#file-input').setInputFiles({name,mimeType,buffer});
 await page.waitForFunction(v=>document.querySelector('.selected-files')?.textContent?.includes(v),
  'Selected: '+name,{timeout:25000});
}
async function exportImage(){
 const btn=page.getByRole('button',{name:'Create image',exact:true});
 await btn.click();
 await page.waitForFunction(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Create image');
  return b&&!b.disabled&&document.querySelector('.app-output-status')?.dataset.outputState==='verified'&&
   document.querySelector('#downloads a[download]');
 },null,{timeout:25000});
 assert.equal(await page.locator('#downloads a[download]').count(),1);
}
function headerPng(width,height){
 const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 Buffer.from('IHDR').copy(bytes,12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
 return bytes;
}
function headerHeic(width,height){
 const bytes=Buffer.alloc(60);bytes.writeUInt32BE(24,0);bytes.write('ftypheic',4);
 bytes.writeUInt32BE(20,28);bytes.write('ispe',32);
 bytes.writeUInt32BE(width,40);bytes.writeUInt32BE(height,44);return bytes;
}
try{
 await page.goto(base+'/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#width').waitFor();
 const budget=await page.evaluate(async()=>{
  const {applicationResourceProfile}=await import('/assets/js/application-prep-resources.js');
  return applicationResourceProfile({userAgent:navigator.userAgent,viewportWidth:innerWidth,
   deviceMemory:navigator.deviceMemory,coarsePointer:matchMedia('(pointer: coarse)').matches,
   touchPoints:navigator.maxTouchPoints||0});
 });
 assert.equal(budget.constrained,true,'Android landscape must retain mobile limits');
 assert.equal(budget.outputPixels,8_000_000);
 const sample=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=2400;c.height=1800;
  const ctx=c.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#123a51';ctx.fillRect(300,300,1800,1200);
  ctx.fillStyle='#e5ebd7';ctx.font='100px sans-serif';ctx.fillText('APPLICATION SAMPLE',340,520);
  return c.toDataURL('image/png').split(',')[1];
 });
 await open('medium-photo.png','image/png',Buffer.from(sample,'base64'));
 await page.locator('#width').fill('3200');
 await page.locator('#height').fill('2800');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await statusIncludes('Output image dimensions exceed this device limit');
 assert.equal(await page.locator('#downloads a[download]').count(),0);
 await page.locator('#width').fill('600');
 await page.locator('#height').fill('450');
 const initial=Date.now();
 for(let i=0;i<6;i++)await exportImage();
 assert.ok(Date.now()-initial<120000,'Repeated small exports should not hang');
 // A failed replacement must preserve the existing source and download.
 await page.locator('#file-input').setInputFiles({
  name:'oversized-image.png',mimeType:'image/png',buffer:headerPng(6000,5000)
 });
 await statusIncludes('Source image dimensions exceed this device limit');
 assert.equal(await page.locator('#width').inputValue(),'600');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 // HEIC expansion must be rejected from its metadata, without invoking HEIC converter.
 await page.locator('#file-input').setInputFiles({
  name:'oversized.heic',mimeType:'image/heic',buffer:headerHeic(6000,4000)
 });
 await statusIncludes('HEIC/HEIF source image dimensions exceed this device limit');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 // Missing dimensions must fail before decode, not produce an indefinite wait.
 await page.locator('#file-input').setInputFiles({
  name:'unknown.webp',mimeType:'image/webp',buffer:Buffer.from('not a supported WebP')
 });
 await statusIncludes('Could not verify image dimensions before decoding');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await exportImage();
 // Test PDF output after multiple operations and errors.
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified'&&
  document.querySelector('.app-output-status')?.textContent?.startsWith('Ready: single-page A4 PDF'),
  null,{timeout:30000});
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 assert.deepEqual(exceptions,[]);
 assert.deepEqual(external,[]);
 console.log('TASK3_BROWSER_PASS '+kind+': landscape mobile budget, large image/HEIC preflight, repeat exports, failed import recovery, PDF');
}finally{await browser.close();}
