import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { BASELINE, validateManifest, validateFiles, datasetLock, checkLock, instrument, fixturePath, sha256 } from './core.mjs';
const ROOT = process.cwd();
const HERE = new URL('.', import.meta.url);
const args = process.argv.slice(2), command = args[0] || 'audit';
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
const manifest = JSON.parse(await readFile(arg('--manifest',new URL('manifest.json',HERE)),'utf8'));
const contract = await readFile(new URL('CONTRACT.md',HERE),'utf8');
const validation = validateManifest(manifest);
if (command === 'audit') {
  console.log(JSON.stringify(validation,null,2)); process.exit(validation.ready ? 0 : 2);
}
if (!['lock','run','selftest'].includes(command)) throw new Error('Use audit, lock, run or selftest');
const selftest = command === 'selftest';
const fixtureRoot = arg('--fixtures',process.env.ENHANCER_PRIVATE_FIXTURES);
const lockPath = arg('--lock',fixtureRoot ? resolve(fixtureRoot,'dataset.lock.json') : undefined);
if (!selftest) {
  if (!validation.ready) throw new Error('Dataset not ready: '+[...validation.errors,...validation.blockers].join('; '));
  if (!fixtureRoot || !lockPath) throw new Error('Private fixture directory and lock path required');
  await validateFiles(manifest,fixtureRoot);
  if (command==='lock') {
    await writeFile(lockPath,JSON.stringify(datasetLock(manifest,contract),null,2),{flag:'wx',mode:0o600});
    console.log('Dataset and acceptance contract locked'); process.exit(0);
  }
  checkLock(manifest,contract,JSON.parse(await readFile(lockPath,'utf8')));
}
const output = resolve(arg('--out','../enhancer-private-benchmark-output'));
await mkdir(output,{recursive:true,mode:0o700});
const realOutput = await realpath(output), realRoot = await realpath(ROOT);
if(realOutput===realRoot || realOutput.startsWith(realRoot+sep)) throw new Error('Private benchmark output must be outside the repository');
const source = await readFile(resolve(ROOT,'assets/js/image-enhancer.js'),'utf8');
const sourceHash = sha256(source);
const expected = execFileSync('git',['show',BASELINE+':assets/js/image-enhancer.js']);
if(sha256(expected)!==sourceHash) throw new Error('Baseline module drift: this Task 1 runner must capture PR #117 unchanged');
const transformed = instrument(source); // Throws on incomplete capture coverage.
const modelManifest = JSON.parse(await readFile(resolve(ROOT,'assets/models/image-enhancer/manifest.json'),'utf8'));
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server = createServer(async(req,res)=>{
  try {
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path.includes('..') || path.split('/').some(x=>x.startsWith('.')) || path.startsWith('/tests/')) throw new Error('private path');
    const file=await realpath(resolve(ROOT,'.'+path+(path.endsWith('/')?'index.html':'')));
    if(!file.startsWith(realRoot+sep)) throw new Error('outside root');
    const body=path==='/assets/js/image-enhancer.js'?transformed:await readFile(file);
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);
  } catch { res.writeHead(404);res.end(); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const localOrigin=`http://127.0.0.1:${server.address().port}`;
let browser;
const runs=[];
let failure=null;
try {
  const { chromium }=await import('playwright');
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage();
  // User images remain in the browser; no remote POST/PUT/upload is permitted.
  await page.route('**/*',route=>{
    const req=route.request(), u=new URL(req.url());
    const allowed=u.origin===localOrigin || (['cdn.jsdelivr.net','huggingface.co'].includes(u.hostname) || /\.(huggingface\.co|hf\.co|xethub\.hf\.co)$/.test(u.hostname)) && req.method()==='GET';
    return allowed?route.continue():route.abort('blockedbyclient');
  });
  await page.goto(localOrigin+'/images/enhance/',{waitUntil:'networkidle',timeout:90000});
  await page.evaluate(()=>{
    window.__captures=[];window.__captureEnabled=true;
    window.__enhancerBenchmark=(stage,image,metadata={})=>{
      if(!window.__captureEnabled)return;
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);
      window.__captures.push({stage,width:c.width,height:c.height,atMs:performance.now(),metadata,png:c.toDataURL('image/png')});
      c.width=c.height=0;
    };
  });
  const synthetic = selftest ? await page.evaluate(()=>{
    const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');
    const g=ctx.createLinearGradient(0,0,128,128);g.addColorStop(0,'#806050');g.addColorStop(1,'#a0c0e0');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    ctx.fillStyle='#23384a';for(let x=10;x<120;x+=15)ctx.fillRect(x,30,5,60);
    return c.toDataURL('image/png');
  }):null;
  const cases=selftest?[{id:'harness-only',split:'development',tags:[],cohort:'clean'}]:manifest.sources;
  for(const item of cases) {
    const input=selftest?Buffer.from(synthetic.split(',')[1],'base64'):await readFile(await fixturePath(fixtureRoot,item.path));
    const referenceUrl=item.reference ? 'data:application/octet-stream;base64,'+(await readFile(await fixturePath(fixtureRoot,item.reference.path))).toString('base64') : null;
    const records=[];
    for(let repeat=0;repeat<(selftest?3:2);repeat++) {
      await page.evaluate(enabled=>{window.__captures=[];window.__captureEnabled=enabled;},repeat!==2);
      await page.locator('input[type=file]').setInputFiles({name:item.id+extname(item.path||'fixture.png'),mimeType:item.mime||'image/png',buffer:input});
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('File ready.') && document.querySelector('#enhancer-source-info')?.textContent.includes('Analysis:'),{},{timeout:30000});
      const before=await page.locator('#downloads a[download]').last().getAttribute('href').catch(()=>null);
      await page.locator('#enhancer-mode-enhance').click();
      await page.locator('#enhancer-content').selectOption(selftest?'high-fidelity':'auto');
      await page.locator('#enhancer-restoration').selectOption('auto');
      await page.locator('#enhancer-sharpen').selectOption('auto');
      const start=Date.now();await page.locator('#enhancer-run').click();
      await page.waitForFunction(before=>{const link=[...document.querySelectorAll('#downloads a[download]')].at(-1);return link && link.href!==before && !document.querySelector('#enhancer-run')?.disabled;},before,{timeout:180000});
      const data=await page.evaluate(async referenceUrl=>{
        const link=[...document.querySelectorAll('#downloads a[download]')].at(-1);
        const b=await(await fetch(link.href)).blob(),im=await createImageBitmap(b),c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);im.close();
        let referenceMetrics=null;
        if(referenceUrl){
          const ref=await createImageBitmap(await(await fetch(referenceUrl)).blob());
          if(ref.width!==c.width || ref.height!==c.height) throw new Error('Ground-truth dimensions differ; no silent metric resizing');
          const rc=document.createElement('canvas');rc.width=ref.width;rc.height=ref.height;rc.getContext('2d').drawImage(ref,0,0);ref.close();
          const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data, b=rc.getContext('2d').getImageData(0,0,c.width,c.height).data;
          let abs=0,sq=0,n=0;for(let i=0;i<a.length;i+=4)for(let ch=0;ch<3;ch++){const d=a[i+ch]-b[i+ch];abs+=Math.abs(d);sq+=d*d;n++;}
          referenceMetrics={rgbMae:abs/n,rgbRmse:Math.sqrt(sq/n),pixels:c.width*c.height};
        }
        return {status:document.querySelector('#status').textContent,stages:window.__captures,png:c.toDataURL('image/png'),width:c.width,height:c.height,referenceMetrics};
      },referenceUrl);
      const pixels=Buffer.from(data.png.split(',')[1],'base64');
      const dir=resolve(output,item.id,String(repeat));await mkdir(dir,{recursive:true,mode:0o700});
      await writeFile(resolve(dir,'output.png'),pixels,{mode:0o600});
      const captures=[];
      for(const [i,stage] of data.stages.entries()) {
        const bytes=Buffer.from(stage.png.split(',')[1],'base64');const name=String(i).padStart(2,'0')+'-'+stage.stage+'.png';
        await writeFile(resolve(dir,name),bytes,{mode:0o600});const {png,...metadata}=stage;captures.push({...metadata,file:name,sha256:sha256(bytes)});
      }
      const record={id:item.id,split:item.split,repeat,status:data.status,width:data.width,height:data.height,referenceMetrics:data.referenceMetrics,elapsedMs:Date.now()-start,outputSha256:sha256(pixels),captures};
      records.push(record);runs.push(record);
      // Model execution is evidence, not inferred from a completed download.
      if(!data.status.includes('background AI') && !data.status.includes('dedicated deblur AI')) throw new Error(`${item.id}: AI fallback is a benchmark failure, not a restoration success`);
      if(repeat<2 && !captures.some(s=>s.stage==='model-output')) throw new Error('Missing model-stage capture');
      if(repeat<2 && !captures.some(s=>s.stage==='final-guard')) throw new Error('Missing final-guard capture');
    }
    if(new Set(records.map(r=>r.outputSha256)).size!==1) throw new Error(`${item.id}: repeatability or instrumentation parity failed`);
  }
  console.log(selftest?'PASS: repeated real-AI harness captures and instrumented/uninstrumented output parity. Synthetic fixture ONLY; no photographic quality claim.':'PASS: two repeatable baseline captures per admitted photograph. Manual review still required.');
} catch(error) {
  failure={name:error.name,message:error.message};
  throw error;
} finally {
  const summary={version:1,baseline:BASELINE,sourceHash,modelManifest,browser:browser?browser.version():null,selftest,runs,failure,acceptance:'NOT_EVALUATED',note:'Capture overhead is included in elapsedMs; do not use instrumented timings as device latency budgets.'};
  await writeFile(resolve(output,'results.json'),JSON.stringify(summary,null,2),{mode:0o600});
  const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const sections=runs.filter(r=>r.repeat===0).map(r=>`<section><h2>${esc(r.id)}</h2><p>${esc(r.status)}</p><div class="row">${r.captures.map(c=>`<figure><img width="384" src="${esc(r.id+'/0/'+c.file)}" alt="${esc(c.stage)}"><figcaption>${esc(c.stage)} — ${c.width} × ${c.height}</figcaption></figure>`).join('')}</div></section>`).join('');
  await writeFile(resolve(output,'comparison.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Private enhancer baseline</title><style>body{font:16px system-ui;margin:24px}.row{display:flex;flex-wrap:wrap}figure{margin:8px}img{height:auto;max-width:100%}</style><h1>Matched-width stage comparison</h1><p>Private evaluation. Same display width, preserved aspect ratio. Open PNGs for native 100% inspection. Blank/missing stages mean not executed, not passed. Human review pending.</p>${sections}</html>`,{mode:0o600});
  await browser?.close();await new Promise(r=>server.close(r));
}
