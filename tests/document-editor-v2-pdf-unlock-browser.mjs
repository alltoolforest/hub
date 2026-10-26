import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{PDFDocument,StandardFonts}=require('../assets/vendor/pdf-lib.js');
const create=require('../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.js');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage([612,792]).drawText('Protected original text',{x:60,y:700,size:12,font});doc.addPage([612,792]);
const q=await create({wasmBinary:await fs.readFile(new URL('../documents/document-editor-v2-lab/pdf-engine/vendor/qpdf-0.3.0/qpdf.wasm',import.meta.url))});q.FS.writeFile('/input.pdf',await doc.save());assert.equal(q.callMain(['--encrypt','known-password','owner-password','256','--','/input.pdf','/out.pdf']),0);const input=Buffer.from(q.FS.readFile('/out.pdf'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(process.env.PDF_LAB_URL||'http://127.0.0.1:8765/documents/document-editor-v2-lab/');
 await page.locator('#document-v2-file').setInputFiles({name:'protected.pdf',mimeType:'application/pdf',buffer:input});
 await page.getByLabel('PDF password',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByRole('status').filter({hasText:'password is incorrect'}).waitFor();
 await page.getByLabel('PDF password',{exact:true}).fill('known-password');await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByRole('button',{name:'Edit text: Protected original text',exact:true}).click({timeout:30000});
 await page.getByRole('textbox',{name:'Edit PDF text',exact:true}).fill('Protected edited text');await page.locator('.pdf-done').click();
 await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Draft saved'),null,{timeout:30000});
 await page.reload();await page.locator('#document-v2-restore').click();await page.getByRole('button',{name:'Edit text: Protected edited text',exact:true}).waitFor({timeout:30000});assert.equal(await page.getByLabel('PDF password',{exact:true}).count(),0);
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=export]').click();const output=await fs.readFile(await(await downloadPromise).path()),opened=await PDFDocument.load(output);assert.equal(opened.isEncrypted,false);assert.equal(opened.getPageCount(),2);
 await page.locator('#document-v2-file').setInputFiles({name:'cancel-protected.pdf',mimeType:'application/pdf',buffer:input});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Edit text: Protected edited text',exact:true}).waitFor();
 await page.getByRole('status').filter({hasText:'Opening password-protected PDF cancelled.'}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS real Chromium: AES-256 unlock, wrong-password retry, native text edit, actual IndexedDB reload recovery without password, unencrypted two-page export and cancellation retaining the current session');
 await context.close();
}finally{await browser.close();}
