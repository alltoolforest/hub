// Experiment-only: external pinned model files, no production imports or changes.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2];if(!root)throw Error('External experiment folder required');
const worker=`importScripts('/ort/ort.webgpu.min.js');onmessage=async({data})=>{let session;try{ort.env.wasm.wasmPaths="/ort/";ort.env.wasm.numThreads=data.threads;ort.env.wasm.proxy=false;const before=performance.now();session=await ort.InferenceSession.create('/dncnn3.onnx',{executionProviders:[data.provider]});const loadMs=performance.now()-before;const values=new Float32Array(await(await fetch('/input.f32')).arrayBuffer()),expected=new Float32Array(await(await fetch('/expected.f32')).arrayBuffer());const input=new ort.Tensor('float32',values,[1,1,296,296]);const times=[];let maxError=0;for(let i=0;i<2;i++){const start=performance.now();const out=await session.run({input});const actual=await out.output.getData();times.push(performance.now()-start);for(let j=0;j<expected.length;j++)maxError=Math.max(maxError,Math.abs(actual[j]-expected[j]));out.output.dispose();}input.dispose();postMessage({provider:data.provider,threads:data.threads,loadMs,times,maxError});}catch(e){postMessage({error:String(e),provider:data.provider,threads:data.threads});}finally{await session?.release();}};`;
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated cleanup runtime</title>');return;}
 if(path==='/worker.js'){res.setHeader('Content-Type','text/javascript');res.end(worker);return;}
 let file;
 if(['/dncnn3.onnx','/input.f32','/expected.f32'].includes(path))file=resolve(root,path.slice(1));
 else if(/^\/ort\/[\w.-]+$/.test(path))file=resolve(root,'npm/node_modules/onnxruntime-web/dist',path.slice(5));
 else throw Error('not allowed');
 res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const result=await page.evaluate(async()=>{
  const adapter=await navigator.gpu?.requestAdapter();const info=adapter?.info;
  const gpu={available:!!adapter,info:info?{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description}:null,fallback:adapter?.isFallbackAdapter??null};
  // Never present software emulation as hardware acceleration evidence.
  const usable=adapter&&gpu.fallback!==true&&!/swiftshader|llvmpipe|software/i.test(JSON.stringify(gpu.info));
  const configs=[{provider:'wasm',threads:1},{provider:'wasm',threads:2}];if(usable)configs.push({provider:'webgpu',threads:1});
  const runs=[];
  for(const config of configs){runs.push(await new Promise(resolve=>{const worker=new Worker('/worker.js');let last=performance.now(),gap=0,ticks=0;const timer=setInterval(()=>{const now=performance.now();gap=Math.max(gap,now-last);last=now;ticks++;},25);const timeout=setTimeout(()=>finish({error:'120s trial timeout'}),120000);const finish=data=>{clearInterval(timer);clearTimeout(timeout);worker.terminate();resolve({...data,ticks,maxHeartbeatGap:gap});};worker.onmessage=e=>finish(e.data);worker.onerror=e=>finish({error:e.message});worker.postMessage(config);}));}
  return {crossOriginIsolated,gpu,runs};
 });
 await writeFile(resolve(root,'browser-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 for(const run of result.runs){assert.ok(!run.error,run.error);assert.ok(run.maxError<1e-4);}
}finally{await browser?.close();await new Promise(r=>server.close(r));}
