// Local, offline Enhance worker smoke. Optional user fixture stays outside git.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('assets/js'), fixture=process.argv[2];
const server=createServer(async(req,res)=>{
 try {
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Enhance worker QA</title>');return;}
  if(path==='/fixture'&&fixture){res.end(await readFile(fixture));return;}
  const file=resolve(root,'.'+path);
  if(!file.startsWith(root+sep)||!file.endsWith('.js'))throw Error('Invalid path');
  res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({headless:true});
 for(const mobile of [false,true]){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async({fixture,mobile})=>{
   const {enhancePhotograph}=await import('/image-enhancer-photo-engine.js');
   const results=[];
   for(const kind of fixture?['fixture','12mp']:['12mp']){
    let source;
    if(kind==='fixture')source=await createImageBitmap(await(await fetch('/fixture')).blob());
    else {
     const c=new OffscreenCanvas(4000,3000),cx=c.getContext('2d'),gradient=cx.createLinearGradient(0,0,4000,3000);
     gradient.addColorStop(0,'#191015');gradient.addColorStop(.5,'#946257');gradient.addColorStop(1,'#e7d1bd');cx.fillStyle=gradient;cx.fillRect(0,0,4000,3000);source=await createImageBitmap(c);
    }
    let ticks=0,last=performance.now(),gap=0;
    const timer=setInterval(()=>{const now=performance.now();gap=Math.max(gap,now-last);last=now;ticks++;},25);
    const start=performance.now();
    const out=await enhancePhotograph(source,{content:'portrait',strength:'balanced',sourceMime:kind==='fixture'?'image/jpeg':'image/png',faces:[{x:0,y:0,width:source.width,height:source.height}]},new AbortController().signal);
    const decoded=await createImageBitmap(out.blob);
    clearInterval(timer);
    results.push({kind,mobile,width:out.width,height:out.height,valid:decoded.width===source.width&&decoded.height===source.height,ms:Math.round(performance.now()-start),bytes:out.blob.size,ticks,maxGap:Math.round(gap)});
    source.close();decoded.close();
   }
   return results;
  },{fixture:!!fixture,mobile});
  for(const r of result){assert.ok(r.valid);assert.ok(r.bytes>0);assert.ok(r.ticks>0);}
  console.log(JSON.stringify(result));await context.close();
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
