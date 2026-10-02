import { firefox, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const ROOT=process.cwd();
const CSP="default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES=new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],['.json','application/json; charset=utf-8'],['.css','text/css; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.wasm','application/wasm']]);

function crc32(buf){let crc=0xffffffff;for(const byte of buf){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function png(width,height){
  const raw=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++){
    const row=y*(width*4+1);raw[row]=0;
    for(let x=0;x<width;x++){
      const p=row+1+x*4;
      const edge=x>16&&x<48&&y>14&&y<50?70:0;
      const stripe=(x%9<2||y%11<2)?45:0;
      raw[p]=Math.max(0,Math.min(255,40+x*2+edge+stripe));
      raw[p+1]=Math.max(0,Math.min(255,50+y*2+edge*.6+stripe*.5));
      raw[p+2]=Math.max(0,Math.min(255,60+(x+y)+edge*.35+stripe*.25));
      raw[p+3]=255;
    }
  }
  const blurred=Buffer.from(raw);
  for(let y=0;y<height;y++){
    const row=y*(width*4+1);
    for(let x=0;x<width;x++){
      const p=row+1+x*4;
      for(let c=0;c<3;c++){
        let sum=0,count=0;
        for(let k=-5;k<=5;k++){
          const xx=Math.max(0,Math.min(width-1,x+k));
          const pp=row+1+xx*4+c;
          sum+=raw[pp];count++;
        }
        blurred[p+c]=Math.round(sum/count);
      }
    }
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(blurred)),chunk('IEND',Buffer.alloc(0))]);
}
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let filePath=resolve(ROOT,'.'+pathname);
    if(!(filePath===ROOT||filePath.startsWith(ROOT+sep)))throw new Error('bad path');
    let info;try{info=await stat(filePath);}catch{info=null;}
    if(info?.isDirectory())filePath=resolve(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'content-type':TYPES.get(extname(filePath).toLowerCase())||'application/octet-stream','content-security-policy':CSP,'cache-control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(4189,'127.0.0.1',r));

async function run(name,launcher){
  const browser=await launcher.launch({headless:true});
  const page=await browser.newPage({viewport:{width:800,height:700}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:4189/images/enhance/',{waitUntil:'networkidle',timeout:90000});
    await page.locator('input[type=file]').setInputFiles({name:`${name}-blur.png`,mimeType:'image/png',buffer:png(128,96)});
    await page.waitForFunction(()=>document.querySelector('#enhancer-source-info')?.textContent?.includes('Analysis:'));
    const summary=(await page.locator('#enhancer-source-info').textContent())||'';
    assert.match(summary,/likely motion \/ defocus blur/, `${name} blur detector did not trigger: ${summary}`);
    await page.locator('#enhancer-mode-enhance').click();
    await page.locator('#enhancer-content').selectOption('low-resolution');
    await page.locator('#enhancer-run').click();
    try {
      await page.waitForFunction(()=>{
        const status=document.querySelector('#status')?.textContent||'';
        return !!document.querySelector('#downloads a[download]')&&/dedicated deblur AI/.test(status);
      },null,{timeout:120000});
    } catch (error) {
      const status=(await page.locator('#status').textContent().catch(()=>''))||'';
      console.error(`DIAGNOSTIC ${name} dedicated-deblur timeout status=${status}`);
      console.error(errors.join('\n'));
      throw error;
    }
    const info=await page.evaluate(async()=>{
      const a=[...document.querySelectorAll('#downloads a[download]')].at(-1);
      const blob=await(await fetch(a.href)).blob();
      const bmp=await createImageBitmap(blob);
      const result=[bmp.width,bmp.height,document.querySelector('#status')?.textContent||'',window.ort?.env?.wasm?.proxy];
      bmp.close();return result;
    });
    assert.deepEqual(info.slice(0,2),[128,96]);
    assert.match(info[2],/dedicated deblur AI/);
    assert.equal(info[3],true,`${name} must use worker-backed WASM for deblur.`);
    assert.equal(errors.length,0,`${name} deblur page errors: ${errors.join('\n')}`);
    console.log(`PASS: ${name} dedicated NAFNet deblur path executed successfully.`);
  }finally{await browser.close();}
}

try{
  await run('firefox',firefox);
  await run('webkit',webkit);
}finally{
  await new Promise(r=>server.close(r));
}
