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
const page=await browser.newPage();

function bufferFromDataUrl(dataUrl){
  return Buffer.from(dataUrl.split(',')[1],'base64');
}

try{
  await page.goto('http://127.0.0.1:4196/images/batch/',{waitUntil:'networkidle',timeout:60000});
  assert.equal(await page.locator('h1').textContent(),'Image Compressor');
  assert.ok((await page.title()).startsWith('Image Compressor'));

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

  async function runSingle(name,mime,dataUrl,targetKB=24){
    await page.locator('input[type=file]').setInputFiles({
      name,
      mimeType:mime,
      buffer:bufferFromDataUrl(dataUrl)
    });
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Ready to compress.'),null,{timeout:20000});
    await page.locator('#width').fill('0');
    await page.locator('#height').fill('0');
    await page.locator('#format').selectOption('keep');
    await page.locator('#quality').fill('82');
    await page.locator('#target').fill(String(targetKB));

    await page.getByRole('button',{name:'Compress images'}).click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Compression complete.'),null,{timeout:60000});

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

  const png=await runSingle('single.png','image/png',fixtures.png,24);
  assert.equal(png.type,'image/png');
  assert.ok(png.size<=24*1024,`PNG target not met: ${png.size}`);
  assert.ok(png.width<640||png.height<480,'PNG target should reduce dimensions when lossless size alone cannot meet target.');
  assert.match(png.row,/target ≤ 24 KB met/);

  const jpg=await runSingle('single.jpg','image/jpeg',fixtures.jpg,24);
  assert.equal(jpg.type,'image/jpeg');
  assert.ok(jpg.size<=24*1024,`JPG target not met: ${jpg.size}`);

  const webp=await runSingle('single.webp','image/webp',fixtures.webp,24);
  assert.equal(webp.type,'image/webp');
  assert.ok(webp.size<=24*1024,`WebP target not met: ${webp.size}`);

  await page.locator('input[type=file]').setInputFiles([
    {name:'one.png',mimeType:'image/png',buffer:bufferFromDataUrl(fixtures.png)},
    {name:'two.jpg',mimeType:'image/jpeg',buffer:bufferFromDataUrl(fixtures.jpg)}
  ]);
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Ready to compress.'),null,{timeout:20000});
  const batchSummary=(await page.locator('#workspace p').filter({hasText:'images selected'}).last().textContent())||'';
  assert.match(batchSummary,/2 images selected/);
  await page.locator('#target').fill('0');
  await page.getByRole('button',{name:'Compress images'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('Compression complete.'),null,{timeout:60000});
  assert.equal(await page.locator('[data-compressor-result]').count(),2);
  assert.equal(await page.getByRole('button',{name:'Download all (.zip)'}).isEnabled(),true);

  console.log('Image Compressor JPG/PNG/WebP single and multi-image audit passed.');
  console.log(JSON.stringify({png,jpg,webp},null,2));
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
