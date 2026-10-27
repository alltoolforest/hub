import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),require=createRequire(import.meta.url);globalThis.PDFLib=require('../assets/vendor/pdf-lib.js');
const {verifyFormPreservation}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/core/form-protection.js');
const {extractPageText}=await import('../documents/document-editor-v2-lab/pdf-engine/fortress/src/export/extraction-validator.js');
const source=await fs.readFile(process.argv[2]),launch={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};
if(process.env.HTTPS_PROXY){const p=new URL(process.env.HTTPS_PROXY);launch.proxy={server:p.origin,...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})};launch.args.push('--ignore-certificate-errors');}
const browser=await chromium.launch(launch);
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8765/documents/document-editor/');
 await page.locator('#document-v2-file').setInputFiles({name:'complex-with-form.pdf',mimeType:'application/pdf',buffer:source});
 const target=page.getByRole('button',{name:'Edit text: Complex PDF edit sentinel.',exact:true});await target.waitFor();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);
 await target.click();await page.getByRole('textbox',{name:'Edit PDF text',exact:true}).fill('Complex PDF edited sentinel.');
 // Unapplied text must never be silently exported.
 await page.locator('[data-action=export]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);assert.match(await page.locator('#document-v2-status').innerText(),/Press Done/);
 assert.equal(await page.getByRole('textbox',{name:'Edit PDF text',exact:true}).inputValue(),'Complex PDF edited sentinel.');
 const pending=page.waitForEvent('download',{timeout:45000});
 await page.evaluate(()=>{document.querySelector('.pdf-done').click();document.querySelector('[data-action=export]').click();});
 const download=await pending,output=new Uint8Array(await fs.readFile(await download.path()));
 await verifyFormPreservation(new Uint8Array(source),output);assert.match(await extractPageText(output,0),/Complex PDF edited sentinel/);
 await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);assert.match(await page.locator('#document-v2-status').innerText(),/Export prepared/);await page.waitForTimeout(900);assert.match(await page.locator('#document-v2-status').innerText(),/Export prepared/);assert.deepEqual(errors,[]);
 console.log('PASS complex form PDF: protected unfinished edit, immediate export, preservation and stable status at '+width+'px');await page.close();
}}finally{await browser.close();}
