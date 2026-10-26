// Run against the isolated lab: PDF_LAB_URL=http://127.0.0.1:8765/documents/document-editor-v2-lab/
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PDFDocument,StandardFonts}=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica);
source.addPage([612,792]).drawText('Original sample text',{x:60,y:700,size:12,font});
const bytes=Buffer.from(await source.save({useObjectStreams:false}));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const errors=[];
try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport,acceptDownloads:true});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.PDF_LAB_URL||'http://127.0.0.1:8765/documents/document-editor-v2-lab/');
    await page.locator('#document-v2-file').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:bytes});
    await page.getByRole('button',{name:'Edit text: Original sample text',exact:true}).click({timeout:30000});
    await page.getByRole('textbox',{name:'Edit PDF text',exact:true}).fill('Updated sample text');
    await page.locator('.pdf-done').click();
    await page.waitForFunction(()=>document.querySelector('#document-v2-status').textContent.includes('Draft saved'),null,{timeout:30000});
    await page.locator('[data-action=undo]').click();
    await page.getByRole('button',{name:'Edit text: Original sample text',exact:true}).waitFor();
    await page.locator('[data-action=redo]').click();
    await page.getByRole('button',{name:'Edit text: Updated sample text',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('#document-v2-file').disabled);
    await page.reload();await page.locator('#document-v2-restore').click();
    await page.getByRole('button',{name:'Edit text: Updated sample text',exact:true}).waitFor();
    await page.getByText('Find and replace PDF text',{exact:true}).click();
    const search=page.locator('details.document-v2-search').filter({has:page.getByText('Find and replace PDF text',{exact:true})});
    await search.getByLabel('Find',{exact:true}).fill('Updated');await search.getByRole('button',{name:'Search',exact:true}).click();
    await search.getByRole('status').filter({hasText:'1 matches'}).waitFor();
    await search.getByLabel('Replace with',{exact:true}).fill('Edited');await search.getByRole('button',{name:'Replace all',exact:true}).click();
    await search.getByRole('status').filter({hasText:'1 replacements applied'}).waitFor();
    await page.getByRole('button',{name:'Edit text: Edited sample text',exact:true}).waitFor();
    const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=export]').click();const download=await downloadPromise;
    const output=await fs.readFile(await download.path());assert.equal((await PDFDocument.load(output)).getPageCount(),1);
    if(process.env.PDF_QA_DIR){await fs.mkdir(process.env.PDF_QA_DIR,{recursive:true});await page.screenshot({path:`${process.env.PDF_QA_DIR}/native-${viewport.width}.png`,fullPage:true});await fs.writeFile(`${process.env.PDF_QA_DIR}/native-${viewport.width}.pdf`,output);}
    console.log(`PASS Chromium ${viewport.width}px: real rendering, edit, IndexedDB autosave, undo/redo, refresh recovery, search/replace and download`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
