import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const TYPES=new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],['.json','application/json; charset=utf-8'],['.svg','image/svg+xml'],
  ['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp'],['.wasm','application/wasm']
]);

const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let filePath=resolve(ROOT,'.'+pathname);
    if(!(filePath===ROOT||filePath.startsWith(ROOT+sep)))throw Error('bad path');
    let info;try{info=await stat(filePath)}catch{info=null}
    if(info?.isDirectory())filePath=resolve(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'content-type':TYPES.get(extname(filePath).toLowerCase())||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found')}
});
await new Promise(r=>server.listen(4201,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);

async function collectDownload(download){
  const stream=await download.createReadStream();
  const chunks=[];
  for await(const chunk of stream)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function openInvoice(viewport={width:1280,height:900}){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:4201/work/invoice/',{waitUntil:'networkidle'});
  await page.waitForSelector('#invoice-business-name');
  return {context,page,errors};
}

async function fillBase(page,{currency='USD'}={}){
  await page.locator('#invoice-business-name').fill('AllToolForest Test Business');
  await page.locator('#invoice-business-address').fill('123 Example Street\nHyderabad');
  await page.locator('#invoice-business-email').fill('seller@example.com');
  await page.locator('#invoice-customer-name').fill('Global Customer');
  await page.locator('#invoice-customer-address').fill('456 Customer Avenue\nSingapore');
  await page.locator('#invoice-customer-email').fill('buyer@example.com');
  await page.locator('#invoice-reference').fill('PO-2026-77');
  await page.locator('#invoice-currency').selectOption(currency);
  const item=page.locator('.invoice-item-card').first();
  await item.locator('textarea').first().fill('Consulting service');
  await item.locator('input[type=number]').nth(0).fill('2');
  await item.locator('input[type=number]').nth(1).fill('19.99');
  const tax=item.locator('.invoice-tax-row').first();
  await tax.locator('input[type=text]').fill('VAT');
  await tax.locator('input[type=number]').fill('7.5');
}

async function clickCreate(page){
  await page.getByRole('button',{name:'Create / update invoice'}).click();
  await page.waitForFunction(()=>!document.querySelector('.invoice-preview')?.hidden);
  await page.waitForFunction(()=>document.activeElement?.classList?.contains('invoice-preview'));
}

async function downloadPdf(page){
  const wait=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download PDF'}).click();
  const download=await wait;
  const bytes=await collectDownload(download);
  return {download,bytes};
}

try{
  {
    const {context,page,errors}=await openInvoice();
    assert.equal(await page.locator('.invoice-form-section').count(),6);
    assert.equal(await page.locator('.invoice-item-card').count(),1);
    assert.equal(await page.locator('#invoice-business-name').getAttribute('aria-required'),'true');
    assert.equal(await page.locator('#invoice-customer-name').getAttribute('aria-required'),'true');
    assert.equal(await page.locator('#invoice-number').getAttribute('aria-required'),'true');
    assert.equal(await page.locator('#invoice-page-size').inputValue(),'A4');

    await page.getByRole('button',{name:'Create / update invoice'}).click();
    await page.waitForFunction(()=>document.querySelector('#invoice-business-name')?.getAttribute('aria-invalid')==='true');
    assert.equal(await page.locator('#invoice-business-name').getAttribute('aria-invalid'),'true');
    assert.match((await page.locator('#invoice-business-name-error').textContent())||'',/business|seller/i);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'invoice-business-name');

    await fillBase(page);
    const before=await page.locator('.invoice-item-card').count();
    await page.getByRole('button',{name:'Add item'}).click();
    assert.equal(await page.locator('.invoice-item-card').count(),before+1);
    const second=page.locator('.invoice-item-card').nth(1);
    await second.locator('textarea').first().fill('Support retainer');
    await second.locator('input[type=number]').nth(0).fill('1.5');
    await second.locator('input[type=number]').nth(1).fill('100');
    await second.getByRole('button',{name:'Add tax'}).click();
    assert.equal(await second.locator('.invoice-tax-row').count(),2);
    const secondTaxes=second.locator('.invoice-tax-row');
    await secondTaxes.nth(0).locator('input[type=text]').fill('VAT');
    await secondTaxes.nth(0).locator('input[type=number]').fill('0');
    await secondTaxes.nth(1).locator('input[type=text]').fill('Local tax');
    await secondTaxes.nth(1).locator('input[type=number]').fill('2.5');
    await page.locator('#invoice-discount').fill('10');
    await clickCreate(page);

    const preview=await page.locator('.invoice-preview').innerText();
    assert.match(preview,/Consulting service/);
    assert.match(preview,/Support retainer/);
    assert.match(preview,/Total due/);
    assert.match(preview,/\$?173\.68|173\.68/);
    assert.equal(await page.locator('.invoice-line-table tbody tr').count(),2);
    assert.equal(await page.locator('.invoice-line-table th[scope=col]').count(),5);
    assert.equal(await page.locator('.invoice-line-table caption').textContent(),'Invoice line items');

    await page.locator('#invoice-customer-name').fill('Changed customer');
    await page.getByRole('button',{name:'Download PDF'}).click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Create or update the invoice before downloading'));
    assert.match((await page.locator('#status').textContent())||'',/Create or update/);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice({width:390,height:844});
    await fillBase(page);
    await page.locator('#invoice-page-size').selectOption('A4');
    await clickCreate(page);
    const dims=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,
      client:document.documentElement.clientWidth,
      preview:document.querySelector('.invoice-preview').getBoundingClientRect().width,
      workspace:document.querySelector('.workspace').getBoundingClientRect().width
    }));
    assert.ok(dims.scroll<=dims.client+1,JSON.stringify(dims));
    assert.ok(dims.preview<=dims.workspace+1,JSON.stringify(dims));

    await page.evaluate(()=>{
      const original=CanvasRenderingContext2D.prototype.fillText;
      window.__invoicePdfText=[];
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__invoicePdfText.push(String(text));return original.call(this,text,...args)};
    });
    const {download,bytes}=await downloadPdf(page);
    assert.ok(download.suggestedFilename().startsWith('invoice-INV-'));
    assert.ok(download.suggestedFilename().endsWith('.pdf'));
    assert.equal(bytes.subarray(0,8).toString('latin1'),'%PDF-1.4');
    const pdfText=bytes.toString('latin1');
    assert.match(pdfText,/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.ok((pdfText.match(/\/Type \/Page\b/g)||[]).length>=1);
    const canvasText=await page.evaluate(()=>window.__invoicePdfText);
    assert.ok(canvasText.some(x=>x.includes('39.98')),canvasText.join('|'));
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice();
    await fillBase(page,{currency:'JPY'});
    const item=page.locator('.invoice-item-card').first();
    await item.locator('input[type=number]').nth(1).fill('100.5');
    await item.locator('.invoice-tax-row input[type=number]').fill('0');
    await page.locator('#invoice-page-size').selectOption('LETTER');
    await clickCreate(page);
    assert.match(await page.locator('.invoice-preview').innerText(),/201/);
    await page.evaluate(()=>{
      const original=CanvasRenderingContext2D.prototype.fillText;
      window.__invoicePdfText=[];
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__invoicePdfText.push(String(text));return original.call(this,text,...args)};
    });
    const {bytes}=await downloadPdf(page);
    assert.match(bytes.toString('latin1'),/MediaBox \[0 0 612 792\]/);
    const captured=await page.evaluate(()=>window.__invoicePdfText);
    assert.ok(captured.some(x=>/201/.test(x)),captured.join('|'));
    assert.ok(!captured.some(x=>/201\.00/.test(x)),captured.join('|'));
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice();
    await fillBase(page,{currency:'KWD'});
    const item=page.locator('.invoice-item-card').first();
    await item.locator('input[type=number]').nth(0).fill('1');
    await item.locator('input[type=number]').nth(1).fill('1.2345');
    await item.locator('.invoice-tax-row input[type=number]').fill('0');
    await clickCreate(page);
    assert.match(await page.locator('.invoice-preview').innerText(),/1\.235/);
    await page.evaluate(()=>{
      const original=CanvasRenderingContext2D.prototype.fillText;
      window.__invoicePdfText=[];
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__invoicePdfText.push(String(text));return original.call(this,text,...args)};
    });
    await downloadPdf(page);
    const captured=await page.evaluate(()=>window.__invoicePdfText);
    assert.ok(captured.some(x=>/1\.235/.test(x)),captured.join('|'));
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice({width:430,height:900});
    await fillBase(page);
    await page.locator('#invoice-business-name').fill('Business '+('X'.repeat(180)));
    for(let i=1;i<30;i++){
      await page.getByRole('button',{name:'Add item'}).click();
      const item=page.locator('.invoice-item-card').nth(i);
      await item.locator('textarea').first().fill('Line '+(i+1)+' '+('Long description '.repeat(5)));
      await item.locator('input[type=number]').nth(0).fill('1');
      await item.locator('input[type=number]').nth(1).fill(String(i+1));
      await item.locator('.invoice-tax-row input[type=number]').fill('0');
    }
    const start=Date.now();
    await clickCreate(page);
    const {bytes}=await downloadPdf(page);
    const elapsed=Date.now()-start;
    const pdfText=bytes.toString('latin1');
    assert.ok((pdfText.match(/\/Type \/Page\b/g)||[]).length>=2,'Expected a multi-page PDF');
    assert.ok(elapsed<20000,'30-line invoice should export within 20 seconds, took '+elapsed+'ms');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Mobile page overflow: '+overflow);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice();
    await fillBase(page);
    await page.locator('#invoice-payment-terms').fill('Net 14 - persisted');
    await page.waitForTimeout(800);
    assert.ok(await page.evaluate(()=>localStorage.getItem('alltoolforest.invoice-builder.draft.v1')?.includes('persisted')));
    await page.reload({waitUntil:'networkidle'});
    await page.waitForSelector('#invoice-business-name');
    assert.equal(await page.locator('#invoice-business-name').inputValue(),'AllToolForest Test Business');
    assert.equal(await page.locator('#invoice-payment-terms').inputValue(),'Net 14 - persisted');

    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Clear saved draft'}).click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Saved draft cleared'));
    assert.equal(await page.locator('#invoice-business-name').inputValue(),'AllToolForest Test Business');
    assert.equal(await page.evaluate(()=>localStorage.getItem('alltoolforest.invoice-builder.draft.v1')),null);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openInvoice();
    for(const path of ['/work/job-match/','/work/cover-letter/','/work/timesheet/','/work/linkedin/','/work/writing/']){
      await page.goto('http://127.0.0.1:4201'+path,{waitUntil:'networkidle'});
      assert.ok((await page.locator('h1').textContent())?.trim().length>0,path+' did not render');
    }
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  console.log('PASS: Invoice Builder Task 4 Chromium release audit passed.');
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
