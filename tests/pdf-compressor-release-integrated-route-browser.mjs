// Stage-only integration: exercise the real AllToolForest tool URL and its
// isolated static worker bundle. This is not a deployed-domain security test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';

const browserName=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const engine={chromium,firefox,webkit}[browserName];
if(!engine)throw Error('Unknown browser in release integration matrix');
const browser=await engine.launch();
const blocked=[],runtimeErrors=[],records=[];
const origin='http://127.0.0.1:8766';
try {
 const context=await browser.newContext({viewport:{width:360,height:780},acceptDownloads:true});
 const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'";
 await context.route('**/*',async route=>{
   const req=route.request(),uri=new URL(req.url());
   if(uri.protocol==='blob:'&&uri.origin===origin&&req.method()==='GET')return route.continue();
   if(uri.origin!==origin||req.method()!=='GET'){blocked.push({url:req.url(),method:req.method()});return route.abort();}
   const response=await route.fetch();
   return route.fulfill({response,headers:{...response.headers(),
      'content-security-policy':csp,'x-content-type-options':'nosniff'}});
 });
 const page=await context.newPage();
 page.on('pageerror',err=>runtimeErrors.push(err.message));
 await page.goto(origin+'/documents/pdf-compressor/',{waitUntil:'domcontentloaded'});
 await page.locator('#compressor-file').waitFor({state:'visible',timeout:60000});
 assert.equal(await page.locator('h1').count(),1,'one integrated page-level H1');
 assert.equal(await page.locator('h1').textContent(),'PDF Compressor');
 assert.equal(await page.locator('h2').first().textContent(),'PDF Compressor');
 assert.equal(await page.title(),'PDF Compressor — Reduce PDF Size Privately | AllToolForest');
 assert.equal(await page.locator('nav[aria-label="Main navigation"] a').count()>0,true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const source=(await buildFixture('mixed')).bytes;
 const sha=createHash('sha256').update(source).digest('hex');
 const original=await PDF.PDFDocument.load(source);
 await page.locator('#compressor-file').setInputFiles({name:'integrated.pdf',mimeType:'application/pdf',buffer:Buffer.from(source)});
 await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent?.includes('PDF selected.'),null,{timeout:60000});
 for(const mode of ['lossless','balanced','strong','maximum']){
  await page.locator('#compressor-mode').selectOption(mode);
  await page.locator('[data-run]').click();
  await page.waitForFunction(()=>{
    const status=document.querySelector('[data-status]')?.textContent??'';
    return /verified PDF is ready|could not|exceed|incorrect|stopped/i.test(status);
  },null,{timeout:120000});
  assert.match(await page.locator('[data-status]').textContent(),/verified PDF is ready/);
  const downloadPromise=page.waitForEvent('download',{timeout:30000});
  await page.locator('[data-download]').click();
  const dl=await downloadPromise;
  const bytes=readFileSync(await dl.path());
  const pdf=await PDF.PDFDocument.load(bytes,{updateMetadata:false,throwOnInvalidObject:true});
  assert.equal(pdf.getPageCount(),original.getPageCount());
  assert.ok(bytes.length<=source.length);
  assert.match(dl.suggestedFilename(),/\.pdf$/i);
  records.push({browser:browserName,mode,inputBytes:source.length,outputBytes:bytes.length,
    pages:pdf.getPageCount(),downloaded:true,sourceDigest:sha});
 }
 await page.locator('[data-clear]').click();
 assert.equal(await page.locator('[data-download]').isVisible(),false);
 const restricted=(await buildFixture('signed-marker')).bytes;
 await page.locator('#compressor-file').setInputFiles({name:'signed.pdf',mimeType:'application/pdf',buffer:Buffer.from(restricted)});
 await page.waitForFunction(()=>document.querySelector('[data-status]')?.textContent?.includes('PDF selected.'),null,{timeout:60000});
 await page.locator('[data-run]').click();
 await page.waitForFunction(()=>/signature markers|signatures/i.test(document.querySelector('[data-status]')?.textContent??''),null,{timeout:60000});
 assert.equal(await page.locator('[data-download]').isVisible(),false);
 assert.deepEqual(blocked,[],'source must not be uploaded or fetched outside host');
 assert.deepEqual(runtimeErrors,[],'integrated worker and module must load without page errors');
 console.log(JSON.stringify({browser:browserName,modeCases:records.length,cspEnforcedInTest:true,
   signedRejected:true,noRemoteRequests:true,oneH1:true,siteRoute:true,
   productionDeployment:false,records}));
 await context.close();
}finally{await browser.close();}
