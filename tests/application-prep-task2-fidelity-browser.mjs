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
page.on('console',message=>{if(message.type()==='error')console.log('HEIC_BROWSER_CONSOLE '+message.text().slice(0,500));});
await page.addInitScript(()=>{
 window.__appCspViolations=[];
 document.addEventListener('securitypolicyviolation',event=>{
  window.__appCspViolations.push({directive:event.violatedDirective,
   blocked:event.blockedURI,source:event.sourceFile});
 });
});
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
async function ready(text,selector='.app-output-status'){
 await page.waitForFunction(([selector,value])=>document.querySelector(selector)?.textContent?.includes(value),
  [selector,text],{timeout:20000});
}
async function importFile(name,mimeType,buffer){
 await page.locator('#file-input').setInputFiles({name,mimeType,buffer});
 try{await ready('Selected: '+name,'.selected-files');}
 catch(error){
  const message=await page.locator('#status').textContent().catch(()=>'<no status>');
  const violations=await page.evaluate(()=>window.__appCspViolations||[]).catch(()=>[]);
  console.error('HEIC_CSP_DIAGNOSTICS '+JSON.stringify(violations));
  throw Error('Image import '+name+' failed. Tool status: '+message+'. Original error: '+error.message);
 }
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

 // Return to complete original; reveal advanced controls before using rotation/flip.
 await page.locator('.app-advanced-settings summary').click();
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
  // Compatibility shims only for the test's PDF.js visual inspection.
  // This does not modify the production viewer or exported PDF.
  if(!Map.prototype.getOrInsertComputed)Object.defineProperty(Map.prototype,'getOrInsertComputed',{
   value:function(key,callback){if(!this.has(key))this.set(key,callback(key));return this.get(key);},
   configurable:true
  });
  if(!Map.prototype.getOrInsert)Object.defineProperty(Map.prototype,'getOrInsert',{
   value:function(key,value){if(!this.has(key))this.set(key,value);return this.get(key);},
   configurable:true
  });
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
  return out; // Browser context cleanup releases the test-only renderer.
 },[...pdfBytes]);
 assert.ok(rendering.outer.slice(0,3).every(x=>x>245),'PDF page should be white');
 assert.ok(rendering.center.slice(0,3).every(x=>x<65),'PDF signature center should remain dark');
 // A JPEG-backed PDF with a feasible cap must be compressed against the
 // actual final PDF size, not only the intermediate JPEG byte count.
 const detailSource=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=420;c.height=300;
  const ctx=c.getContext('2d');
  const image=ctx.createImageData(c.width,c.height);let seed=11935;
  for(let i=0;i<image.data.length;i+=4){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const value=(seed>>>24);
   image.data[i]=value;image.data[i+1]=(value*7)%256;
   image.data[i+2]=(value*13)%256;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);return c.toDataURL('image/png').split(',')[1];
 });
 await importFile('detailed-document.png','image/png',Buffer.from(detailSource,'base64'));
 await page.locator('#format').selectOption('image/jpeg');
 const jpegSizes=await page.locator('.canvas-frame canvas').evaluate(async c=>{
  const toSize=quality=>new Promise(resolve=>c.toBlob(b=>resolve(b.size),'image/jpeg',quality));
  return [await toSize(.35),await toSize(.90)];
 });
 assert.ok(jpegSizes[1]>jpegSizes[0]+12000,'JPEG quality range should be meaningful for this photo');
 const targetKB=Math.ceil((jpegSizes[0]+jpegSizes[1])/2048);
 assert.ok(targetKB*1024>jpegSizes[0]+4000);
 await page.locator('#target').fill(String(targetKB));
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified'&&
  document.querySelector('.app-output-status')?.textContent?.startsWith('Ready: single-page A4 PDF'),
  null,{timeout:20000});
 const constrainedDownload=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const constrained=await constrainedDownload;
 const constrainedBytes=await fs.readFile(await constrained.path());
 assert.ok(constrainedBytes.length<=targetKB*1024,
  'Final JPEG-backed PDF must satisfy the actual KB limit including container overhead');
 const constrainedDoc=await PDFLib.PDFDocument.load(constrainedBytes);
 assert.equal(constrainedDoc.getPageCount(),1);
 await page.locator('#target').fill('0');

 // A camera JPEG with EXIF orientation 6 must load once, with upright dimensions
 // and correct spatial ordering after metadata is stripped by canvas export.
 const jpegRaw=Buffer.from(await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=80;c.height=40;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#ee1e1e';ctx.fillRect(0,0,40,40);
  ctx.fillStyle='#1638e8';ctx.fillRect(40,0,40,40);
  return c.toDataURL('image/jpeg',.98).split(',')[1];
 }), 'base64');
 const exif=Buffer.from([
  255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,
  1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0
 ]);
 await importFile('camera-orientation-6.jpg','image/jpeg',
  Buffer.concat([jpegRaw.subarray(0,2),exif,jpegRaw.subarray(2)]));
 assert.equal(await page.locator('#width').inputValue(),'40','EXIF orientation width must be upright');
 assert.equal(await page.locator('#height').inputValue(),'80','EXIF orientation height must be upright');
 await page.locator('#rotation').selectOption('0');
 const upright=await createImage('image/jpeg');
 assert.deepEqual([upright.pixels.width,upright.pixels.height],[40,80]);
 assert.ok(red(upright.pixels.top)&&blue(upright.pixels.bottom),
  'EXIF orientation must not be applied twice or ignored');

 // Positive HEIC/HEIF decode, using the pinned sample already used by the
 // repository's existing image-enhancer compatibility tests.
 const fixtureURL='https://raw.githubusercontent.com/alexcorvi/heic2any/169513b18329dbcb4dd5f86550aac6e975f0acf9/demo/1.heic';
 const fixtureResponse=await fetch(fixtureURL);
 assert.ok(fixtureResponse.ok,'Pinned HEIC compatibility fixture must be available');
 const heicBytes=Buffer.from(await fixtureResponse.arrayBuffer());
 assert.ok(heicBytes.length>1024);
 await page.setViewportSize({width:1280,height:800});
 await importFile('actual-photo.heic','image/heic',heicBytes);
 const heicWidth=Number(await page.locator('#width').inputValue());
 const heicHeight=Number(await page.locator('#height').inputValue());
 assert.ok(heicWidth>0&&heicHeight>0,'Decoded HEIC dimensions must be valid');
 // Keep the fidelity test focused on a practical small export.
 await page.locator('#width').fill('320');
 await page.locator('#format').selectOption('image/jpeg');
 const converted=await createImage('image/jpeg');
 assert.equal(converted.pixels.width,320);
 assert.ok(converted.pixels.height>0);
 assert.deepEqual(errors,[]);
 console.log('TASK2_FIDELITY_BROWSER_PASS '+(process.env.BROWSER||'chromium')+
  ': crop, rotation, flip, PNG alpha, JPG background, KB safeguard, rendered A4 PDF, EXIF, HEIC');
}finally{await browser.close();}
