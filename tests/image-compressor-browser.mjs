import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const TYPES=new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp']
]);

const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let filePath=resolve(ROOT,'.'+pathname);
    if(!(filePath===ROOT||filePath.startsWith(ROOT+sep)))throw new Error('bad path');
    let info;try{info=await stat(filePath)}catch{info=null}
    if(info?.isDirectory())filePath=resolve(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'content-type':TYPES.get(extname(filePath).toLowerCase())||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');
  }
});
await new Promise(r=>server.listen(4196,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH)launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();

function bufferFromDataUrl(dataUrl){
  return Buffer.from(dataUrl.split(',')[1],'base64');
}

try{
  await page.goto('http://127.0.0.1:4196/images/batch/',{waitUntil:'networkidle',timeout:60000});
  assert.equal(await page.locator('h1').textContent(),'Image Compressor');
  assert.ok((await page.title()).startsWith('Image Compressor'));

  assert.equal(await page.locator('#size').inputValue(),'original');
  assert.equal(await page.locator('#size option:checked').textContent(),'Original size');
  assert.equal(await page.locator('#format option:checked').textContent(),'Same as original');
  assert.equal(await page.locator('#quality option:checked').textContent(),'Balanced — Recommended');
  assert.equal(await page.locator('#target-mode option:checked').textContent(),'Automatic — Recommended');
  assert.equal(await page.evaluate(()=>document.querySelector('#custom-width').parentElement.hidden),true);
  assert.equal(await page.evaluate(()=>document.querySelector('#target-value').parentElement.hidden),true);
  assert.ok(!(await page.locator('#workspace').innerText()).includes('Maximum width'));
  assert.ok(!(await page.locator('#workspace').innerText()).includes('Target maximum size in KB'));

  await page.locator('#size').selectOption('custom');
  assert.equal(await page.evaluate(()=>document.querySelector('#custom-width').parentElement.hidden),false);
  assert.equal(await page.evaluate(()=>document.querySelector('#custom-height').parentElement.hidden),false);
  await page.locator('#size').selectOption('original');

  await page.locator('#target-mode').selectOption('manual');
  assert.equal(await page.evaluate(()=>document.querySelector('#target-value').parentElement.hidden),false);
  assert.equal(await page.evaluate(()=>document.querySelector('#target-unit').parentElement.hidden),false);
  await page.locator('#target-mode').selectOption('auto');

  const fixtures=await page.evaluate(()=>{
    const c=document.createElement('canvas');
    c.width=640;c.height=480;
    const ctx=c.getContext('2d',{alpha:true});
    const image=ctx.createImageData(c.width,c.height);
    let state=0x12345678;
    for(let p=0;p<image.data.length;p+=4){
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      image.data[p]=(state>>>16)&255;
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      image.data[p+1]=(state>>>16)&255;
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      image.data[p+2]=(state>>>16)&255;
      image.data[p+3]=((p/4)%17===0)?110:255;
    }
    ctx.putImageData(image,0,0);
    return {
      png:c.toDataURL('image/png'),
      jpg:c.toDataURL('image/jpeg',0.96),
      webp:c.toDataURL('image/webp',0.96)
    };
  });

  async function runSingle(name,mime,dataUrl,options={}){
    const {
      size='original',
      format='keep',
      quality='0.8',
      targetMode='manual',
      targetValue='24',
      targetUnit='kb'
    }=options;

    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType:mime,
      buffer:bufferFromDataUrl(dataUrl)
    });
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Ready to compress.'),null,{timeout:20000});
    await page.locator('#size').selectOption(size);
    await page.locator('#format').selectOption(format);
    await page.locator('#quality').selectOption(quality);
    await page.locator('#target-mode').selectOption(targetMode);
    if(targetMode==='manual'){
      await page.locator('#target-value').fill(String(targetValue));
      await page.locator('#target-unit').selectOption(targetUnit);
    }

    await page.getByRole('button',{name:'Compress images'}).click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Compression complete.'),null,{timeout:90000});

    const result=await page.evaluate(async()=>{
      const links=[...document.querySelectorAll('#downloads a[download]')];
      const link=links.find(a=>!a.download.endsWith('.zip'));
      if(!link)throw new Error('No compressed download found.');
      const blob=await (await fetch(link.href)).blob();
      const bitmap=await createImageBitmap(blob);
      const row=document.querySelector('[data-compressor-result]')?.textContent||'';
      const out={size:blob.size,type:blob.type,width:bitmap.width,height:bitmap.height,row,name:link.download};
      bitmap.close();
      return out;
    });
    return result;
  }

  const png=await runSingle('single.png','image/png',fixtures.png);
  assert.equal(png.type,'image/png');
  assert.ok(png.size<=24*1024,'PNG maximum size not met: '+png.size);
  assert.ok(png.width<640||png.height<480,'PNG should reduce dimensions when lossless output cannot meet the selected maximum.');
  assert.match(png.row,/maximum file size met/);

  const jpg=await runSingle('single.jpg','image/jpeg',fixtures.jpg);
  assert.equal(jpg.type,'image/jpeg');
  assert.ok(jpg.size<=24*1024,'JPG maximum size not met: '+jpg.size);

  const webp=await runSingle('single.webp','image/webp',fixtures.webp);
  assert.equal(webp.type,'image/webp');
  assert.ok(webp.size<=24*1024,'WebP maximum size not met: '+webp.size);

  await page.locator('input[type=file]').setInputFiles([
    {name:'one.png',mimeType:'image/png',buffer:bufferFromDataUrl(fixtures.png)},
    {name:'two.jpg',mimeType:'image/jpeg',buffer:bufferFromDataUrl(fixtures.jpg)}
  ]);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Ready to compress.'),null,{timeout:20000});
  const batchSummary=(await page.locator('#workspace p').filter({hasText:'images selected'}).last().textContent())||'';
  assert.match(batchSummary,/2 images selected/);
  await page.locator('#target-mode').selectOption('auto');
  await page.getByRole('button',{name:'Compress images'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Compression complete.'),null,{timeout:90000});
  assert.equal(await page.locator('[data-compressor-result]').count(),2);
  assert.equal(await page.getByRole('button',{name:'Download all (.zip)'}).isEnabled(),true);

  const phoneJpg=await page.evaluate(()=>{
    const c=document.createElement('canvas');
    c.width=4032;c.height=3024;
    const ctx=c.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,c.width,c.height);
    gradient.addColorStop(0,'#194d33');
    gradient.addColorStop(0.5,'#d8e8df');
    gradient.addColorStop(1,'#7a4b2a');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,c.width,c.height);
    for(let y=0;y<c.height;y+=336){
      ctx.fillStyle='rgba(255,255,255,0.08)';
      ctx.fillRect(0,y,c.width,84);
    }
    return c.toDataURL('image/jpeg',0.9);
  });

  const phone=await runSingle('modern-phone-12mp.jpg','image/jpeg',phoneJpg,{
    targetMode:'auto',
    size:'original',
    quality:'0.8'
  });
  assert.equal(phone.type,'image/jpeg');
  assert.equal(phone.width,4032);
  assert.equal(phone.height,3024);
  assert.ok(!/Failed|8 million pixels/i.test(phone.row),'Modern phone image hit the former mobile pixel-limit failure.');
  assert.match(phone.row,/Ready/);

  console.log('Image Compressor UI, JPG/PNG/WebP, batch, and 12 MP mobile regression passed.');
  console.log(JSON.stringify({png,jpg,webp,phone},null,2));
}finally{
  await context.close();
  await browser.close();
  await new Promise(r=>server.close(r));
}
