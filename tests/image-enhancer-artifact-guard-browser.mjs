import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const TYPES = new Map([
  ['.html','text/html; charset=utf-8'], ['.js','text/javascript; charset=utf-8'],
  ['.mjs','text/javascript; charset=utf-8'], ['.css','text/css; charset=utf-8'],
  ['.json','application/json; charset=utf-8'], ['.png','image/png'], ['.wasm','application/wasm']
]);

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
      'cache-control':'no-store'
    });
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');
  }
});
await new Promise(r=>server.listen(4194,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH) launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();

try{
  await page.goto('http://127.0.0.1:4194/images/enhance/',{waitUntil:'domcontentloaded',timeout:90000});
  const result=await page.evaluate(async()=>{
    const mod=await import('/assets/js/image-enhancer-artifact-guard.js?task4=1');
    const width=192,height=128;

    const source=document.createElement('canvas');
    source.width=width; source.height=height;
    const sctx=source.getContext('2d',{willReadFrequently:true,alpha:false});
    const grad=sctx.createLinearGradient(0,0,width,height);
    grad.addColorStop(0,'rgb(54,62,74)');
    grad.addColorStop(1,'rgb(168,154,136)');
    sctx.fillStyle=grad;
    sctx.fillRect(0,0,width,height);

    for(let x=100;x<188;x+=8){
      sctx.fillStyle=((x/8)&1)?'rgb(58,62,68)':'rgb(176,168,152)';
      sctx.fillRect(x,10,4,108);
    }

    sctx.fillStyle='rgb(151,116,96)';
    sctx.beginPath();
    sctx.ellipse(52,58,29,37,0,0,Math.PI*2);
    sctx.fill();
    sctx.fillStyle='rgb(52,41,38)';
    sctx.fillRect(39,51,6,3);
    sctx.fillRect(59,51,6,3);
    sctx.fillRect(48,71,10,3);

    const safe=document.createElement('canvas');
    safe.width=width; safe.height=height;
    const safeCtx=safe.getContext('2d',{alpha:false});
    safeCtx.filter='contrast(1.03) saturate(1.02)';
    safeCtx.drawImage(source,0,0);
    safeCtx.filter='none';

    const unsafe=document.createElement('canvas');
    unsafe.width=width; unsafe.height=height;
    const uctx=unsafe.getContext('2d',{willReadFrequently:true,alpha:false});
    uctx.drawImage(source,0,0);
    let img=uctx.getImageData(0,0,width,height);
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        const p=(y*width+x)*4;
        const inFace=((x-52)/31)**2+((y-58)/39)**2<1;
        if(inFace){
          // Posterized/oil-paint-like face with excessive deviation.
          img.data[p]=Math.min(255,Math.round(img.data[p]/42)*42+32);
          img.data[p+1]=Math.min(255,Math.round(img.data[p+1]/42)*42+22);
          img.data[p+2]=Math.min(255,Math.round(img.data[p+2]/42)*42+18);
        }else if(x>96){
          // Artificial high-frequency ringing/detail inflation.
          const boost=((x+y)&1)?52:-52;
          for(let c=0;c<3;c++) img.data[p+c]=Math.max(0,Math.min(255,img.data[p+c]+boost));
        }
        if(y<8) {
          img.data[p]=255; img.data[p+1]=255; img.data[p+2]=255;
        }
      }
    }
    uctx.putImageData(img,0,0);

    const faces=[{x:23,y:21,width:58,height:74,score:0.99}];
    const safeBefore=mod.analyzeArtifactFidelity(source,safe,faces,'enhance');
    const unsafeBefore=mod.analyzeArtifactFidelity(source,unsafe,faces,'enhance');

    const stages=[];
    const guarded=await mod.applyArtifactFidelityGuard({
      canvas:unsafe,
      sourceImage:source,
      faces,
      mode:'enhance',
      onStage:(stage,alpha)=>stages.push({stage,alpha})
    });

    const after=guarded.analysis;

    const deblurUnsafe=document.createElement('canvas');
    deblurUnsafe.width=width; deblurUnsafe.height=height;
    const dctx=deblurUnsafe.getContext('2d',{alpha:false});
    dctx.drawImage(source,0,0);
    dctx.globalAlpha=0.88;
    dctx.drawImage(guarded.canvas,0,0);
    dctx.globalAlpha=1;
    const deblurAnalysis=mod.analyzeArtifactFidelity(source,deblurUnsafe,faces,'deblur');

    return {
      safeBefore,
      unsafeBefore,
      guarded:{
        applied:guarded.applied,
        stages:guarded.stages,
        analysis:after,
        initialAnalysis:guarded.initialAnalysis
      },
      stages,
      deblurAnalysis
    };
  });

  console.log('TASK4-DIAGNOSTIC', JSON.stringify(result));

  assert.equal(result.safeBefore.safe,true,
    `small photographic correction should pass fidelity guard: ${JSON.stringify(result.safeBefore)}`);
  assert.equal(result.unsafeBefore.safe,false,
    'synthetic face/texture artifact fixture must be rejected');
  assert.ok(result.unsafeBefore.risk>=0.58,
    `unsafe fixture risk unexpectedly low: ${result.unsafeBefore.risk}`);
  assert.equal(result.guarded.applied,true,'progressive recovery did not activate');
  assert.ok(result.guarded.stages>=1 && result.guarded.stages<=6,
    `unexpected recovery stage count: ${result.guarded.stages}`);
  assert.ok(result.guarded.analysis.risk < result.unsafeBefore.risk - 0.10,
    `progressive recovery did not materially reduce risk: before=${result.unsafeBefore.risk} after=${result.guarded.analysis.risk}`);
  assert.ok(result.guarded.analysis.faceMae < result.unsafeBefore.faceMae,
    `face fidelity did not improve: before=${result.unsafeBefore.faceMae} after=${result.guarded.analysis.faceMae}`);
  assert.ok(result.guarded.analysis.textureRatio < result.unsafeBefore.textureRatio,
    `texture inflation did not reduce: before=${result.unsafeBefore.textureRatio} after=${result.guarded.analysis.textureRatio}`);
  assert.ok(result.stages[0]?.alpha<1,'first safety stage must reduce processed contribution');
  assert.ok(Number.isFinite(result.deblurAnalysis.risk),'deblur fidelity analysis must remain finite');

  console.log('Image Enhancer Task 4 artifact/fidelity guard audit passed.');
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
