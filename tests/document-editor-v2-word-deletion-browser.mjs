// Serve the repository and set DOCUMENT_EDITOR_URL to that server before running.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import Zip from '../hybrid-build/node_modules/jszip/lib/index.js';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 for(const value of ['0','false','off','1']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8765/documents/document-editor/');
  const zip=new Zip(),first='Opening sentence. '+('Sentence to remove. '.repeat(260));
  zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${first}</w:t></w:r></w:p><w:p><w:pPr><w:pageBreakBefore w:val="${value}"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Bottom sentinel.</w:t></w:r></w:p></w:body></w:document>`);
  await page.locator('#document-v2-file').setInputFiles({name:'deletion-'+value+'.docx',mimeType:'application/octet-stream',buffer:await zip.generateAsync({type:'nodebuffer'})});
  const fields=page.locator('[contenteditable=true]');await fields.first().waitFor();
  // Real Backspace following a partial text selection, rather than replacing the whole textbox.
  await fields.first().evaluate(n=>{n.focus();const r=document.createRange();r.setStart(n.firstChild.firstChild,'Opening sentence. '.length);r.setEnd(n.lastChild.lastChild,n.lastChild.lastChild.length);getSelection().removeAllRanges();getSelection().addRange(r);});
  await page.keyboard.press('Backspace');
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=status]')].some(n=>n.textContent.includes('browser pagination')));
  await page.waitForTimeout(100);
  const positions=await fields.evaluateAll(ns=>ns.map(n=>({x:n.offsetLeft,y:n.offsetTop,text:n.textContent})));
  assert.equal(positions[0].text,'Opening sentence. ');
  if(value==='1')assert.ok(positions[1].x>positions[0].x+300,'Intentional page break must remain');
  else{assert.ok(Math.abs(positions[1].x-positions[0].x)<2,`Disabled page break ${value} prevents text moving upward`);assert.ok(positions[1].y>positions[0].y&&positions[1].y-positions[0].y<100);}
  await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Draft saved'));
  await page.locator('[data-action=undo]').click();assert.equal(await fields.first().textContent(),first);
  await page.locator('[data-action=redo]').click();assert.equal(await fields.first().textContent(),'Opening sentence. ');
  await page.waitForFunction(()=>!document.querySelector('#document-v2-stage').inert);
  if(value!=='1'){
   await fields.nth(1).evaluate(n=>{n.focus();const r=document.createRange();r.selectNodeContents(n);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);});await page.keyboard.press('Backspace');
   assert.equal(await fields.count(),1,'Disabled break must allow paragraph-boundary deletion');assert.equal(await fields.first().textContent(),'Opening sentence. Bottom sentinel.');
  }
  const download=page.waitForEvent('download');await page.locator('[data-action=export]').click();const d=await download;const output=await Zip.loadAsync(await (await import('node:fs/promises')).readFile(await d.path()));const xml=new JSDOM(await output.file('word/document.xml').async('string'),{contentType:'application/xml'}).window.document;
  assert.equal([...xml.getElementsByTagNameNS(W,'t')].map(n=>n.textContent).join(''),'Opening sentence. Bottom sentinel.');assert.equal(xml.getElementsByTagNameNS(W,'p').length,value==='1'?2:1);assert.equal(xml.getElementsByTagNameNS(W,'b').length,1,'Suffix bold formatting survives merge');assert.deepEqual(errors,[]);
  console.log('PASS keyboard deletion, upward flow, undo/redo and export: pageBreakBefore='+value);await page.close();
 }
}finally{await browser.close();}
