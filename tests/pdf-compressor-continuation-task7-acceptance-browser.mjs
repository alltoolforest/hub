// Seven-task PDF Compressor continuation / Task 7 final release-candidate
// AUTOMATED device-profile smoke, not a real handset or production audit.
// Only a synthetic PDF is used. All work is browser-local; no remote upload.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';

const htmlPath=process.env.PDF_COMPRESSOR_MOBILE_QA_OUTPUT;
const profileName=process.env.PDF_COMPRESSOR_TASK7_PROFILE;
const profiles={
 'android-chromium':{engine:chromium,viewport:{width:360,height:800},isMobile:true,
  hasTouch:true,deviceScaleFactor:3,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'},
 'ios-webkit':{engine:webkit,viewport:{width:390,height:844},isMobile:true,
  hasTouch:true,deviceScaleFactor:3,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'},
 'windows-chromium':{engine:chromium,viewport:{width:1366,height:768},deviceScaleFactor:1},
 'windows-firefox':{engine:firefox,viewport:{width:1366,height:768},deviceScaleFactor:1},
 'macos-webkit':{engine:webkit,viewport:{width:1440,height:900},deviceScaleFactor:2}
};
if(!profiles[profileName])throw Error('Task 7 profile must be selected from the pinned test matrix');
if(!htmlPath)throw Error('The isolated release-candidate HTML build is required');
const html=readFileSync(htmlPath,'utf8');
const {engine,...options}=profiles[profileName];
const browser=await engine.launch({headless:true,timeout:30000});
const remote=[],consoleErrors=[],rows=[];
try{
 const context=await browser.newContext({...options,acceptDownloads:true});
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url();
  if(url.startsWith('blob:http://127.0.0.1:8766/')&&request.method()==='GET')
   return route.continue();
  if(url==='http://127.0.0.1:8766/task7-isolated-candidate'&&request.method()==='GET')
   return route.fulfill({status:200,contentType:'text/html; charset=utf-8',
      headers:{'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'},body:html});
  remote.push({url,method:request.method()});
  return route.abort();
 });
 const page=await context.newPage();
 page.on('pageerror',error=>consoleErrors.push(String(error.message).slice(0,400)));
 await page.goto('http://127.0.0.1:8766/task7-isolated-candidate',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Boolean(globalThis.RC_UI?.session),null,{timeout:30000});
 assert.equal(await page.locator('#compressor-file').count(),1);
 assert.equal(await page.locator('#compressor-mode').count(),1);
 assert.match(await page.locator('[data-limit]').textContent(),/MB/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
   true,'no layout overflow for '+profileName);
 const source=(await buildFixture('mixed')).bytes;
 const originalHash=createHash('sha256').update(source).digest('hex');
 const originalPDF=await PDF.PDFDocument.load(source,{updateMetadata:false});
 await page.locator('#compressor-file').setInputFiles({name:'acceptance.pdf',
  mimeType:'application/pdf',buffer:Buffer.from(source)});
 await page.waitForFunction(()=>RC_UI.session.snapshot().state==='ready',null,{timeout:60000});
 for(const mode of ['lossless','balanced','strong','maximum']){
  await page.locator('#compressor-mode').selectOption(mode);
  await page.locator('[data-run]').click();
  await page.waitForFunction(()=>['completed','failed'].includes(RC_UI.session.snapshot().state),
    null,{timeout:120000});
  const state=await page.evaluate(()=>RC_UI.session.snapshot());
  assert.equal(state.state,'completed',profileName+' '+mode+': '+JSON.stringify(state.error));
  assert.equal(state.result.mode,mode);
  assert.equal(state.result.inputBytes,source.length);
  assert.ok(state.result.outputBytes<=source.length);
  assert.equal(state.result.savedBytes,source.length-state.result.outputBytes);
  assert.equal(state.result.integrity.independentTextVerified,true);
  assert.equal(state.result.integrity.sourceDigest,originalHash);
  assert.equal(state.result.integrity.savedBytes,state.result.savedBytes);
  assert.equal(await page.locator('[data-download]').isVisible(),true);
  const downloadPromise=page.waitForEvent('download',{timeout:30000});
  await page.locator('[data-download]').click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/\.pdf$/i);
  const disk=readFileSync(await download.path());
  assert.equal(disk.length,state.result.outputBytes);
  assert.equal(createHash('sha256').update(disk).digest('hex'),
    state.result.integrity.outputDigest,'receipt must describe exact downloaded bytes');
  if(state.result.status==='original-retained')assert.deepEqual(disk,Buffer.from(source));
  const reopened=await PDF.PDFDocument.load(disk,{updateMetadata:false,throwOnInvalidObject:true});
  assert.equal(reopened.getPageCount(),originalPDF.getPageCount());
  assert.equal(await page.evaluate(()=>RC_RESOURCES.started===RC_RESOURCES.terminated),
    true,'workers cannot leak into subsequent modes');
  rows.push({profile:profileName,mode,status:state.result.status,
   inputBytes:source.length,outputBytes:disk.length,downloadSHA256Verified:true,
   independentTextVerified:true,pagesReopened:reopened.getPageCount(),
   deviceClass:'simulated-browser-context'});
 }
 // A fresh source invalidates previous output; the active source is never
 // silently replaced with a corrupt/signed document. No download is exposed.
 const marked=(await buildFixture('signed-marker')).bytes;
 await page.locator('[data-clear]').click();
 assert.equal(await page.locator('[data-download]').isVisible(),false);
 await page.locator('#compressor-file').setInputFiles({name:'signed.pdf',
  mimeType:'application/pdf',buffer:Buffer.from(marked)});
 await page.waitForFunction(()=>RC_UI.session.snapshot().state==='ready',null,{timeout:60000});
 await page.locator('#compressor-mode').selectOption('lossless');
 await page.locator('[data-run]').click();
 await page.waitForFunction(()=>RC_UI.session.snapshot().state==='failed',null,{timeout:60000});
 assert.equal(await page.evaluate(()=>RC_UI.session.snapshot().error.code),'signed-pdf');
 assert.equal(await page.locator('[data-download]').isVisible(),false);
 assert.equal(await page.evaluate(()=>RC_RESOURCES.started===RC_RESOURCES.terminated),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(remote,[],'candidate must not initiate external requests');
 assert.deepEqual(consoleErrors,[],'candidate must not crash browser runtime');
 const report={task:7,profile:profileName,browser:browser.browserType().name(),
  modeCases:rows.length,downloadsVerified:true,sourceUnchanged:originalHash,
  signedRejectedWithoutDownload:true,workersTerminated:true,
  noRemoteRequests:true,narrowLayout:true,realPhysicalDevice:false,rows};
 console.log(JSON.stringify(report));
 if(process.env.PDF_COMPRESSOR_TASK7_EVIDENCE)writeFileSync(process.env.PDF_COMPRESSOR_TASK7_EVIDENCE,JSON.stringify(report,null,2));
 await context.close();
}finally{await browser.close();}
