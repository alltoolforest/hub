import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://staticimgly.com https://huggingface.co https://*.huggingface.co https://*.hf.co https://*.xethub.hf.co blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'";
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'], ['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.css','text/css; charset=utf-8'], ['.svg','image/svg+xml'],
  ['.png','image/png'], ['.jpg','image/jpeg'], ['.jpeg','image/jpeg'], ['.webp','image/webp'], ['.wasm','application/wasm']
]);

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
function encodeRgbaPng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function makeSharp(width, height) {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const vignette = Math.max(0, 1 - Math.hypot(x-width*0.5,y-height*0.48)/(width*0.72));
      const fabric = ((Math.floor(x/5) + Math.floor(y/7)) & 1) ? 22 : -12;
      const stripe = (x > 14 && x < width-12 && y > height*0.56 && y < height*0.83 && (x % 11 < 2 || y % 13 < 2)) ? 45 : 0;
      const face = Math.exp(-(((x-width*.48)/(width*.18))**2 + ((y-height*.34)/(height*.22))**2));
      const eye1 = Math.exp(-(((x-width*.42)/3.2)**2 + ((y-height*.31)/2.0)**2));
      const eye2 = Math.exp(-(((x-width*.54)/3.2)**2 + ((y-height*.31)/2.0)**2));
      const mouth = Math.exp(-(((x-width*.48)/10)**2 + ((y-height*.43)/2.3)**2));
      let r = 52 + x*0.95 + y*0.22 + vignette*24 + fabric + stripe + face*62 - (eye1+eye2)*70 - mouth*28;
      let g = 46 + x*0.56 + y*0.45 + vignette*18 + fabric*.55 + stripe*.45 + face*45 - (eye1+eye2)*62 - mouth*18;
      let b = 58 + x*0.32 + y*0.62 + vignette*16 + fabric*.35 + stripe*.22 + face*34 - (eye1+eye2)*50 - mouth*12;
      out[p] = Math.max(0,Math.min(255,Math.round(r)));
      out[p+1] = Math.max(0,Math.min(255,Math.round(g)));
      out[p+2] = Math.max(0,Math.min(255,Math.round(b)));
      out[p+3] = 255;
    }
  }
  return out;
}
function motionBlur(src, width, height, radius=5) {
  const out = new Uint8Array(src.length);
  for (let y=0;y<height;y++) {
    for (let x=0;x<width;x++) {
      const p=(y*width+x)*4;
      for (let c=0;c<3;c++) {
        let sum=0, weight=0;
        for (let k=-radius;k<=radius;k++) {
          const xx=Math.max(0,Math.min(width-1,x+k));
          const yy=Math.max(0,Math.min(height-1,y+Math.round(k*.35)));
          const w=radius+1-Math.abs(k)*.35;
          sum += src[(yy*width+xx)*4+c]*w;
          weight += w;
        }
        out[p+c]=Math.round(sum/weight);
      }
      out[p+3]=255;
    }
  }
  return out;
}
function mse(a,b) {
  let sum=0, n=0;
  for(let i=0;i<a.length;i+=4) {
    for(let c=0;c<3;c++) {
      const d=a[i+c]-b[i+c];
      sum += d*d; n++;
    }
  }
  return sum/n;
}
function gray(a) {
  const out=new Float64Array(a.length/4);
  for(let i=0,p=0;i<a.length;i+=4,p++) out[p]=a[i]*0.2126+a[i+1]*0.7152+a[i+2]*0.0722;
  return out;
}
function globalSsim(a,b) {
  const x=gray(a), y=gray(b), n=x.length;
  let mx=0,my=0;
  for(let i=0;i<n;i++){mx+=x[i];my+=y[i];}
  mx/=n; my/=n;
  let vx=0,vy=0,cov=0;
  for(let i=0;i<n;i++){const dx=x[i]-mx,dy=y[i]-my;vx+=dx*dx;vy+=dy*dy;cov+=dx*dy;}
  vx/=Math.max(1,n-1); vy/=Math.max(1,n-1); cov/=Math.max(1,n-1);
  const c1=(0.01*255)**2, c2=(0.03*255)**2;
  return ((2*mx*my+c1)*(2*cov+c2))/((mx*mx+my*my+c1)*(vx+vy+c2));
}
function gradientVector(a,width,height) {
  const g=gray(a), out=[];
  for(let y=1;y<height-1;y++) for(let x=1;x<width-1;x++) {
    const i=y*width+x;
    out.push(g[i+1]-g[i-1], g[i+width]-g[i-width]);
  }
  return out;
}
function cosine(a,b) {
  let dot=0,aa=0,bb=0;
  const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
  return dot/(Math.sqrt(aa*bb)+1e-9);
}

