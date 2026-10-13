import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {buildFixture} from './pdf-compressor-task1-fixtures.mjs';
const path=process.env.PDF_COMPRESSOR_MOBILE_QA_OUTPUT;
if(!path)throw Error('Provide the validated standalone diagnostic path');
const browser=await chromium.launch();
try{
  const page=await browser.newPage(),remote=[];
  await page.route('**/*',route=>{
    if(/^(file:|blob:)/.test(route.request().url()))return route.continue();
    remote.push(route.request().url());return route.abort();
  });
  await page.goto(pathToFileURL(path).href);
  const payload='<img src=x onerror="globalThis.injected=true">.pdf';
  await page.locator('#file').setInputFiles({name:payload,mimeType:'application/pdf',buffer:Buffer.from((await buildFixture('digital')).bytes)});
  await page.waitForFunction(()=>/^Ready:/.test(document.querySelector('#status').textContent),{},{timeout:120000});
  assert.ok((await page.locator('#status').textContent()).includes(payload));
  assert.equal(await page.locator('img').count(),0);
  assert.equal(await page.evaluate(()=>globalThis.injected===true),false);
  assert.deepEqual(remote,[]);
  console.log('Filename markup remains literal text; no execution or remote requests.');
}finally{await browser.close();}
