// Exercise actual AllToolForest PDF Compressor route and built V3 worker.
// These fixtures are synthetic; no user-provided report is committed to CI.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
import {createCanvas} from '@napi-rs/canvas';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const root=resolve(import.meta.dirname,'..');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html',
 '.css':'text/css','.wasm':'application/wasm','.woff':'font/woff2','.woff2':'font/woff2'};
const serve=createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  let rel=decodeURIComponent(url.pathname);
  if(rel.endsWith('/'))rel+='index.html';
  const target=resolve(root,'.'+rel);
  if(!target.startsWith(root+sep)||rel.includes('..'))throw Error('invalid-path');
  const data=readFileSync(target);
  res.writeHead(200,{'content-type':mime[extname(target)]??'application/octet-stream',
    'x-content-type-options':'nosniff'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>serve.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+serve.address().port;
const makeSource=async()=>{
 const doc=await PDF.PDFDocument.create(),page=doc.addPage([612,792]);
 page.drawText('This original sentence is searchable.',{x:30,y:740,size:16});
 const canvas=createCanvas(1400,1000),ctx=canvas.getContext('2d');
 const data=ctx.createImageData(1400,1000);
 let seed=3214123;
 for(let i=0;i<data.data.length;i+=4){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   data.data[i]=seed&255;data.data[i+1]=(seed>>8)&255;
   data.data[i+2]=(seed>>16)&255;data.data[i+3]=255;
 }
 ctx.putImageData(data,0,0);
 page.drawImage(await doc.embedJpg(canvas.toBuffer('image/jpeg',0.98)),
   {x:20,y:100,width:570,height:570});
 return Buffer.from(await doc.save());
};
const makeSigned=async()=>{
 const doc=await PDF.PDFDocument.create();
 doc.addPage([612,792]).drawText('Synthetic signature fixture');
 const signature=doc.context.register(doc.context.obj({
   Type:PDF.PDFName.of('Sig'),ByteRange:[0,20,30,40]
 }));
 doc.catalog.set(PDF.PDFName.of('SyntheticSignature'),signature);
 return Buffer.from(await doc.save({useObjectStreams:true}));
};
const source=await makeSource(),signed=await makeSigned();
const mode=process.env.ATF_BROWSER??'chromium',browserType={chromium,firefox,webkit}[mode];
if(!browserType)throw Error('unknown-browser');
const browser=await browserType.launch();
try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:780}});
 const blocked=[],errors=[];
 const CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'";
 await context.route('**/*',async route=>{
   const req=route.request(),uri=new URL(req.url());
   if(uri.protocol==='blob:'&&uri.origin===origin&&req.method()==='GET')
     return route.continue();
   if(uri.origin!==origin||req.method()!=='GET'){
     blocked.push({url:req.url(),method:req.method()});return route.abort();
   }
   const response=await route.fetch();
   await route.fulfill({response,headers:{...response.headers(),
    'content-security-policy':CSP,'x-content-type-options':'nosniff'}});
 });
 const page=await context.newPage();
 page.on('pageerror',err=>errors.push(err.message));
 await page.goto(origin+'/documents/pdf-compressor/',{waitUntil:'domcontentloaded'});
 await page.locator('#v3-file').waitFor({state:'visible',timeout:30000});
 assert.equal(await page.locator('h1').count(),1);
 assert.equal(await page.locator('h1').textContent(),'PDF Compressor');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#v3-file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:source});
 // Test non-destructive flow first: never flatten without opt-in.
 await page.locator('#v3-mode').selectOption('strong');
 assert.equal(await page.locator('#v3-flatten').isChecked(),false);
 await page.locator('[data-v3-run]').click();
 await page.waitForFunction(()=>/Verified PDF ready|No smaller verified|could not finish/i.test(
  document.querySelector('[data-v3-status]')?.textContent??''),null,{timeout:100000});
 let result=await page.locator('[data-v3-status]').textContent();
 assert.ok(!result.includes('could not finish'),result);
 if(await page.locator('[data-v3-download]').getAttribute('href')){
   assert.match(await page.locator('[data-v3-strategy]').textContent(),/Selective image/);
 }
 // Same file, opt-in destructive maximum, check downloaded PDF actually opens.
 await page.locator('#v3-flatten').check();
 await page.locator('#v3-mode').selectOption('maximum');
 await page.locator('[data-v3-run]').click();
 await page.waitForFunction(()=>/Verified PDF ready|could not finish/i.test(
  document.querySelector('[data-v3-status]')?.textContent??''),null,{timeout:120000});
 result=await page.locator('[data-v3-status]').textContent();
 assert.match(result,/Verified PDF ready/);
 assert.match(await page.locator('[data-v3-warning]').textContent(),/flattened/i);
 const p=page.waitForEvent('download',{timeout:30000});
 await page.locator('[data-v3-download]').click();
 const dl=await p;
 const bytes=readFileSync(await dl.path());
 const loaded=await PDF.PDFDocument.load(bytes,{throwOnInvalidObject:true});
 assert.equal(loaded.getPageCount(),1);
 assert.ok(bytes.length<source.length);
 assert.match(dl.suggestedFilename(),/-compressed\.pdf$/);
 // Lossless must never flatten. It may either produce a verified smaller
 // structure or safely report no reduction; both outcomes preserve features.
 await page.locator('#v3-mode').selectOption('lossless');
 assert.equal(await page.locator('#v3-flatten').isDisabled(),true);
 await page.locator('[data-v3-run]').click();
 await page.waitForFunction(()=>/Verified PDF ready|Lossless did not produce|could not finish/i.test(
  document.querySelector('[data-v3-status]')?.textContent??''),null,{timeout:80000});
 const losslessStatus=await page.locator('[data-v3-status]').textContent();
 assert.ok(!losslessStatus.includes('could not finish'),losslessStatus);
 if(losslessStatus.includes('Verified PDF ready')){
  assert.match(await page.locator('[data-v3-warning]').textContent(),/Document page programs/);
  const losslessP=page.waitForEvent('download',{timeout:30000});
  await page.locator('[data-v3-download]').click();
  const losslessDl=await losslessP;
  assert.equal((await PDF.PDFDocument.load(readFileSync(await losslessDl.path()))).getPageCount(),1);
 }
 await page.locator('#v3-mode').selectOption('maximum');
 // Fail-closed against signature even with destructive consent.
 await page.locator('#v3-file').setInputFiles({
   name:'signed.pdf',mimeType:'application/pdf',buffer:signed
 });
 await page.locator('[data-v3-run]').click();
 await page.waitForFunction(()=>/Digitally signed PDFs|could not finish/i.test(
  document.querySelector('[data-v3-status]')?.textContent??''),null,{timeout:30000});
 assert.match(await page.locator('[data-v3-status]').textContent(),/Digitally signed PDFs/);
 assert.equal(await page.locator('[data-v3-download]').getAttribute('href'),null);
 assert.deepEqual(blocked,[],'no uploaded files or external requests');
 assert.deepEqual(errors,[],'no uncaught page script errors');
 console.log(JSON.stringify({browser:mode,nonflat:true,destructive:true,
  signedRejected:true,downloadedPDFBytes:bytes.length,inputBytes:source.length,
  noExternalRequests:true,cspControlled:true,onePageLevelH1:true}));
 await context.close();
}finally{
 await browser.close();
 await new Promise(resolve=>serve.close(resolve));
}
