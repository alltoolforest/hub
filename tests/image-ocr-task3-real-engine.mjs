// Task 3: run the actual bundled Tesseract.js worker and downloaded English model.
// These are synthetic known-text benchmarks, not a guarantee about arbitrary scans.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:850},acceptDownloads:true});
const errors=[],externalWrites=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',req=>{
 const url=req.url();
 if(!url.startsWith('http://127.0.0.1:8765/')&&!url.startsWith('data:')&&
    !url.startsWith('blob:')&&!['GET','HEAD'].includes(req.method()))externalWrites.push(req.method()+' '+url);
});
const address='http://127.0.0.1:8765/documents/image-to-text/';
const expected=['INVOICE NUMBER 12345','TOTAL USD 78.90'];
function editDistance(a,b){
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let diag=row[0];row[0]=i;
  for(let j=1;j<=b.length;j++){
   const last=row[j];
   row[j]=Math.min(row[j]+1,row[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));
   diag=last;
  }
 }
 return row[b.length];
}
function normalize(text){return text.toUpperCase().replace(/[^A-Z0-9.]+/g,' ').trim().replace(/\s+/g,' ');}
async function upload(rotateImage=false){
 const contents=await page.evaluate(({rotateImage})=>{
  const base=document.createElement('canvas');
  base.width=1600;base.height=480;
  const c=base.getContext('2d');
  c.fillStyle='#FFFFFF';c.fillRect(0,0,1600,480);
  c.fillStyle='#101010';c.font='bold 86px Arial';
  c.fillText('INVOICE NUMBER 12345',65,180);
  c.fillText('TOTAL USD 78.90',65,340);
  if(!rotateImage)return base.toDataURL('image/png').split(',')[1];
  const rotated=document.createElement('canvas');rotated.width=480;rotated.height=1600;
  const ctx=rotated.getContext('2d');ctx.translate(rotated.width,0);ctx.rotate(Math.PI/2);
  ctx.drawImage(base,0,0);
  return rotated.toDataURL('image/png').split(',')[1];
 },{rotateImage});
 await page.locator('#file-input').setInputFiles({name:rotateImage?'rotated.png':'clean.png',mimeType:'image/png',buffer:Buffer.from(contents,'base64')});
 await page.waitForFunction(rotateImage?()=>document.querySelector('.selected-ocr-source')?.textContent.includes('rotated.png'):()=>document.querySelector('.selected-ocr-source')?.textContent.includes('clean.png'));
}
async function recognize(){
 await page.getByRole('button',{name:'Recognize text'}).click();
 await page.waitForFunction(()=>{
  const msg=document.querySelector('#status')?.textContent||'';
  return msg.startsWith('Text recognized.')||msg.includes('could not load')||msg.includes('timed out')||msg.includes('failed');
 },{timeout:120000}).catch(()=>{});
 // Explicit timeout because language downloads and model initialization can be slow.
 const msg=await page.locator('#status').textContent();
 assert.match(msg||'',/Text recognized/, 'Actual OCR did not finish. Status: '+msg);
 const output=await page.locator('#ocr-text').inputValue();
 const normalized=normalize(output);
 const reference=normalize(expected.join(' '));
 const distance=editDistance(reference,normalized);
 const cer=distance/reference.length;
 console.log('REAL_OCR_TRANSCRIPT='+JSON.stringify(output));
 console.log('REAL_OCR_CER='+cer.toFixed(3));
 assert.ok(cer<=0.15,'Clear printed-text character error rate '+cer.toFixed(3)+' exceeds 15%: '+output);
 return {output,cer};
}
try{
 page.setDefaultTimeout(120000);
 await page.goto(address,{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 await upload(false);
 const first=await recognize();
 assert.ok(first.output.includes('12345'));
 await upload(true);
 await page.locator('#ocr-rotate').selectOption('270'); // undo clockwise scan
 const second=await recognize();
 assert.ok(second.output.includes('78'));
 assert.deepEqual(externalWrites,[],'Selected document content must not be POSTed externally');
 assert.deepEqual(errors,[],'Unexpected runtime exceptions');
 console.log('IMAGE_OCR_TASK3_REAL_ENGINE_PASS: clean and sideways printed English, real Tesseract worker, CER <= 15%, no document upload');
}finally{await browser.close();}
