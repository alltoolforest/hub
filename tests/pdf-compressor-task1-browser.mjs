// Task 1 ONLY: exercise the unmodified production PDF Optimizer UI on a
// local static server. Passing known-defect checks documents current behavior.
// Run with playwright installed and PDF_COMPRESSOR_BASE_URL as needed.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
const BASE=process.env.PDF_COMPRESSOR_BASE_URL||'http://127.0.0.1:8765/';
const cases=[
  ['chromium-desktop',chromium,{width:1280,height:820}],
  ['chromium-mobile',chromium,{width:360,height:780}],
  ['firefox-desktop',firefox,{width:1280,height:820}],
  ['webkit-mobile',webkit,{width:390,height:844}]
];
const report=[];
async function upload(page,id){
  const {bytes}=await buildFixture(id);
  await page.locator('#workspace input[type=file]').setInputFiles({
    name:id+'.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)
  });
  await page.waitForFunction(()=>
    /File ready\.|could not open|corrupted|supported document|Invalid PDF|PDF header|Cannot read properties/i
      .test(document.querySelector('#status')?.textContent||''),null,{timeout:20000});
  return bytes;
}
async function download(page){
  const link=page.locator('#downloads a[download]');
  await link.waitFor({timeout:30000});
  const downloadEvent=page.waitForEvent('download',{timeout:15000});
  await link.click();
  const file=await downloadEvent;
  const stream=await file.createReadStream(),chunks=[];
  for await(const part of stream)chunks.push(part);
  return {name:file.suggestedFilename(),bytes:Buffer.concat(chunks)};
}
for(const [name,engine,viewport] of cases){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({
    viewport,acceptDownloads:true,hasTouch:viewport.width<=400,
    isMobile:name==='chromium-mobile'
  });
  const page=await context.newPage();
  const errors=[],remote=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{
    const u=request.url();
    if(!u.startsWith('blob:')&&new URL(u).origin!==new URL(BASE).origin)remote.push(u);
    if(!['GET','HEAD'].includes(request.method()))writes.push(request.method()+' '+u);
  });
  const record={browser:name};
  try{
    await page.goto(new URL('documents/pdf-compressor/',BASE).href,
      {waitUntil:'domcontentloaded',timeout:30000});
    await page.getByRole('heading',{name:'PDF Optimizer'}).waitFor({timeout:15000});
    await page.getByRole('button',{name:'Optimize PDF'}).waitFor({timeout:15000});
    assert.equal(await page.locator('#workspace input[type=file]').getAttribute('accept'),'.pdf');
    record.workspace='PASS';
    const source=await upload(page,'digital');
    await page.getByRole('button',{name:'Optimize PDF'}).click();
    const result=await download(page);
    assert.match(result.name,/digital-optimized\.pdf$/);
    const original=await PDF.PDFDocument.load(source);
    const saved=await PDF.PDFDocument.load(result.bytes);
    assert.equal(saved.getPageCount(),original.getPageCount());
    assert.deepEqual(saved.getPages().map(p=>p.getSize()),
      original.getPages().map(p=>p.getSize()));
    record.export='PASS';
    assert.equal(saved.getTitle(),undefined);
    record.knownMetadataLoss='REPRODUCED';
    // Load a structurally richer file through the real file-input handler.
    await upload(page,'attachment');
    await page.getByRole('button',{name:'Optimize PDF'}).click();
    const attachment=await download(page);
    const opened=await PDF.PDFDocument.load(attachment.bytes);
    assert.equal(opened.catalog.get(PDF.PDFName.of('Names')),undefined);
    record.knownAttachmentLoss='REPRODUCED';
    await upload(page,'invalid');
    assert.match(await page.locator('#status').innerText(),
      /corrupt|invalid|not a pdf|supported document|no pdf|Cannot read properties/i);
    await page.getByRole('button',{name:'Optimize PDF'}).click();
    assert.match(await page.locator('#status').innerText(),
      /Open a valid PDF first|Cannot read properties|page/i);
    record.knownFailedReplacement='REPRODUCED';
    if(viewport.width<=400){
      const widths=await page.evaluate(()=>({
        document:document.documentElement.scrollWidth,viewport:window.innerWidth
      }));
      record.mobileOverflow=widths.document>widths.viewport+2?'OBSERVED':'NONE';
    }
    assert.deepEqual(remote,[],'Unexpected third-party network requests');
    assert.deepEqual(writes,[],'Unexpected file upload or network write');
    assert.deepEqual(errors,[],'Browser JS exceptions');
    record.browserErrors='NONE';
    record.networkUpload='NONE';
    report.push(record);
  }catch(error){
    record.failed=String(error?.stack||error).slice(0,1800);
    record.status=await page.locator('#status').textContent().catch(()=>null);
    report.push(record);
    throw error;
  }finally{
    await context.close();await browser.close();
  }
}
console.log(JSON.stringify({task:'pdf-compressor-task1-baseline',report},null,2));
