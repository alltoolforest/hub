import { chromium } from 'playwright';
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
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
    let filePath=resolve(ROOT,'.'+pathname);
    if(!(filePath===ROOT||filePath.startsWith(ROOT+sep)))throw Error('bad path');
    let info;try{info=await stat(filePath)}catch{info=null}
    if(info?.isDirectory())filePath=resolve(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'content-type':TYPES.get(extname(filePath).toLowerCase())||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');
  }
});
await new Promise(r=>server.listen(4203,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);

async function openRate(viewport={width:1280,height:900}){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:4203/work/freelance-rate/',{waitUntil:'networkidle'});
  await page.waitForSelector('#freelance-target-income');
  return {context,page,errors};
}

async function calculate(page){
  const start=Date.now();
  await page.getByRole('button',{name:'Calculate freelance rate'}).click();
  await page.waitForFunction(()=>!document.querySelector('#freelance-rate-result')?.hidden);
  await page.waitForFunction(()=>document.activeElement?.id==='freelance-rate-result');
  return Date.now()-start;
}

try{
  {
    const {context,page,errors}=await openRate();
    assert.equal((await page.locator('h1').textContent())?.trim(),'Freelance Rate Calculator');
    assert.equal(await page.locator('.freelance-rate-section').count(),4);
    for(const id of [
      '#freelance-currency','#freelance-target-income','#freelance-income-period',
      '#freelance-expenses','#freelance-expense-period','#freelance-tax-reserve',
      '#freelance-contingency','#freelance-working-weeks','#freelance-weekly-hours',
      '#freelance-client-day-hours','#freelance-billable'
    ])assert.equal(await page.locator(id).getAttribute('aria-describedby')!==null,true,id+' missing aria-describedby');

    const elapsed=await calculate(page);
    assert.ok(elapsed<2000,'Default calculation took '+elapsed+'ms');
    const text=await page.locator('#freelance-rate-result').innerText();
    assert.match(text,/Minimum sustainable hourly rate/);
    assert.match(text,/Recommended hourly rate/);
    assert.match(text,/\$70\.32/);
    assert.match(text,/\$77\.35/);
    assert.match(text,/\$618\.80/);
    assert.match(text,/1,152 h|1,152\.0 h/);
    assert.match(text,/\$81,000\.00/);
    assert.match(text,/Planning estimate only/);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openRate();
    await page.locator('#freelance-working-weeks').fill('53');
    await page.getByRole('button',{name:'Calculate freelance rate'}).click();
    await page.waitForFunction(()=>document.querySelector('#freelance-working-weeks')?.getAttribute('aria-invalid')==='true');
    assert.match((await page.locator('#freelance-working-weeks-error').textContent())||'',/at most 52/);
    await page.waitForFunction(()=>document.activeElement?.id==='freelance-working-weeks');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'freelance-working-weeks');

    await page.locator('#freelance-working-weeks').fill('48');
    await page.locator('#freelance-billable').fill('0');
    await page.getByRole('button',{name:'Calculate freelance rate'}).click();
    await page.waitForFunction(()=>document.querySelector('#freelance-billable')?.getAttribute('aria-invalid')==='true');
    assert.match((await page.locator('#freelance-billable-error').textContent())||'',/at least 1/);

    const unexpected=errors.filter(message=>!message.includes('Check the highlighted rate-planning fields'));
    assert.equal(unexpected.length,0,unexpected.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openRate();
    await page.locator('#freelance-currency').selectOption('JPY');
    await page.locator('#freelance-target-income').fill('500000');
    await page.locator('#freelance-expenses').fill('50000');
    await page.locator('#freelance-tax-reserve').fill('0');
    await page.locator('#freelance-contingency').fill('0');
    await calculate(page);
    const text=await page.locator('#freelance-rate-result').innerText();
    assert.match(text,/5,730/);
    assert.ok(!/5,730\.00/.test(text),'JPY result must not show two decimal places');

    await page.locator('#freelance-currency').selectOption('KWD');
    await page.locator('#freelance-target-income').fill('1000');
    await page.locator('#freelance-expenses').fill('0');
    await calculate(page);
    const kwdText=await page.locator('#freelance-rate-result').innerText();
    assert.match(kwdText,/10\.417/);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  for(const width of [320,360,390,430]){
    const {context,page,errors}=await openRate({width,height:844});
    await page.locator('#freelance-currency').selectOption('KWD');
    await page.locator('#freelance-target-income').fill('999999999');
    await page.locator('#freelance-expenses').fill('999999');
    await calculate(page);
    const dims=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,
      client:document.documentElement.clientWidth,
      result:document.querySelector('#freelance-rate-result').getBoundingClientRect().width,
      workspace:document.querySelector('.workspace').getBoundingClientRect().width
    }));
    assert.ok(dims.scroll<=dims.client+1,'Horizontal page overflow at '+width+': '+JSON.stringify(dims));
    assert.ok(dims.result<=dims.workspace+1,'Result overflow at '+width+': '+JSON.stringify(dims));
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openRate();
    await page.locator('#freelance-currency').selectOption('EUR');
    await page.locator('#freelance-target-income').fill('7000');
    await calculate(page);
    await page.getByRole('button',{name:'Reset'}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='freelance-currency');
    assert.equal(await page.locator('#freelance-currency').inputValue(),'USD');
    assert.equal(await page.locator('#freelance-target-income').inputValue(),'5000');
    assert.equal(await page.locator('#freelance-rate-result').isHidden(),true);
    assert.match((await page.locator('#status').textContent())||'',/reset/i);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openRate();
    const methodology=await page.locator('.freelance-rate-methodology').innerText();
    assert.match(methodology,/How the freelance rate estimate works/);
    assert.match(methodology,/tax planning reserve/i);
    assert.match(methodology,/billable time/i);
    assert.match(methodology,/minimum hourly rate/i);
    const description=await page.locator('meta[name=description]').getAttribute('content');
    assert.match(description||'',/tax reserve/i);
    assert.match(await page.locator('.side-note').innerText(),/not uploaded/i);
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  {
    const {context,page,errors}=await openRate();
    const frozenSmoke=[
      ['/calculators/loan/','Loan & EMI Calculator'],
      ['/calculators/investment/','SIP & Investment Calculator'],
      ['/calculators/scientific/','Scientific Calculator'],
      ['/work/timesheet/','Timesheet & Work Hours']
    ];
    for(const [path,heading] of frozenSmoke){
      await page.goto('http://127.0.0.1:4203'+path,{waitUntil:'networkidle'});
      const actual=((await page.locator('h1').textContent())||'').trim();
      assert.ok(actual.includes(heading),path+' failed to render expected heading: '+actual);
    }
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }

  console.log('PASS: Freelance Rate Task 3 Chromium release audit passed.');
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
