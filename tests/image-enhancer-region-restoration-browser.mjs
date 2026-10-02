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

const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    let filePath = resolve(ROOT,'.'+pathname);
    if (!(filePath === ROOT || filePath.startsWith(ROOT+sep))) throw new Error('bad path');
    let info; try { info = await stat(filePath); } catch { info = null; }
    if (info?.isDirectory()) filePath = resolve(filePath,'index.html');
    const body = await readFile(filePath);
    res.writeHead(200,{
      'content-type': TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff'
    });
    res.end(body);
  } catch {
    res.writeHead(404,{'content-type':'text/plain'});
    res.end('Not found');
  }
});
await new Promise(r => server.listen(4193,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH) launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();

try {
  await page.goto('http://127.0.0.1:4193/images/enhance/',{waitUntil:'domcontentloaded',timeout:90000});

  const result = await page.evaluate(async () => {
    const mod = await import('/assets/js/image-enhancer-region-restoration.js?task3=1');
    const width = 192;
    const height = 128;

    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sctx = source.getContext('2d',{willReadFrequently:true,alpha:false});
    sctx.fillStyle='rgb(70,70,70)';
    sctx.fillRect(0,0,width,height);

    // High-detail non-face region on the right.
    for(let x=104;x<188;x+=6){
      sctx.fillStyle=((x/6)&1)?'rgb(40,40,40)':'rgb(150,150,150)';
      sctx.fillRect(x,8,3,112);
    }

    // Smooth portrait-like region on the left.
    sctx.fillStyle='rgb(126,101,88)';
    sctx.beginPath();
    sctx.ellipse(52,60,28,36,0,0,Math.PI*2);
    sctx.fill();

    const processed=document.createElement('canvas');
    processed.width=width;
    processed.height=height;
    const pctx=processed.getContext('2d',{willReadFrequently:true,alpha:false});
    pctx.drawImage(source,0,0);

    // Simulate a strong AI reconstruction: beneficial on detail, excessive on face.
    pctx.fillStyle='rgb(195,160,145)';
    pctx.beginPath();
    pctx.ellipse(52,60,28,36,0,0,Math.PI*2);
    pctx.fill();
    for(let x=104;x<188;x+=6){
      pctx.fillStyle=((x/6)&1)?'rgb(20,20,20)':'rgb(190,190,190)';
      pctx.fillRect(x,8,3,112);
    }

    const analysis = {
      blurScore:0.8,
      noise:0.18,
      jpegArtifacts:0.15,
      lowResolution:false,
      falseResolution:false,
      diagnosis:{
        confidence:{
          blur:0.86,
          noise:0.18,
          compression:0.15,
          lowResolution:0.08,
          falseResolution:0,
          underexposure:0.55,
          overexposure:0,
          lowContrast:0.35,
          badLighting:0.45
        }
      }
    };
    const faces=[{x:22,y:24,width:60,height:72,score:0.99}];

    const sourceBitmap=await createImageBitmap(source);
    const processedBitmap=await createImageBitmap(processed);
    const worker=new Worker('/assets/js/image-enhancer-processing-worker.js',{type:'module'});

    const outputBitmap=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('region worker timeout')),30000);
      worker.onmessage=event=>{
        const msg=event.data||{};
        if(msg.id!==1)return;
        clearTimeout(timer);
        msg.ok?resolve(msg.bitmap):reject(new Error(msg.error||'worker failed'));
      };
      worker.onerror=event=>{
        clearTimeout(timer);
        reject(new Error(event.message||'worker error'));
      };
      worker.postMessage({
        id:1,
        type:'region-aware-restore',
        sourceBitmap,
        processedBitmap,
        analysis,
        faces,
        mode:'enhance'
      },[sourceBitmap,processedBitmap]);
    });
    worker.terminate();

    const out=document.createElement('canvas');
    out.width=width;
    out.height=height;
    const octx=out.getContext('2d',{willReadFrequently:true,alpha:false});
    octx.drawImage(outputBitmap,0,0);
    outputBitmap.close();

    const get=(ctx,x,y)=>Array.from(ctx.getImageData(x,y,1,1).data.slice(0,3));
    const mae=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/3;

    const faceSource=get(sctx,52,60);
    const faceProcessed=get(pctx,52,60);
    const faceOutput=get(octx,52,60);
    const detailSource=get(sctx,108,60);
    const detailProcessed=get(pctx,108,60);
    const detailOutput=get(octx,108,60);
    const shadowSource=get(sctx,10,110);
    const shadowOutput=get(octx,10,110);

    const plan=mod.resolveRegionRestorationPlan(analysis,'enhance');
    const faceWeight=mod.resolveRegionProcessedWeight({
      sourceEdge:1,
      sourceResidual:0.5,
      deviation:60,
      faceLimit:0.62,
      plan
    });
    const detailWeight=mod.resolveRegionProcessedWeight({
      sourceEdge:24,
      sourceResidual:16,
      deviation:30,
      faceLimit:1,
      plan
    });
    const edgeBoost=mod.resolveRegionEdgeBoost({
      sourceEdge:22,
      resultEdge:10,
      faceLimit:1,
      plan
    });
    const faceEdgeBoost=mod.resolveRegionEdgeBoost({
      sourceEdge:22,
      resultEdge:10,
      faceLimit:0.62,
      plan
    });

    return {
      plan,
      faceWeight,
      detailWeight,
      edgeBoost,
      faceEdgeBoost,
      faceSource,
      faceProcessed,
      faceOutput,
      detailSource,
      detailProcessed,
      detailOutput,
      shadowSource,
      shadowOutput,
      faceOutputToSource:mae(faceOutput,faceSource),
      faceProcessedToSource:mae(faceProcessed,faceSource),
      detailOutputToProcessed:mae(detailOutput,detailProcessed),
      detailSourceToProcessed:mae(detailSource,detailProcessed)
    };
  });

  assert.equal(result.plan.version,1);
  assert.ok(result.faceWeight <= 0.62 + 1e-9, `face safety ceiling exceeded: ${result.faceWeight}`);
  assert.ok(result.detailWeight > result.faceWeight + 0.18,
    `detail region was not given meaningfully stronger restoration: face=${result.faceWeight} detail=${result.detailWeight}`);
  assert.ok(result.edgeBoost > 0.1, `detail edge boost inactive: ${result.edgeBoost}`);
  assert.equal(result.faceEdgeBoost,0,'face-protected region must not receive extra edge boost');

  assert.ok(result.faceOutputToSource < result.faceProcessedToSource * 0.8,
    `face output was not pulled toward source identity: output=${result.faceOutputToSource} processed=${result.faceProcessedToSource}`);
  assert.ok(result.detailOutputToProcessed < result.detailSourceToProcessed * 0.55,
    `detail region did not preserve strong restoration: output=${result.detailOutputToProcessed} source=${result.detailSourceToProcessed}`);
  assert.ok(result.shadowOutput[0] >= result.shadowSource[0],
    `underexposed shadow was darkened instead of preserved/lifted: ${result.shadowSource[0]} -> ${result.shadowOutput[0]}`);

  console.log('Image Enhancer Task 3 region-aware restoration audit passed.');
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser.close();
  await new Promise(r=>server.close(r));
}
