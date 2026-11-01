import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Zip from '../hybrid-build/node_modules/jszip/lib/index.js';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
try{
 const page=await browser.newPage({acceptDownloads:true});page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const rows=Array.from({length:24},(_,i)=>`<w:tr><w:tc><w:p><w:r><w:t>Row ${i+1} original editable text.</w:t></w:r></w:p></w:tc></w:tr>`).join('');
 const zip=new Zip();zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body><w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="2400"/></w:tblGrid>${rows}</w:tbl><w:sectPr><w:pgSz w:w="8640" w:h="7200"/><w:pgMar w:top="720" w:bottom="720" w:left="720" w:right="720"/><w:cols w:equalWidth="0" w:num="2"><w:col w:w="2400" w:space="360"/><w:col w:w="4440"/></w:cols></w:sectPr></w:body></w:document>`);
 await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8770/documents/document-editor/');await page.locator('#document-v2-file').setInputFiles({name:'unequal-table.docx',mimeType:'application/octet-stream',buffer:await zip.generateAsync({type:'nodebuffer'})});
 await page.waitForFunction(()=>document.querySelectorAll('table[data-word-continuation]').length>0);
 const field=page.locator('table[data-word-continuation] [data-word-source]').first(),source=await field.getAttribute('data-word-source'),original=await field.textContent();
 await field.evaluate(n=>{n.focus();const range=document.createRange();range.selectNodeContents(n);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);});await page.keyboard.insertText(' ADDED');await page.waitForTimeout(150);
 const edited=page.locator(`[data-word-source="${source}"]`);assert.equal(await edited.textContent(),original+' ADDED');assert.equal(await page.locator('.document-v2-page td').count(),24);
 const pending=page.waitForEvent('download');await page.locator('[data-action=export]').click();const download=await pending,out=await Zip.loadAsync(await fs.readFile(await download.path())),xml=new JSDOM(await out.file('word/document.xml').async('string'),{contentType:'application/xml'}).window.document;
 assert.equal(xml.getElementsByTagNameNS(W,'tbl').length,1);assert.equal(xml.getElementsByTagNameNS(W,'tr').length,24);assert.equal([...xml.getElementsByTagNameNS(W,'p')][Number(source)].textContent,original+' ADDED');
 await page.locator('[data-action=undo]').click();await page.waitForFunction(({source,original})=>document.querySelector(`[data-word-source="${source}"]`)?.textContent===original,{source,original});
 await page.locator('[data-action=redo]').click();await page.waitForFunction(({source,original})=>document.querySelector(`[data-word-source="${source}"]`)?.textContent===original+' ADDED',{source,original});assert.equal(await page.locator('.document-v2-page td').count(),24);assert.deepEqual(errors,[]);
 console.log('PASS unequal table: continuation cell editing, 24 original cells, one exported table, undo and redo');
}finally{await browser.close();}
