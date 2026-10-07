import { firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const TYPES=new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],
  ['.css','text/css; charset=utf-8'],['.json','application/json; charset=utf-8'],['.svg','image/svg+xml']
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
  }catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(r=>server.listen(4202,'127.0.0.1',r));

async function downloadBytes(download){
  const stream=await download.createReadStream(),chunks=[];
  for await(const chunk of stream)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function run(name,launcher,options){
  const browser=await launcher.launch({headless:true});
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto('http://127.0.0.1:4202/work/invoice/',{waitUntil:'networkidle'});
    await page.waitForSelector('#invoice-business-name');
    await page.locator('#invoice-business-name').fill('Cross Browser Business');
    await page.locator('#invoice-customer-name').fill('Cross Browser Customer');
    await page.locator('#invoice-currency').selectOption('EUR');
    const item=page.locator('.invoice-item-card').first();
    await item.locator('textarea').fill('Cross-browser consulting');
    await item.locator('input[type=number]').nth(0).fill('2');
    await item.locator('input[type=number]').nth(1).fill('49.95');
    await item.locator('.invoice-tax-row input[type=text]').fill('VAT');
    await item.locator('.invoice-tax-row input[type=number]').fill('20');
    await page.getByRole('button',{name:'Create / update invoice'}).click();
    await page.waitForFunction(()=>!document.querySelector('.invoice-preview')?.hidden);
    assert.match(await page.locator('.invoice-preview').innerText(),/119[.,]88/);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,name+' horizontal overflow '+overflow);

    const waiting=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download PDF'}).click();
    const download=await waiting;
    const bytes=await downloadBytes(download);
    assert.equal(bytes.subarray(0,8).toString('latin1'),'%PDF-1.4');
    assert.ok(download.suggestedFilename().startsWith('invoice-INV-'));

    await page.locator('#invoice-notes').fill(name+' draft recovery');
    await page.waitForTimeout(700);
    await page.reload({waitUntil:'networkidle'});
    await page.waitForSelector('#invoice-notes');
    assert.equal(await page.locator('#invoice-notes').inputValue(),name+' draft recovery');
    assert.equal(errors.length,0,name+' console/page errors:\n'+errors.join('\n'));
    console.log('PASS '+name+': authoring, responsive layout, PDF download and draft recovery.');
  } finally {
    await browser.close();
  }
}

try{
  await run('Firefox desktop',firefox,{viewport:{width:1280,height:800}});
  await run('WebKit macOS-like',webkit,{
    viewport:{width:1280,height:800},
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  });
  await run('WebKit iOS-like',webkit,{
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  });
  console.log('PASS: Invoice Builder Firefox, macOS-like WebKit and iOS-like WebKit compatibility audit passed.');
} finally {
  await new Promise(r=>server.close(r));
}
