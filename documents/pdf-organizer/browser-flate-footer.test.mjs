import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
const modules=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(modules?pathToFileURL(modules+'/playwright/index.mjs').href:'playwright');
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const browserName=process.env.BROWSER||'chromium';
const runner={chromium,firefox,webkit}[browserName];
assert(runner,'Unsupported browser '+browserName);
const pageContent=Buffer.from('q\n0.15 0.55 0.25 rg\n72 300 320 180 re f\nQ\n');
async function fixture(footerCount,corrupt=false) {
 const doc=await P.PDFDocument.create({updateMetadata:false});
 for(let i=0;i<3;i++)doc.addPage([595,842]);
 const content=Buffer.from(deflateSync(pageContent,{level:6}));
 if(corrupt)content[content.length-1]^=0xff;
 const encoded=corrupt?content:content.subarray(0,content.length-footerCount);
 const ref=doc.context.register(doc.context.stream(Uint8Array.from(encoded),{Filter:'FlateDecode'}));
 doc.getPage(0).node.set(P.PDFName.of('Contents'),ref);
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
const recover=await fixture(2),bad=await fixture(0,true);
const root=fileURLToPath(new URL('../../',import.meta.url));
const deployed=process.env.ORGANIZER_DEPLOYED_URL;
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root))throw Error('path traversal');
  const file=extname(path)?path:path+'/index.html';
  const content=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');
  res.end(content);
 }catch{res.statusCode=404;res.end();}
});
let base;
if(deployed){
 base=deployed;
 const sha=b=>createHash('sha256').update(b).digest('hex');
 for(const name of [
   'documents/pdf-organizer/index.html',
   'documents/pdf-organizer/organizer.js',
   'documents/pdf-organizer/engine.js',
   'documents/pdf-organizer/inspect-worker.js',
   'documents/pdf-organizer/verify.js']){
   const url=new URL(name,base);url.searchParams.set('audit','flate-footer');
   const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
   assert.equal(response.status,200,'Hosted asset HTTP '+response.status+' '+name);
   const remote=Buffer.from(await response.arrayBuffer()),local=await readFile(resolve(root,name));
   assert.equal(sha(remote),sha(local),'Published asset does not match deployed main: '+name);
   console.log(JSON.stringify({audit:'hosted-asset',name,bytes:remote.length,sha256:sha(remote)}));
 }
}else{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 base='http://127.0.0.1:'+server.address().port+'/';
}
let browser;
try{
 browser=await runner.launch({headless:true,timeout:30000});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
  try{
   const page=await context.newPage(),errors=[],remote=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
   await page.goto(new URL('documents/pdf-organizer/',base).href,{waitUntil:'domcontentloaded'});
   await page.locator('#file').setInputFiles({name:'recoverable-short-Flate-footer.pdf',mimeType:'application/pdf',buffer:recover});
   try{await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===3,null,{timeout:30000});}
   catch(e){console.error('Upload status',await page.locator('#status').innerText(),errors);throw e;}
   assert.match(await page.locator('#warnings').innerText(),/recoverable incomplete Flate checksum/i);
   const d=page.waitForEvent('download',{timeout:60000});
   if(mobile)await page.locator('#create').tap();else await page.locator('#create').click();
   const downloaded=await d;assert.equal(await downloaded.failure(),null);
   const out=Buffer.from(await readFile(await downloaded.path()));
   const parsed=await P.PDFDocument.load(out,{throwOnInvalidObject:true,updateMetadata:false});
   assert.equal(parsed.getPageCount(),3);
   const original=await P.PDFDocument.load(recover);
   const origStream=original.context.lookup(original.getPage(0).node.get(P.PDFName.of('Contents')));
   const outStream=parsed.context.lookup(parsed.getPage(0).node.get(P.PDFName.of('Contents')));
   assert.deepEqual(Buffer.from(outStream.getContents()),Buffer.from(origStream.getContents()));
   page.on('dialog',d=>d.accept());
   const clear=page.locator('#clearSession');
   if(mobile)await clear.tap();else await clear.click();
   await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===0&&!document.querySelector('#drop').hidden,null,{timeout:20000});
   await page.locator('#file').setInputFiles({name:'corrupt-checksum.pdf',mimeType:'application/pdf',buffer:bad});
   await page.waitForFunction(()=>/Flate checksum is invalid/i.test(document.querySelector('#status')?.textContent||''),null,{timeout:15000});
   assert.equal(await page.locator('#grid .card').count(),0);
   assert.equal(await page.locator('#verifiedDownload').count(),0);
   assert.deepEqual(errors,[],'No page errors expected');
   assert.deepEqual(remote,[],'PDF must stay browser-local');
   console.log(JSON.stringify({browser:browserName,mobile,footerRecovery:'PASS',pages:3,
     originalCompressedBytes:origStream.getContents().length,outputBytes:out.length,
     corruptChecksumRejected:true,pageErrors:errors.length,remoteRequests:remote.length}));
  }finally{await context.close();}
 }
}finally{if(browser)await browser.close();if(server.listening)await new Promise(done=>server.close(done));}
