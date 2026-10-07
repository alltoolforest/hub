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
await new Promise(r=>server.listen(4196,'127.0.0.1',r));

const launchOptions={headless:true};
if(process.env.CHROME_PATH) launchOptions.executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch(launchOptions);
const page=await browser.newPage();

try {
  await page.goto('http://127.0.0.1:4196/images/enhance/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const { applyFaceIdentityGuard, faceSafetyAiLimitAt, createFaceRetentionMasks, faceRetentionLimitAt } = await import('/assets/js/image-enhancer-face-safety.js');
    const { applyArtifactFidelityGuard } = await import('/assets/js/image-enhancer-artifact-guard.js');
    const width = 300, height = 180; // Cross the worker's 256px tile boundary.
    const faces = [{ x: 180, y: 25, width: 100, height: 120, score: .99 }];
    const analysis = { likelyBlurred: true, blurScore: .8, diagnosis: { confidence: { blur: .9 } } };
    const make = value => {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const ctx = c.getContext('2d'); ctx.fillStyle = `rgb(${value},${value},${value})`; ctx.fillRect(0,0,width,height); return c;
    };
    const source = make(100), candidate = make(120);
    const worker = new Worker('/assets/js/image-enhancer-processing-worker.js', { type: 'module' });
    try {
      const sourceBitmap = await createImageBitmap(source), deblurBitmap = await createImageBitmap(candidate);
      const reply = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('fusion worker timed out')), 15000);
        worker.onmessage = e => { clearTimeout(timeout); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
        worker.onerror = e => { clearTimeout(timeout); reject(new Error(e.message)); };
        worker.postMessage({ id: 1, type: 'adaptive-deblur-blend', sourceBitmap, deblurBitmap, analysis, faces }, [sourceBitmap, deblurBitmap]);
      });
      const fused = make(0); fused.getContext('2d').drawImage(reply.bitmap,0,0); reply.bitmap.close();
      const legacy = make(0); legacy.getContext('2d').drawImage(fused,0,0);
      applyFaceIdentityGuard(legacy, source, faces, analysis, 'deblur');
      const pixels = fused.getContext('2d').getImageData(0,0,width,height).data;
      const oldPixels = legacy.getContext('2d').getImageData(0,0,width,height).data;
      const masks = createFaceRetentionMasks(faces,width,height,analysis);
      let violations = 0, regained = 0;
      for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
        const value = pixels[(y*width+x)*4];
        const ceiling = Math.min(faceSafetyAiLimitAt(x,y,faces),faceRetentionLimitAt(x,y,masks));
        if (value < 100 || value > Math.round(100+20*ceiling)) violations++;
        if (value > oldPixels[(y*width+x)*4]) regained++;
      }
      const mildSource = await createImageBitmap(source), mildCandidate = await createImageBitmap(candidate);
      const mildReply = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('mild fusion timed out')), 15000);
        worker.onmessage = e => { clearTimeout(timeout); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
        worker.postMessage({id:2,type:'adaptive-deblur-blend',sourceBitmap:mildSource,deblurBitmap:mildCandidate,analysis,faces,strength:0.6},[mildSource,mildCandidate]);
      });
      const mild = make(0); mild.getContext('2d').drawImage(mildReply.bitmap,0,0); mildReply.bitmap.close();
      const mildPixels = mild.getContext('2d').getImageData(0,0,width,height).data;
      let mildViolations = 0;
      for (let i=0;i<pixels.length;i+=4) {
        if (mildPixels[i] < 100 || mildPixels[i] > pixels[i] || Math.abs((mildPixels[i]-100) - (pixels[i]-100)*0.6) > 1) mildViolations++;
      }
      const guarded = await applyArtifactFidelityGuard({ canvas: fused, sourceImage: source, faces, mode: 'deblur', degradation: analysis });
      return { violations, mildViolations, regained, width: guarded.canvas.width, height: guarded.canvas.height, safe: guarded.analysis.safe };
    } finally { worker.terminate(); }
  });
  assert.equal(result.mildViolations, 0, 'Enhance must reduce reconstruction contribution without violating face ceilings');
  assert.equal(result.violations, 0, 'fusion exceeded a pre-existing face ceiling');
  assert.ok(result.regained > 100, 'the duplicate face blend is still erasing candidate detail');
  assert.equal(result.width, 300); assert.equal(result.height, 180);
  assert.equal(result.safe, true, 'final guard remains mandatory');
  console.log('Single-pass face fusion worker passed:', JSON.stringify(result));
} finally {
  await browser.close();
  await new Promise(r => server.close(r));
}
