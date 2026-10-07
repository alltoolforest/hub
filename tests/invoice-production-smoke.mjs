import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE=(process.env.INVOICE_BASE_URL||'https://alltoolforest.github.io/hub').replace(/\/$/,'');
const launchOptions={headless:true};
if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);

async function bytesOf(download){
  const stream=await download.createReadStream(),chunks=[];
  for await(const chunk of stream)chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto(BASE+'/work/invoice/',{waitUntil:'networkidle',timeout:60000});
    assert.equal((await page.locator('h1').textContent())?.trim(),'Invoice Builder');
    await page.waitForSelector('#invoice-business-name');

    await page.locator('#invoice-business-name').fill('Production Audit Business');
    await page.locator('#invoice-customer-name').fill('Production Audit Customer');
    await page.locator('#invoice-currency').selectOption('USD');
    const item=page.locator('.invoice-item-card').first();
    await item.locator('textarea').fill('Production audit service');
    await item.locator('input[type=number]').nth(0).fill('2');
    await item.locator('input[type=number]').nth(1).fill('50');
    await item.locator('.invoice-tax-row input[type=text]').fill('Tax');
    await item.locator('.invoice-tax-row input[type=number]').fill('5');
    await page.getByRole('button',{name:'Create / update invoice'}).click();
    await page.waitForFunction(()=>!document.querySelector('.invoice-preview')?.hidden);
    assert.match(await page.locator('.invoice-preview').innerText(),/105\.00/);

    const waiting=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download PDF'}).click();
    const download=await waiting;
    const bytes=await bytesOf(download);
    assert.equal(bytes.subarray(0,8).toString('latin1'),'%PDF-1.4');
    assert.ok(download.suggestedFilename().startsWith('invoice-INV-'));

    await page.locator('#invoice-notes').fill('production persistence check');
    await page.waitForTimeout(700);
    await page.reload({waitUntil:'networkidle'});
    await page.waitForSelector('#invoice-notes');
    assert.equal(await page.locator('#invoice-notes').inputValue(),'production persistence check');

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Production horizontal overflow '+overflow+' at '+viewport.width);
    assert.equal(errors.length,0,'Production browser errors:\n'+errors.join('\n'));
    await context.close();
  }
  console.log('PASS: deployed Invoice Builder desktop/mobile production smoke audit passed at '+BASE);
} finally {
  await browser.close();
}
