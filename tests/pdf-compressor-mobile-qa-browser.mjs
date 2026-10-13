import assert from 'node:assert/strict';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {buildFixture} from './pdf-compressor-task1-fixtures.mjs';
const path=process.env.PDF_COMPRESSOR_MOBILE_QA_OUTPUT;
if(!path)throw Error('Build the standalone diagnostic and provide its output path');
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),remote=[];
  await page.route('**/*',r=>{
    if(/^(file:|blob:)/.test(r.request().url()))return r.continue();
    remote.push(r.request().url());return r.abort();
  });
  await page.goto(pathToFileURL(path).href);
  const {bytes}=await buildFixture('mixed');
  await page.locator('#file').setInputFiles({name:'qa.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  const reports=[];
  for(const mode of ['balanced','strong','lossless']){
    await page.locator('#mode').selectOption(mode);await page.locator('#run').click();
    await page.waitForFunction(()=>/^(Completed:|Test failed)/.test(document.querySelector('#status').textContent),{},{timeout:120000});
    assert.match(await page.locator('#status').textContent(),/^Completed:/);
    const report=JSON.parse(await page.locator('#report').textContent());
    assert.equal(report.mode,mode);assert.equal(report.inputBytes,bytes.length);
    assert.ok(report.outputBytes<=bytes.length);reports.push(report);
  }
  await page.locator('#run').click();await page.waitForFunction(()=>typeof running?.onmessage==='function');
  await page.evaluate(()=>{window.staleResultCallback=running.onmessage;});await page.locator('#cancel').click();
  await page.evaluate(()=>window.staleResultCallback({data:{ok:true,result:{bytes:new Uint8Array([1,2,3])},elapsedMs:1}}));
  await page.waitForTimeout(500);assert.equal(await page.locator('#download').isVisible(),false);
  assert.match(await page.locator('#status').textContent(),/^Cancelled/);
  await page.evaluate(()=>{window.workerStartedForOversize=false;window.NativeWorker=Worker;window.Worker=function(...args){window.workerStartedForOversize=true;return new window.NativeWorker(...args);};});
  await page.locator('#file').setInputFiles({name:'oversize.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(20*1024*1024+1)});
  assert.equal(await page.locator('#run').isDisabled(),true);
  assert.match(await page.locator('#status').textContent(),/^File too large:/);
  await page.evaluate(()=>document.querySelector('#run').onclick());
  assert.equal(await page.evaluate(()=>window.workerStartedForOversize),false);
  assert.equal(await page.locator('#download').isVisible(),false);
  assert.deepEqual(remote,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log(JSON.stringify({scope:'Local Chromium file-mode diagnostic; not physical-phone evidence',reports,cancel:true,noRemoteRequests:true,narrowLayout:true},null,2));
}finally{await browser.close();}