const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let filePath=resolve(ROOT,'.'+pathname);
    if(!(filePath===ROOT||filePath.startsWith(ROOT+sep))) throw new Error('bad path');
    let info; try{info=await stat(filePath);}catch{info=null;}
    if(info?.isDirectory()) filePath=resolve(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{
      'content-type':TYPES.get(extname(filePath).toLowerCase())||'application/octet-stream',
      'content-security-policy':CSP,
      'x-content-type-options':'nosniff',
      'cache-control':'no-store'
    });
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');
  }
});
await new Promise(r=>server.listen(4188,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH) launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();
const diagnostics=[];
page.on('console',m=>{if(['error','warning'].includes(m.type())) diagnostics.push(`${m.type()}: ${m.text()}`);});
page.on('pageerror',e=>diagnostics.push(`pageerror: ${e.message}`));
page.on('requestfailed',r=>diagnostics.push(`requestfailed: ${r.url()} :: ${r.failure()?.errorText||'unknown'}`));

try{
  await page.goto('http://127.0.0.1:4188/images/enhance/',{waitUntil:'networkidle',timeout:90000});

  const fixture=await page.evaluate(async()=>{
    const response=await fetch('/tests/fixtures/nafnet-natural-sharp.png',{cache:'no-store'});
    if(!response.ok) throw new Error(`Natural deblur fixture failed to load (${response.status}).`);
    const blob=await response.blob();
    const bitmap=await createImageBitmap(blob);
    const width=192;
    const height=128;

    const sharpCanvas=document.createElement('canvas');
    sharpCanvas.width=width;
    sharpCanvas.height=height;
    const sharpCtx=sharpCanvas.getContext('2d',{willReadFrequently:true,alpha:false});
    const sourceRatio=bitmap.width/bitmap.height;
    const targetRatio=width/height;
    let sx=0,sy=0,sw=bitmap.width,sh=bitmap.height;
    if(sourceRatio>targetRatio){
      sw=Math.round(bitmap.height*targetRatio);
      sx=Math.round((bitmap.width-sw)/2);
    }else{
      sh=Math.round(bitmap.width/targetRatio);
      sy=Math.round((bitmap.height-sh)/2);
    }
    sharpCtx.imageSmoothingEnabled=true;
    sharpCtx.imageSmoothingQuality='high';
    sharpCtx.drawImage(bitmap,sx,sy,sw,sh,0,0,width,height);
    bitmap.close();
    const sharp=sharpCtx.getImageData(0,0,width,height);
    const src=sharp.data;

    const blurred=new Uint8ClampedArray(src.length);
    const radius=5;
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const p=(y*width+x)*4;
        for(let channel=0;channel<3;channel++){
          let sum=0,weight=0;
          for(let k=-radius;k<=radius;k++){
            const xx=Math.max(0,Math.min(width-1,x+k));
            const yy=Math.max(0,Math.min(height-1,y+Math.round(k*0.35)));
            const w=radius+1-Math.abs(k)*0.35;
            sum+=src[(yy*width+xx)*4+channel]*w;
            weight+=w;
          }
          blurred[p+channel]=Math.round(sum/weight);
        }
        blurred[p+3]=255;
      }
    }

    const blurCanvas=document.createElement('canvas');
    blurCanvas.width=width;
    blurCanvas.height=height;
    const blurCtx=blurCanvas.getContext('2d',{alpha:false});
    const blurImage=blurCtx.createImageData(width,height);
    blurImage.data.set(blurred);
    blurCtx.putImageData(blurImage,0,0);
    const blurBlob=await new Promise((resolve,reject)=>{
      blurCanvas.toBlob(value=>value?resolve(value):reject(new Error('Could not encode blur fixture.')),'image/png');
    });
    window.__deblurDiagnosticBlob=blurBlob;

    return {
      width,
      height,
      sharp:Array.from(src),
      blurred:Array.from(blurred),
      png:Array.from(new Uint8Array(await blurBlob.arrayBuffer()))
    };
  });

  const width=fixture.width;
  const height=fixture.height;
  const sharp=Uint8Array.from(fixture.sharp);
  const blurred=Uint8Array.from(fixture.blurred);
  const blurredMse=mse(blurred,sharp);

  await page.locator('input[type=file]').setInputFiles({
    name:'known-natural-motion-blur.png',
    mimeType:'image/png',
    buffer:Buffer.from(fixture.png)
  });
  await page.waitForFunction(()=>document.querySelector('#enhancer-source-info')?.textContent?.includes('Analysis:'));
  const summary=(await page.locator('#enhancer-source-info').textContent())||'';
  const detector=await page.evaluate(async()=>{
    const input=window.__deblurDiagnosticBlob;
    if(!input) throw new Error('Deblur detector diagnostic blob is missing.');
    const bitmap=await createImageBitmap(input);
    try{
      const mod=await import('/assets/js/image-enhancer-restoration.js');
      const analysis=await mod.analyzeSourceImage(bitmap,input);
      return {
        lapVariance:analysis.lapVariance,
        gradient:analysis.gradient,
        noise:analysis.noise,
        perceptualBlur:analysis.perceptualBlur,
        blurScore:analysis.blurScore,
        softness:analysis.softness,
        lowDetail:analysis.lowDetail,
        likelyBlurred:analysis.likelyBlurred
      };
    }finally{
      bitmap.close();
    }
  });
  console.log(`DIAGNOSTIC blur-detector ${JSON.stringify(detector)}`);
  assert.match(summary,/likely motion \/ defocus blur/, `Blur detector did not route the known blurred fixture: ${summary}; metrics=${JSON.stringify(detector)}`);

  await page.locator('#enhancer-mode-enhance').click();
  await page.locator('#enhancer-content').selectOption('low-resolution');
  await page.locator('#enhancer-restoration').selectOption('auto');
  await page.locator('#enhancer-sharpen').selectOption('auto');

  await page.evaluate(()=>{
    window.__deblurHeartbeat=0;
    window.__deblurTimer=setInterval(()=>{window.__deblurHeartbeat++;},50);
  });
  await page.locator('#enhancer-run').click();
  try {
    await page.waitForFunction(()=>{
      const status=document.querySelector('#status')?.textContent||'';
      return !!document.querySelector('#downloads a[download]') && /dedicated deblur AI/.test(status);
    },null,{timeout:120000});
  } catch (error) {
    const status=(await page.locator('#status').textContent().catch(()=>''))||'';
    console.error(`DIAGNOSTIC dedicated-deblur timeout status=${status}`);
    console.error(diagnostics.join('\n'));
    throw error;
  }

  const result=await page.evaluate(async()=>{
    const link=[...document.querySelectorAll('#downloads a[download]')].at(-1);
    const blob=await(await fetch(link.href)).blob();
    const bmp=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');
    canvas.width=bmp.width; canvas.height=bmp.height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(bmp,0,0);
    const pixels=Array.from(ctx.getImageData(0,0,bmp.width,bmp.height).data);
    bmp.close();
    clearInterval(window.__deblurTimer);
    return {
      width:canvas.width,
      height:canvas.height,
      pixels,
      heartbeat:window.__deblurHeartbeat,
      status:document.querySelector('#status')?.textContent||''
    };
  });
  const output=Uint8Array.from(result.pixels);
  const outputMse=mse(output,sharp);
  const improvement=(blurredMse-outputMse)/blurredMse;
  const blurredSsim=globalSsim(blurred,sharp);
  const outputSsim=globalSsim(output,sharp);
  const blurredGradCorr=cosine(gradientVector(blurred,width,height),gradientVector(sharp,width,height));
  const outputGradCorr=cosine(gradientVector(output,width,height),gradientVector(sharp,width,height));
  const reblurred=motionBlur(output,width,height,5);
  const reblurMse=mse(reblurred,blurred);

  console.log(`DIAGNOSTIC dedicated-deblur blurredMSE=${blurredMse.toFixed(3)} outputMSE=${outputMse.toFixed(3)} improvement=${(improvement*100).toFixed(2)}% blurredSSIM=${blurredSsim.toFixed(5)} outputSSIM=${outputSsim.toFixed(5)} blurredGradCorr=${blurredGradCorr.toFixed(5)} outputGradCorr=${outputGradCorr.toFixed(5)} reblurMSE=${reblurMse.toFixed(3)} heartbeat=${result.heartbeat}`);
  assert.deepEqual([result.width,result.height],[width,height]);
  assert.match(result.status,/dedicated deblur AI/);
  assert.ok(result.heartbeat>=8,`Dedicated deblur must keep the page responsive; heartbeat=${result.heartbeat}`);
  assert.ok(outputMse < blurredMse,`Dedicated deblur output must be closer to known sharp ground truth: blurred=${blurredMse}, output=${outputMse}`);
  assert.ok(improvement >= 0.02,`Dedicated deblur must improve ground-truth reconstruction by at least 2%: ${(improvement*100).toFixed(2)}%`);
  assert.equal(diagnostics.filter(x=>x.startsWith('pageerror')).length,0,`Deblur page errors:\n${diagnostics.join('\n')}`);
  console.log('PASS: blur detection triggered dedicated NAFNet and improved known sharp-ground-truth reconstruction without blocking the page.');
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
