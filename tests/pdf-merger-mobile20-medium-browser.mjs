// True image-heavy mobile-browser worker benchmark (20 PDFs, ~75MB total input).
// Uses an emulated phone viewport, not physical Android/iOS device certification.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const MB=1024*1024;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true,hasTouch:true});
page.setDefaultTimeout(180000);
const workers=[],errors=[];
page.on('worker',w=>workers.push(w.url()));
page.on('pageerror',e=>errors.push(e.message));
function chunk(tag,body){
 const out=Buffer.allocUnsafe(body.length+12);
 out.writeUInt32BE(body.length,0);out.write(tag,4,4,'ascii');body.copy(out,8);
 let crc=0xffffffff;
 for(let i=4;i<8+body.length;i++){crc^=out[i];for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 out.writeUInt32BE((crc^0xffffffff)>>>0,8+body.length);
 return out;
}
function createPng(){
 const width=1152,height=1152,scan=Buffer.allocUnsafe(height*(width*3+1));
 let seed=0x753c91a1;
 for(let y=0;y<height;y++){
  let pos=y*(width*3+1);scan[pos++]=0;
  for(let x=0;x<width*3;x++){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   scan[pos++]=seed>>>24;
  }
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
  chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan,{level:1})),chunk('IEND',Buffer.alloc(0))]);
}
const start=Date.now();
try{
 const png=createPng(),files=[];
 let sourceBytes=0;
 for(let i=0;i<20;i++){
  const doc=await lib.PDFDocument.create(),photo=await doc.embedPng(png);
  for(let p=0;p<20;p++){
   const page=doc.addPage([400+i*5,600+p]);
   if(p===0)page.drawImage(photo,{x:20,y:20,width:350,height:520});
   if(p===1)page.setRotation(lib.degrees(90));
  }
  const bytes=Buffer.from(await doc.save());
  files.push({name:'medium-'+(i+1)+'.pdf',mimeType:'application/pdf',buffer:bytes});
  sourceBytes+=bytes.length;
 }
 assert.ok(sourceBytes>65*MB,'Expected real multi-megabyte PDF fixtures, got '+Math.round(sourceBytes/MB)+'MB');
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 await page.locator('#file-input').setInputFiles(files);
 await page.waitForFunction(()=>document.querySelectorAll('.pdf-merger-item').length===20 &&
  document.querySelector('.pdf-merger-admission')?.textContent?.includes('400 page(s)'),null,{timeout:180000});
 const beforeMerge=Date.now();
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>{
  const status=document.querySelector('#status');
  return status?.textContent?.includes('verified and ready')||status?.classList.contains('error');
 },null,{timeout:180000});
 const text=await page.locator('#status').textContent();
 assert.match(text,/verified and ready/,text);
 assert.ok(workers.some(v=>v.includes('pdf-merger-worker.js')),'Worker was not launched');
 const download=page.waitForEvent('download');
 await page.locator('#downloads a[download]').click();
 const bytes=await readFile(await (await download).path());
 assert.ok(bytes.length>60*MB,'Merged image output unexpectedly small '+Math.round(bytes.length/MB)+'MB');
 const merged=await lib.PDFDocument.load(bytes);
 assert.equal(merged.getPageCount(),400);
 for(let i=0;i<20;i++){
  assert.equal(Math.round(merged.getPage(i*20).getWidth()),400+i*5);
  assert.equal(merged.getPage(i*20+1).getRotation().angle,90);
 }
 const overflow=await page.evaluate(()=>{
  const root=document.querySelector('#workspace');return root.scrollWidth-root.clientWidth;
 });
 assert.ok(overflow<=2,'390px viewport horizontal overflow '+overflow);
 assert.deepEqual(errors,[]);
 console.log('PDF_MERGER_MOBILE20_MEDIUM_BROWSER_PASS: 20 genuine image-heavy PDFs, 400 verified pages, '+Math.round(sourceBytes/MB)+'MB source, '+Math.round(bytes.length/MB)+'MB output, '+((Date.now()-beforeMerge)/1000).toFixed(1)+'s background merge, '+((Date.now()-start)/1000).toFixed(1)+'s total in emulated mobile Chromium');
}finally{await browser.close();}
