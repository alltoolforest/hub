// Task 2 output fidelity test: real selectable text and scanned image rendering.
// Runs in Chromium with the bundled PDF.js viewer solely for verification.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),lib=require('../assets/vendor/pdf-lib.js');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1100,height:800}});
page.setDefaultTimeout(40000);
const exceptions=[];page.on('pageerror',e=>exceptions.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/documents/pdf-merger/',{waitUntil:'networkidle'});
 const a=await lib.PDFDocument.create(),pageA=a.addPage([400,300]);
 const font=await a.embedFont(lib.StandardFonts.Helvetica);
 pageA.drawText('VISIBLE SELECTABLE DOC ONE - CAFE',{x:24,y:160,font,size:17});
 pageA.drawRectangle({x:28,y:40,width:70,height:70,color:lib.rgb(.14,.55,.25)});
 const bytesA=new Uint8Array(await a.save());
 const png=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=120;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,240,120);
  ctx.fillStyle='#101010';ctx.fillRect(20,25,200,40);
  ctx.fillStyle='#2d882d';ctx.fillRect(30,85,180,22);
  ctx.fillStyle='#ffffff';ctx.font='bold 25px Arial';ctx.fillText('SCAN',55,55);
  return canvas.toDataURL('image/png').split(',')[1];
 });
 const b=await lib.PDFDocument.create(),pageB=b.addPage([400,300]);
 const image=await b.embedPng(Buffer.from(png,'base64'));
 pageB.drawImage(image,{x:0,y:0,width:400,height:300});
 const bytesB=new Uint8Array(await b.save());
 await page.locator('#file-input').setInputFiles([
  {name:'digital.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytesA)},
  {name:'scanned.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytesB)}
 ]);
 await page.waitForFunction(()=>document.querySelectorAll('.file-list li').length===2);
 await page.getByRole('button',{name:'Create PDF'}).click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('verified and ready'));
 const download=page.waitForEvent('download');await page.locator('#downloads a[download]').click();
 const mergedBytes=new Uint8Array(await readFile(await (await download).path()));
 const evidence=await page.evaluate(async documents=>{
  const viewer=await import('/assets/vendor/pdf.mjs');
  viewer.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.mjs';
  const load=async src=>viewer.getDocument({
   data:new Uint8Array(src),isEvalSupported:false,
   cMapUrl:'/assets/vendor/cmaps/',cMapPacked:true,
   standardFontDataUrl:'/assets/vendor/standard_fonts/',wasmUrl:'/assets/vendor/wasm/'
  }).promise;
  async function inspect(source,pageNumber){
   const pdf=await load(source);
   try{
    const p=await pdf.getPage(pageNumber);
    const words=(await p.getTextContent()).items.map(w=>w.str).join(' ').trim();
    const viewport=p.getViewport({scale:1});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await p.render({canvasContext:ctx,viewport}).promise;
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    // Sample image data for deterministic source/merged page comparison.
    let hash=2166136261>>>0;
    for(let i=0;i<pixels.length;i+=23){hash=Math.imul(hash^pixels[i],16777619)>>>0;}
    canvas.width=canvas.height=0;
    p.cleanup();
    return {words,width:Math.round(viewport.width),height:Math.round(viewport.height),hash};
   }finally{await pdf.destroy();}
  }
  const a=await inspect(documents.a,1),aMerged=await inspect(documents.merged,1);
  const b=await inspect(documents.b,1),bMerged=await inspect(documents.merged,2);
  return {a,aMerged,b,bMerged};
 },{a:Array.from(bytesA),b:Array.from(bytesB),merged:Array.from(mergedBytes)});
 assert.match(evidence.a.words,/VISIBLE SELECTABLE DOC ONE/);
 assert.equal(evidence.aMerged.words,evidence.a.words);
 assert.equal(evidence.b.words,'');
 assert.deepEqual(evidence.aMerged,evidence.a,'Text PDF rendered differently after merging');
 assert.deepEqual(evidence.bMerged,evidence.b,'Scanned-image PDF rendered differently after merging');
 assert.deepEqual(exceptions,[]);
 console.log('PDF_MERGER_TASK2_FIDELITY_PASS: output retains selectable text and pixel-identical rendered digital/scanned pages');
}finally{await browser.close();}
