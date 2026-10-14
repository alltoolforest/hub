// Task 2: real browser pixel fidelity, orientation/crop, PNG alpha, JPEG, PDF rendering and KB guard.
// Browser matrix uses Chromium, Firefox and WebKit, without modifying frozen processing engines.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const browserType={chromium,firefox,webkit}[process.env.BROWSER||'chromium'];
if(!browserType)throw Error('Unknown browser target');
const browser=await browserType.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
async function ready(text,selector='.app-output-status'){
 await page.waitForFunction(([selector,value])=>document.querySelector(selector)?.textContent?.includes(value),
  [selector,text],{timeout:20000});
}
async function importFile(name,mimeType,buffer){
 await page.locator('#file-input').setInputFiles({name,mimeType,buffer});
 await ready('Selected: '+name,'.selected-files');
}
async function createImage(type){
 await page.locator('#format').selectOption(type);
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified'&&
  document.querySelector('.app-output-status')?.textContent?.startsWith('Ready: '),null,{timeout:20000});
 const download=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const item=await download;
 const bytes=await fs.readFile(await item.path());
 const pixels=await page.evaluate(async data=>{
  const bytes=new Uint8Array(data);
  const blob=new Blob([bytes]);
  const bitmap=await createImageBitmap(blob);
  const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
  const at=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
  const result={width:bitmap.width,height:bitmap.height,
   center:at(Math.floor(c.width/2),Math.floor(c.height/2)),
   tl:at(0,0),tr:at(c.width-1,0),
   top:at(Math.floor(c.width/2),Math.min(4,c.height-1)),
   bottom:at(Math.floor(c.width/2),Math.max(0,c.height-5)),
   left:at(Math.min(4,c.width-1),Math.floor(c.height/2)),
   right:at(Math.max(0,c.width-5),Math.floor(c.height/2))};
  bitmap.close();return result;
 },[...bytes]);
 return {bytes,pixels,filename:item.suggestedFilename()};
}
const red=px=>px[0]>190&&px[1]<85&&px[2]<85;
const blue=px=>px[2]>185&&px[0]<95&&px[1]<120;
try{
 await page.goto(base+'/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#format').waitFor();
 const pattern=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=80;c.height=40;
  const ctx=c.getContext('2d');ctx.fillStyle='#ee1e1e';ctx.fillRect(0,0,40,40);
  ctx.fillStyle='#1638e8';ctx.fillRect(40,0,40,40);
  return c.toDataURL('image/png').split(',')[1];
 });
 await importFile('quadrants.png','image/png',Buffer.from(pattern,'base64'));
 // Crop 50% right: exported pixel grid must match verified crop's 40x40 pixel extent.
 for(const [id,value] of [['app-crop-x','50'],['app-crop-y','0'],['app-crop-w','50'],['app-crop-h','100']])
  await page.locator('#'+id).fill(value);
 await page.getByRole('button',{name:'Apply crop values'}).click();
 await ready('Crop applied','.app-crop-help');
 assert.equal(await page.locator('#width').inputValue(),'40');
 let result=await createImage('image/png');
 assert.deepEqual([result.pixels.width,result.pixels.height],[40,40]);
 assert.ok(blue(result.pixels.center),'Right-half crop must remain blue');
 assert.ok(blue(result.pixels.left),'Right-half crop left pixel must remain blue');

 // Return to complete original; 90 clockwise rotation moves left-red region to top.
 await page.getByRole('button',{name:'Use full image'}).click();
 await page.locator('#rotation').selectOption('90');
 await page.locator('#width').fill('40');
 await page.locator('#height').fill('80');
 result=await createImage('image/png');
 assert.deepEqual([result.pixels.width,result.pixels.height],[40,80]);
 assert.ok(red(result.pixels.top),'90-degree clockwise top must originate from left');
 assert.ok(blue(result.pixels.bottom),'90-degree clockwise bottom must originate from right');

 // Horizontal mirror must reverse left/right without altering original source.
 await page.locator('#rotation').selectOption('0');
 await page.locator('#width').fill('80');
 await page.locator('#height').fill('40');
 await page.locator('#flip-x').check();
 result=await createImage('image/png');
 assert.ok(blue(result.pixels.left)&&red(result.pixels.right),'Flip X must mirror image');
 await page.locator('#flip-x').uncheck();

 // A transparent original stays transparent in PNG but composites onto white in JPG.
 const transparent=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=80;c.height=40;
  const ctx=c.getContext('2d');ctx.fillStyle='#111111';ctx.fillRect(35,8,10,24);
  return c.toDataURL('image/png').split(',')[1];
 });
 await importFile('transparent-signature.png','image/png',Buffer.from(transparent,'base64'));
 result=await createImage('image/png');
 assert.equal(result.pixels.tl[3],0,'PNG transparent corner retained');
 assert.ok(result.pixels.center[0]<45&&result.pixels.center[3]===255,'signature ink retained');
 result=await createImage('image/jpeg');
 assert.ok(result.pixels.tl.slice(0,3).every(v=>v>239),'JPEG transparent corner must be white');
 assert.ok(result.pixels.center.slice(0,3).every(v=>v<75),'JPEG ink remains legible');

 // Very tight KB limit must not silently force severe automatic JPEG degradation.
 await page.locator('#target').fill('0.1');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await ready('safe automatic quality floor','#status');
 assert.equal(await page.locator('#downloads a[download]').count(),1,
  'Failed tiny-target output must preserve successful JPEG');
 await page.locator('#target').fill('0');
 await page.locator('#format').selectOption('image/png');
 // The PDF export should preserve source transparency/ink and have true A4 one-page geometry.
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await ready('Ready: single-page A4 PDF');
 const pdfDl=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const pdf=await pdfDl;
 const pdfBytes=await fs.readFile(await pdf.path());
 const doc=await PDFLib.PDFDocument.load(pdfBytes);
 assert.equal(doc.getPageCount(),1);
 const {width,height}=doc.getPage(0).getSize();
 assert.ok(Math.abs(width-595.28)<.3&&Math.abs(height-841.89)<.3);
 const rendering=await page.evaluate(async data=>{
  const pdfjs=await import('/assets/vendor/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.mjs';
  const loaded=await pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false}).promise;
  const p=await loaded.getPage(1),viewport=p.getViewport({scale:1});
  const c=document.createElement('canvas');c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);
  const ctx=c.getContext('2d',{willReadFrequently:true});
  await p.render({canvasContext:ctx,viewport}).promise;
  const read=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
  const out={page:[c.width,c.height],outer:read(5,5),
    center:read(Math.floor(c.width/2),Math.floor(c.height/2))};
  await loaded.destroy();return out;
 },[...pdfBytes]);
 assert.ok(rendering.outer.slice(0,3).every(x=>x>245),'PDF page should be white');
 assert.ok(rendering.center.slice(0,3).every(x=>x<65),'PDF signature center should remain dark');
 assert.deepEqual(errors,[]);
 console.log('TASK2_FIDELITY_BROWSER_PASS '+(process.env.BROWSER||'chromium')+
  ': crop, rotation, flip, PNG alpha, JPG background, KB safeguard, rendered A4 PDF');
}finally{await browser.close();}
