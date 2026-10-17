// Private local-only QA. Inputs and outputs MUST NOT be committed or uploaded.
// Pass source PDFs as CLI arguments and a scratch output directory in the env.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {chromium} from 'playwright';
import {checkRenderedOutput} from './pdf-compressor-task5-render-check.mjs';
const files=process.argv.slice(2),outputDir=process.env.PDF_COMPRESSOR_PRIVATE_OUTPUT;
if(!files.length||!outputDir)throw Error('Private source paths and scratch output directory required');
const pipeline=process.env.PDF_COMPRESSOR_PRIVATE_PIPELINE==='1';
const modes=(process.env.PDF_COMPRESSOR_PRIVATE_MODES??'lossless,balanced,strong').split(',');
if(modes.some(mode=>!['lossless','balanced','strong'].includes(mode)))throw Error('Unsupported private QA mode');
const repository=resolve(new URL('../',import.meta.url).pathname);
if(resolve(outputDir).startsWith(repository+'/'))throw Error('Private outputs must stay outside the git checkout');
await mkdir(outputDir,{recursive:true});
const sources=await Promise.all(files.map(async path=>({name:basename(path),bytes:new Uint8Array(await readFile(path))})));
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext(),page=await context.newPage(),unexpected=[];
  const origin='http://127.0.0.1:8766';
  const policy="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'";
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.protocol==='blob:'&&url.origin===origin)return route.continue();
    if(url.origin!==origin||route.request().method()!=='GET'){unexpected.push(url.origin);return route.abort();}
    if(url.pathname==='/private-scan-gate')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Private local PDF QA</title>',headers:{'Content-Security-Policy':policy}});
    if(url.pathname.startsWith('/private-input/')){
      const input=sources[Number(url.pathname.split('/').pop())];
      if(!input)return route.abort();
      return route.fulfill({contentType:'application/pdf',body:Buffer.from(input.bytes),headers:{'Content-Security-Policy':policy}});
    }
    const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-security-policy':policy}});
  });
  await page.goto(origin+'/private-scan-gate');const report=[];
  for(let index=0;index<sources.length;index++)for(const mode of modes){
    const started=performance.now();
    const result=await page.evaluate(async({index,mode,pipeline})=>{
      const bytes=new Uint8Array(await (await fetch('/private-input/'+index)).arrayBuffer());
      const worker=new Worker('/tests/pdf-compressor-'+(pipeline?'task6':mode==='lossless'?'task4':'task5')+'-worker.mjs',{type:'module'});
      try{
        const raw=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('private-qa-worker-timeout')),120000);
          worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
          worker.onmessage=e=>{if(typeof e.data?.ok!=='boolean')return;clearTimeout(timer);resolve(e.data);};
          worker.postMessage({bytes,mode},[bytes.buffer]);
        });
        if(!raw.ok)throw Error(raw.code+': '+raw.message);
        return {...raw.result,bytes:Array.from(raw.result.bytes)};
      }finally{worker.terminate();}
    },{index,mode,pipeline});
    const output=new Uint8Array(result.bytes),original=sources[index].bytes;
    assert.ok(output.length<=original.length);
    if(result.status==='original-retained')assert.deepEqual(output,original);
    const renderedRMS=await checkRenderedOutput(original,output,mode);
    const path=resolve(outputDir,`scan-${index+1}-${mode}.pdf`);await writeFile(path,output);
    report.push({scan:index+1,mode,status:result.status,inputBytes:original.length,outputBytes:output.length,
      savedBytes:original.length-output.length,elapsedMs:Math.round(performance.now()-started),renderedRMS,outputPath:path});
  }
  assert.deepEqual(unexpected,[]);
  await writeFile(resolve(outputDir,'private-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
