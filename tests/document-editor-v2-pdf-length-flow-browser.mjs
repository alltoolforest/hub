// Optional supplied PDF stays local; otherwise run with a caller-provided fixture.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';
let source=await fs.readFile(process.argv[2]);if(process.env.APPEND_FOLLOWING_PAGE){const {PDFDocument}=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js'),doc=await PDFDocument.load(source);doc.addPage([595.44,841.68]).drawText('Following page sentinel is retained.',{x:50,y:730,size:12});source=Buffer.from(await doc.save({useObjectStreams:false}));}const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const options={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};if(process.env.HTTPS_PROXY){options.proxy={server:new URL(process.env.HTTPS_PROXY).origin,bypass:'127.0.0.1,localhost'};options.args.push('--ignore-certificate-errors');}
const browser=await chromium.launch(options),compact=s=>String(s).replace(/\s+/g,'');
const longLines=Array.from({length:100},(_,i)=>`Flow record ${String(i+1).padStart(3,'0')} contains retained user supplied information.`);
async function exportFile(page){await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);const d=page.waitForEvent('download',{timeout:90000});await page.locator('[data-action=export]').click();return fs.readFile(await (await d).path());}
async function textRows(page,bytes){return page.evaluate(async data=>{const {loadPdfjs}=await import(new URL('../../documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/pdfjs.js',location.href).href),j=await loadPdfjs(),pdf=await j.getDocument({data:new Uint8Array(data)}).promise;try{const rows=[];for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n);for(const item of (await pg.getTextContent()).items)if(item.str)rows.push({page:n,text:item.str,y:item.transform[5],x:item.transform[4]});}return {pages:pdf.numPages,rows};}finally{await pdf.destroy?.();}},Array.from(bytes));}
try{for(const kind of ['short final line','repeated expanded edit','paragraph across pages','adjacent expanded paragraphs']){
 if(process.env.CASE_FILTER&&!new RegExp(process.env.CASE_FILTER).test(kind))continue;
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try{
 await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/');await page.locator('#document-v2-file').setInputFiles({name:'manual-document.pdf',mimeType:'application/pdf',buffer:source});await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.getByRole('button',{name:'Next',exact:true}).click();
 const original=await textRows(page,source),target=kind==='short final line'?/Edit text: and Belief/:/Edit text: I hereby declare/;
 await page.getByRole('button',{name:target}).first().click();let input=page.getByRole('textbox',{name:'Edit PDF text',exact:true}),old=await input.inputValue();
 let payload=kind==='paragraph across pages'?old+'\n'+longLines.join('\n'):old+' Additional retained statement '.repeat(15);
 await input.fill(payload);await page.locator('.pdf-done').click();await input.waitFor({state:'hidden'});
 if(kind==='repeated expanded edit'){
  await page.getByRole('button',{name:/Edit added text:/}).first().click();input=page.getByRole('textbox',{name:'Edit added PDF text',exact:true});payload=old+'\nRepeated update sentinel.\n'+longLines.slice(0,45).join('\n');await input.fill(payload);await page.locator('.pdf-insert-done').click();await input.waitFor({state:'hidden'});
 }
 if(kind==='adjacent expanded paragraphs'){
  await page.getByRole('button',{name:/Edit text: and Belief/}).first().click();input=page.getByRole('textbox',{name:'Edit PDF text',exact:true});await input.fill('Neighbour paragraph sentinel. '+ 'More retained neighbour text. '.repeat(18));await page.locator('.pdf-done').click();await input.waitFor({state:'hidden'});
 }
 const output=await exportFile(page),actual=await textRows(page,output),text=compact(actual.rows.map(r=>r.text).join(' '));
 if(kind==='paragraph across pages'||kind==='repeated expanded edit'){
  const expected=kind==='paragraph across pages'?longLines:longLines.slice(0,45);
  for(const line of expected)assert.equal(text.split(compact(line)).length-1,1,'every added line appears exactly once');
  assert.ok(actual.pages>original.pages,'long text must continue on new pages');
  const last=actual.rows.find(r=>r.text.includes(expected.at(-1))),thanks=actual.rows.find(r=>r.text.includes('Thanking You'));assert.ok(last&&thanks);assert.ok(thanks.page>last.page||thanks.page===last.page&&thanks.y<last.y-8,'following content must occur after the entire paragraph');
  const viewer=page.locator('.pdf-overflow-preview');assert.equal(await viewer.isVisible(),true);await viewer.locator('summary').click();await viewer.getByLabel('Expanded PDF output page').selectOption(String(actual.pages-1));await page.waitForFunction(()=>document.querySelector('[aria-label="Expanded PDF page preview"]').width>0);
 }else assert.ok(text.includes(compact(payload)),'expanded text must be fully retained');
 if(kind==='adjacent expanded paragraphs')assert.equal(text.split(compact('Neighbour paragraph sentinel.')).length-1,1);
 assert.equal(text.split(compact(old)).length-1,1,'source text must not be duplicated underneath reconstruction');
 if(process.env.APPEND_FOLLOWING_PAGE)assert.equal(text.split(compact('Following page sentinel is retained.')).length-1,1);
 for(const word of ['Thanking You','Date:','Place:'])assert.ok(text.includes(compact(word)),'following original content survives');
 assert.deepEqual(actual.rows.filter(r=>r.page===1),original.rows.filter(r=>r.page===1),'earlier page stays unchanged');
 if(process.env.PDF_QA_DIR){await fs.mkdir(process.env.PDF_QA_DIR,{recursive:true});await fs.writeFile(process.env.PDF_QA_DIR+'/'+kind.replaceAll(' ','-')+'.pdf',output);await page.screenshot({path:process.env.PDF_QA_DIR+'/'+kind.replaceAll(' ','-')+'.png',fullPage:true});}
 await page.locator('[data-action=undo]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.locator('[data-action=redo]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.waitForTimeout(800);await page.reload();await page.locator('#document-v2-restore').click();await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Recovered'));const recovered=await textRows(page,await exportFile(page));assert.deepEqual(recovered,actual);assert.deepEqual(errors,[]);
 console.log('PASS '+kind+': wrapping, text retained once, lower content, export, undo/redo and recovery');
 }catch(e){console.error('FAIL',kind,await page.locator('.pdf-fortress-status').allTextContents(),await page.locator('#document-v2-status').textContent());throw e;}finally{await page.close();}
}}finally{await browser.close();}
