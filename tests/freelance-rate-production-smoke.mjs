import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE=(process.env.FREELANCE_RATE_BASE_URL||'https://alltoolforest.github.io/hub').replace(/\/$/,'');
const launchOptions={headless:true};
if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);

try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

    await page.goto(BASE+'/work/freelance-rate/',{waitUntil:'networkidle',timeout:60000});
    assert.equal((await page.locator('h1').textContent())?.trim(),'Freelance Rate Calculator');
    await page.waitForSelector('#freelance-target-income');

    await page.locator('#freelance-currency').selectOption('USD');
    await page.locator('#freelance-target-income').fill('5000');
    await page.locator('#freelance-income-period').selectOption('monthly');
    await page.locator('#freelance-expenses').fill('500');
    await page.locator('#freelance-expense-period').selectOption('monthly');
    await page.locator('#freelance-tax-reserve').fill('20');
    await page.locator('#freelance-contingency').fill('10');
    await page.locator('#freelance-working-weeks').fill('48');
    await page.locator('#freelance-weekly-hours').fill('40');
    await page.locator('#freelance-billable').fill('60');
    await page.locator('#freelance-client-day-hours').fill('8');

    await page.getByRole('button',{name:'Calculate freelance rate'}).click();
    await page.waitForFunction(()=>!document.querySelector('#freelance-rate-result')?.hidden);
    const result=await page.locator('#freelance-rate-result').innerText();
    assert.match(result,/\$70\.32/);
    assert.match(result,/\$77\.35/);
    assert.match(result,/\$618\.80/);
    assert.match(result,/1,152 h|1,152\.0 h/);

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,'Production horizontal overflow '+overflow+' at '+viewport.width);
    assert.match(await page.locator('.freelance-rate-methodology').innerText(),/tax planning reserve/i);
    assert.match(await page.locator('.side-note').innerText(),/not uploaded/i);
    assert.equal(errors.length,0,'Production browser errors:\n'+errors.join('\n'));
    await context.close();
  }

  console.log('PASS: deployed Freelance Rate desktop/mobile production smoke audit passed at '+BASE);
} finally {
  await browser.close();
}
