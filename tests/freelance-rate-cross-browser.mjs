import { firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const TYPES=new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.svg','image/svg+xml']
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
await new Promise(r=>server.listen(4204,'127.0.0.1',r));

async function run(name,launcher,contextOptions){
  const browser=await launcher.launch({headless:true});
  const context=await browser.newContext(contextOptions);
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  try{
    await page.goto('http://127.0.0.1:4204/work/freelance-rate/',{waitUntil:'networkidle'});
    await page.waitForSelector('#freelance-target-income');
    await page.locator('#freelance-currency').selectOption('EUR');
    await page.locator('#freelance-target-income').fill('4000');
    await page.locator('#freelance-expenses').fill('600');
    await page.locator('#freelance-tax-reserve').fill('25');
    await page.locator('#freelance-contingency').fill('10');
    await page.locator('#freelance-working-weeks').fill('46');
    await page.locator('#freelance-weekly-hours').fill('38');
    await page.locator('#freelance-billable').fill('55');
    await page.locator('#freelance-client-day-hours').fill('7.5');

    await page.getByRole('button',{name:'Calculate freelance rate'}).click();
    await page.waitForFunction(()=>!document.querySelector('#freelance-rate-result')?.hidden);
    const text=await page.locator('#freelance-rate-result').innerText();
    assert.match(text,/Minimum sustainable hourly rate/);
    assert.match(text,/Recommended hourly rate/);
    assert.match(text,/Annual billable hours/);
    assert.ok(/€|EUR/.test(text),name+' currency output missing');

    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(overflow<=1,name+' horizontal overflow '+overflow);
    assert.equal(await page.locator('#freelance-rate-result').getAttribute('tabindex'),'-1');
    assert.equal(errors.length,0,name+' browser errors:\n'+errors.join('\n'));
    console.log('PASS '+name+': calculation, responsive output and accessibility-critical flow.');
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
  console.log('PASS: Freelance Rate Firefox and WebKit compatibility audit passed.');
} finally {
  await new Promise(r=>server.close(r));
}
