import assert from 'node:assert/strict';import{createRequire}from'node:module';
const{PDFDocument}=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js'),doc=await PDFDocument.create();doc.addPage([612,792]).drawText('Module load verification',{x:60,y:700,size:12});const source=Buffer.from(await doc.save());
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),options={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};if(process.env.HTTPS_PROXY){options.proxy={server:new URL(process.env.HTTPS_PROXY).origin,bypass:'127.0.0.1,localhost'};options.args.push('--ignore-certificate-errors');}const browser=await chromium.launch(options),url=process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/';
const file={name:'loader.pdf',mimeType:'application/pdf',buffer:source};
try{for(const[name,part]of[['adapter','/engines/pdf.js'],['hybrid','/ocr/hybrid-editor.js']]){const page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1280,height:900}});page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());let failed=0;const requests=[];await page.route('**/*',async route=>{const u=route.request().url();if(u.includes(part)){requests.push(u);if(!failed++){await route.abort('failed');return;}}await route.continue();});try{await page.goto(url);await page.locator('#document-v2-file').setInputFiles(file);await page.getByRole('button',{name:'Edit text: Module load verification',exact:true}).waitFor();assert.ok(requests.length>=2,`${name} must be retried`);assert.match(await page.locator('#document-v2-status').textContent(),/File opened/);console.log(`PASS transient ${name}: injected request failure recovered`);}catch(error){console.error('Loader status:',await page.locator('#document-v2-status').textContent());throw error;}finally{await page.close();}}
 for (const blockedPart of ['/ocr/hybrid-editor.js', '/fortress/src/main.js', '/ocr/classifier.js']) {
 const page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1280,height:900}});page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());let blocked=true,attempts=0;await page.route('**'+blockedPart+'*',async route=>{attempts++;if(blocked)await route.abort('failed');else await route.continue();});try{await page.goto(url);await page.locator('#document-v2-file').setInputFiles({name:'retained.txt',mimeType:'text/plain',buffer:Buffer.from('Retained workspace text')});await page.locator('textarea.document-v2-text').waitFor();await page.locator('#document-v2-file').setInputFiles(file);await page.locator('#document-v2-status').filter({hasText:'PDF editor could not finish loading'}).waitFor();assert.ok(attempts>=1&&attempts<=3);assert.equal(await page.locator('textarea.document-v2-text').inputValue(),'Retained workspace text');assert.equal(await page.locator('#document-v2-file').isDisabled(),false);blocked=false;await page.getByRole('button',{name:'Save draft and reload editor',exact:true}).click();await page.locator('#document-v2-restore').click();assert.equal(await page.locator('textarea.document-v2-text').inputValue(),'Retained workspace text');await page.locator('#document-v2-file').setInputFiles(file);await page.getByRole('button',{name:'Edit text: Module load verification',exact:true}).waitFor();console.log('PASS '+blockedPart+': bounded failure, retained TXT session, draft-safe reload, restore and PDF reopen');}finally{await page.close();}
}
const page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1280,height:900}});page.setDefaultTimeout(20000);page.on('dialog',d=>d.accept());
try {
 await page.goto(url);
 await page.locator('#document-v2-file').setInputFiles({name:'retained.txt',mimeType:'text/plain',buffer:Buffer.from('Keep when storage fails')});
 await page.locator('textarea.document-v2-text').waitFor();
 await page.route('**/ocr/hybrid-editor.js*',route=>route.abort('failed'));
 await page.locator('#document-v2-file').setInputFiles(file);
 await page.getByRole('button',{name:'Save draft and reload editor',exact:true}).waitFor();
 await page.evaluate(()=>{indexedDB.open=()=>{throw new Error('Storage denied for regression');};});
 await page.getByRole('button',{name:'Save draft and reload editor',exact:true}).click();
 await page.locator('#document-v2-status').filter({hasText:'Local draft storage is unavailable'}).waitFor();
 assert.equal(await page.locator('textarea.document-v2-text').inputValue(),'Keep when storage fails');
 assert.equal(await page.getByRole('button',{name:'Save draft and reload editor',exact:true}).isVisible(),true);
 console.log('PASS storage failure: reload refused and current document retained');
} finally {await page.close();}
}finally{await browser.close();}
