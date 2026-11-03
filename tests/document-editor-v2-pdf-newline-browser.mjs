import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PDFDocument,StandardFonts,rgb,pushGraphicsState,popGraphicsState,rectangle,clipEvenOdd,endPath}=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const launch={headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']};
if(process.env.HTTPS_PROXY){launch.proxy={server:new URL(process.env.HTTPS_PROXY).origin,bypass:'127.0.0.1,localhost'};launch.args.push('--ignore-certificate-errors');}
const browser=await chromium.launch(launch);
const declaration='I hereby declare that the above information is true and correct.';
const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.TimesRoman),bold=await source.embedFont(StandardFonts.TimesRomanBold);
const sheet=source.addPage([612,792]);sheet.pushOperators(pushGraphicsState(),rectangle(0,0,612,792),clipEvenOdd(),endPath());sheet.drawRectangle({x:50,y:365,width:510,height:20,color:rgb(.7,.7,.7)});sheet.drawText('DECLARATION:',{x:55,y:370,size:12,font:bold});
sheet.drawText(declaration,{x:65,y:345,size:14,font});sheet.drawText('To the best of my knowledge and belief.',{x:65,y:325,size:14,font});sheet.drawText('Thanking You',{x:275,y:290,size:14,font});sheet.drawText('Date:                              Signature retained',{x:65,y:210,size:14,font});
sheet.pushOperators(popGraphicsState());
const bytes=Buffer.from(await source.save({useObjectStreams:false}));
async function positions(page,buffer){return page.evaluate(async bytes=>{const {loadPdfjs}=await import(new URL('../../documents/document-editor-v2-lab/pdf-engine/fortress/src/rendering/pdfjs.js',location.href).href);const p=await loadPdfjs(),pdf=await p.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;try{const items=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);for(const t of (await pg.getTextContent()).items)items.push({text:t.str,x:t.transform[4],y:t.transform[5],page:i});}return items;}finally{await pdf.destroy?.();}},Array.from(buffer));}
async function exportBytes(page){const event=page.waitForEvent('download',{timeout:60000});await page.locator('[data-action=export]').click();const d=await event;return fs.readFile(await d.path());}
try{
 for(const entry of [{name:'leading Enter',text:'\n'+declaration,offset:14*1.2},{name:'two leading Enters',text:'\n\n'+declaration,offset:28*1.2},{name:'middle Enter',text:declaration.replace('information','information\n'),offset:null},{name:'trailing Enter',text:declaration+'\n',offset:0}]){
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/');await page.locator('#document-v2-file').setInputFiles({name:'declaration.pdf',mimeType:'application/pdf',buffer:bytes});
   const hit=page.getByRole('button',{name:'Edit text: '+declaration,exact:true});await hit.click();const input=page.getByRole('textbox',{name:'Edit PDF text',exact:true});
   if(entry.name==='leading Enter'){await input.press('Control+Home');await input.press('Enter');assert.equal(await input.inputValue(),entry.text);}else await input.fill(entry.text);
   await page.locator('.pdf-done').click();await page.locator('.pdf-done').waitFor({state:'hidden',timeout:60000});
   const output=await exportBytes(page),items=await positions(page,output),text=items.map(i=>i.text).join(' ').replace(/\s+/g,' ');
   assert.ok(text.includes(declaration),entry.name+': all declaration text must remain');for(const sentinel of ['DECLARATION:','To the best of my knowledge and belief.','Thanking You','Signature retained'])assert.ok(text.includes(sentinel),entry.name+': '+sentinel);
   if(process.env.PDF_QA_DIR&&entry.name==='leading Enter'){await fs.mkdir(process.env.PDF_QA_DIR,{recursive:true});await fs.writeFile(process.env.PDF_QA_DIR+'/declaration-after-enter.pdf',output);await page.screenshot({path:process.env.PDF_QA_DIR+'/declaration-after-enter.png',fullPage:true});}
   if(entry.offset!==null){const moved=items.find(i=>i.text===declaration);assert.ok(moved,entry.name+': declaration is one visible line');assert.ok(Math.abs(moved.y-(345-entry.offset))<1,entry.name+': Enter must lower the text by a line');}
   await page.waitForFunction(()=>!document.querySelector('[data-action=undo]').disabled);await page.locator('[data-action=undo]').click();await hit.waitFor({timeout:60000});
   const undone=await positions(page,await exportBytes(page));assert.ok(undone.some(i=>i.text===declaration&&Math.abs(i.y-345)<1),'one undo restores complete original');
   await page.locator('[data-action=redo]').click();await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);await page.waitForTimeout(800);
   await page.reload();await page.locator('#document-v2-restore').click();await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Recovered'),null,{timeout:60000});
   assert.ok((await positions(page,await exportBytes(page))).map(i=>i.text).join(' ').replace(/\s+/g,' ').includes(declaration),'redo and recovery retain declaration');
   assert.deepEqual(errors,[]);console.log('PASS '+entry.name+': preview commit, export coordinates, preserved surroundings, undo/redo, recovery');
  }catch(error){console.error('FAIL',entry.name,await page.locator('#document-v2-status').textContent(),await page.locator('.pdf-fortress-status').allTextContents());throw error;}finally{await page.close();}
 }
 for(const rejected of [{name:'unsupported replacement glyph',text:'\n'+declaration+' 😀'}]){
  const page=await browser.newPage({acceptDownloads:true});page.on('dialog',d=>d.accept());
  try{
   await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/');await page.locator('#document-v2-file').setInputFiles({name:'protected-declaration.pdf',mimeType:'application/pdf',buffer:bytes});
   await page.getByRole('button',{name:'Edit text: '+declaration,exact:true}).click();const input=page.getByRole('textbox',{name:'Edit PDF text',exact:true});await input.fill(rejected.text);await page.locator('.pdf-done').click();
   await page.waitForFunction(()=>!document.querySelector('.pdf-done').disabled);assert.equal(await input.inputValue(),rejected.text,'refusal retains the complete attempted replacement');
   assert.equal(await page.locator('[data-action=undo]').isDisabled(),true,'a rejected edit must not commit a deletion');
   await input.fill(declaration);await page.locator('.pdf-done').click();await input.waitFor({state:'hidden'});const items=await positions(page,await exportBytes(page));assert.ok(items.some(i=>i.text===declaration&&Math.abs(i.y-345)<1));
   console.log('PASS '+rejected.name+': refusal retains input and original source; subsequent export keeps sentence');
  }finally{await page.close();}
 }
}finally{await browser.close();}
