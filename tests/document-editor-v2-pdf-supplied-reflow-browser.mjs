// Optional private fixture: pass a local PDF path. Source bytes are never committed.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const source=await fs.readFile(process.argv[2]),{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const launch={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};if(process.env.HTTPS_PROXY){launch.proxy={server:new URL(process.env.HTTPS_PROXY).origin,bypass:'127.0.0.1,localhost'};launch.args.push('--ignore-certificate-errors');}
const browser=await chromium.launch(launch),compact=s=>String(s).replace(/\s+/g,'');
async function lines(page,bytes){return page.evaluate(async data=>{const {loadPdfjs}=await import(new URL('../../documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/pdfjs.js',location.href).href),lib=await loadPdfjs(),pdf=await lib.getDocument({data:new Uint8Array(data)}).promise;try{const out=[];for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),groups=[];for(const i of (await pg.getTextContent()).items){if(!i.str)continue;let row=groups.find(g=>Math.abs(g.y-i.transform[5])<.2);if(!row){row={page:n,y:i.transform[5],items:[]};groups.push(row);}row.items.push({x:i.transform[4],text:i.str});}out.push(...groups.map(g=>({page:g.page,y:g.y,text:g.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join('')})));}return out;}finally{await pdf.destroy?.();}},Array.from(bytes));}
async function download(page){await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);const d=page.waitForEvent('download',{timeout:60000});await page.locator('[data-action=export]').click();return fs.readFile(await (await d).path());}
try{for(const kind of ['one blank line','two added lines']){
 const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
 await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/');await page.locator('#document-v2-file').setInputFiles({name:'supplied-document.pdf',mimeType:'application/pdf',buffer:source});await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.getByRole('button',{name:'Next',exact:true}).click();
 const before=await lines(page,source),hit=page.getByRole('button',{name:/Edit text: I hereby declare/}).first();await hit.click();const input=page.getByRole('textbox',{name:'Edit PDF text',exact:true}),original=await input.inputValue();
 const body=before.find(r=>compact(r.text).includes(compact(original)));assert.ok(body);
 const added='Additional verification sentence for manual review.\nA second additional statement is retained.';
 if(kind==='one blank line'){await input.press('Control+Home');await input.press('Enter');}else await input.fill(original+'\n'+added);
 await page.locator('.pdf-done').click();await input.waitFor({state:'hidden',timeout:30000});
 const exported=await download(page),after=await lines(page,exported),all=compact(after.map(r=>r.text).join(''));
 assert.ok(all.includes(compact(original)),'declaration must survive');if(kind==='two added lines')for(const part of added.split('\n'))assert.ok(all.includes(compact(part)));
 const following=before.filter(r=>r.page===body.page&&r.y<body.y-1);let shifted=0;
 for(const row of following){const match=after.find(r=>r.page===row.page&&compact(r.text)===compact(row.text));assert.ok(match,'all following source lines must survive');assert.ok(match.y<=row.y+.5);if(match.y<row.y-1)shifted++;}
 assert.ok(shifted>=3,'following declaration, thanks and signature lines must flow downward');
 const sameAbove=before.filter(r=>r.page<body.page||r.page===body.page&&r.y>body.y+1);for(const row of sameAbove)assert.ok(after.some(r=>r.page===row.page&&Math.abs(r.y-row.y)<.5&&compact(r.text)===compact(row.text)),'earlier content must stay in place');
 if(kind==='one blank line'){const moved=after.find(r=>compact(r.text).includes(compact(original)));assert.ok(moved&&Math.abs((body.y-moved.y)-14.4)<1);}
 if(process.env.PDF_QA_DIR){await fs.mkdir(process.env.PDF_QA_DIR,{recursive:true});await fs.writeFile(process.env.PDF_QA_DIR+'/'+kind.replaceAll(' ','-')+'.pdf',exported);await page.screenshot({path:process.env.PDF_QA_DIR+'/'+kind.replaceAll(' ','-')+'.png',fullPage:true});}
 await page.locator('[data-action=undo]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);if(!await hit.count())await page.getByRole('button',{name:'Next',exact:true}).click();await hit.waitFor({timeout:30000});assert.deepEqual(await lines(page,await download(page)),before,'single undo restores original text and positions');
 await page.locator('[data-action=redo]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.waitForTimeout(800);await page.reload();await page.locator('#document-v2-restore').click();await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Recovered'),null,{timeout:60000});const recovered=await lines(page,await download(page));assert.deepEqual(recovered,after,'redo and refresh recovery must preserve all text and positions');assert.deepEqual(errors,[]);
 console.log('PASS supplied PDF '+kind+': complete text, lower-content movement, static earlier content, export, undo/redo and recovery');
 }catch(error){console.error('FAIL',kind,await page.locator('.pdf-fortress-status').allTextContents());throw error;}finally{await page.close();}
}}finally{await browser.close();}
