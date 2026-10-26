import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),d=require('../hybrid-build/node_modules/docx/dist/index.cjs'),Excel=require('../hybrid-build/node_modules/exceljs/excel.js'),Zip=require('../hybrid-build/node_modules/jszip/lib/index.js');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage({acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 await page.goto(process.env.DOCUMENT_EDITOR_URL||'http://127.0.0.1:8765/documents/document-editor/');
 assert.equal(await page.locator('h1').textContent(),'Document Editor');
 async function choose(name,buffer){await page.locator('#document-v2-file').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(buffer)});await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);}
 async function download(){const promise=page.waitForEvent('download');await page.locator('[data-action=export]').click();const file=await promise;return fs.readFile(await file.path());}
 await choose('notes.txt','Text original');await page.getByRole('textbox',{name:'Document text',exact:true}).fill('Text edited नमस्ते');assert.equal((await download()).toString(),'Text edited नमस्ते');console.log('PASS public TXT edit/export');
 const word=await d.Packer.toBuffer(new d.Document({sections:[{children:[new d.Paragraph('Word original')]}]}));await choose('notes.docx',word);await page.locator('.document-v2-paragraph[contenteditable=true]').first().fill('Word edited');const zip=await Zip.loadAsync(await download());const wordText=await page.evaluate(xml=>[...new DOMParser().parseFromString(xml,'application/xml').getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','t')].map(node=>node.textContent).join(''),await zip.file('word/document.xml').async('string'));assert.equal(wordText,'Word edited');console.log('PASS public DOCX load/ZIP dependency/edit/export');
 const book=new Excel.Workbook();book.addWorksheet('Input').getCell('A1').value=10;await choose('sheet.xlsx',await book.xlsx.writeBuffer());const cell=page.getByRole('textbox',{name:'Input A1',exact:true});await cell.fill('25');await cell.press('Tab');const reopened=new Excel.Workbook();await reopened.xlsx.load(await download());assert.equal(reopened.getWorksheet('Input').getCell('A1').value,25);console.log('PASS public XLSX edit/export');
 await choose('sheet.csv','Name,Value\r\nItem,10');const csvCell=page.getByRole('textbox',{name:'Sheet1 B2',exact:true});await csvCell.fill('25');await csvCell.press('Tab');assert.match((await download()).toString(),/Item,25/);console.log('PASS public CSV edit/export');assert.deepEqual(errors,[]);
}finally{await browser.close();}
