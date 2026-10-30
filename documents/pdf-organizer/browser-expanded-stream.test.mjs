// End-to-end browser regression for a 30.27 MB, 56-page PDF with more
// than 128 MiB cumulative decoded Flate data and one stream >24 MiB.
// Generated synthetic QA PDF; no user's private document is uploaded.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname,join} from 'node:path';
import {buildRealistic56PagePdf,P,MiB} from './expanded-stream-fixture.mjs';
const moduleDir=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(moduleDir?pathToFileURL(moduleDir+'/playwright/index.mjs').href:'playwright');
const browserName=process.env.BROWSER||'chromium',kind={chromium,firefox,webkit}[browserName];
assert(kind,'Unsupported browser '+browserName);
const {bytes,meta}=await buildRealistic56PagePdf();
assert(meta.bytes>30_000_000&&meta.bytes<31_000_000,'input should mimic reported 30.27 MB PDF');
assert(meta.decodedBytes>128*MiB&&meta.largestDecoded>24*MiB,'must reproduce old guard case');
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'organizer-expanded-'));
const src=join(dir,'30.27MB-56pages.pdf');
await writeFile(src,bytes);
const server=createServer(async(req,res)=>{
 try{
   const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
   if(!path.startsWith(root))throw Error('path traversal');
   const file=extname(path)?path:path+'/index.html';const data=await readFile(file);
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');
   res.end(data);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 browser=await kind.launch({headless:true,timeout:30000});
 for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
   try{
     const page=await ctx.newPage();const errors=[],outside=[];
     page.on('pageerror',e=>errors.push(e.message));
     page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))outside.push(r.url());});
     await page.goto('http://127.0.0.1:'+server.address().port+'/documents/pdf-organizer/',{waitUntil:'domcontentloaded'});
     const start=performance.now();
     await page.locator('#file').setInputFiles(src);
     try{
       await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===56,null,{timeout:120000});
     }catch(e){
       console.error('PDF LOAD FAILURE',await page.locator('#status').innerText(),errors);
       throw e;
     }
     const uploadMs=Math.round(performance.now()-start);
     const download=page.waitForEvent('download',{timeout:120000});
     if(mobile)await page.locator('#create').tap();else await page.locator('#create').click();
     const artifact=await download;assert.equal(await artifact.failure(),null);
     const output=Buffer.from(await readFile(await artifact.path()));
     const pdf=await P.PDFDocument.load(output);
     assert.equal(pdf.getPageCount(),56);
     assert(pdf.catalog.has(P.PDFName.of('SyntheticLargeImageData')),'large resource must be retained');
     assert(output.length>29_000_000,'export must not discard large resource');
     assert.deepEqual(errors,[]);
     assert.deepEqual(outside,[]);
     console.log(JSON.stringify({audit:'30mb-56page-browser',browser:browserName,mobile,result:'PASS',
       inputBytes:bytes.length,outputBytes:output.length,pages:pdf.getPageCount(),
       decodedMiB:Math.round(meta.decodedBytes/MiB),uploadMs,totalMs:Math.round(performance.now()-start),
       pageErrors:errors.length,outsideRequests:outside.length}));
   }finally{await ctx.close();}
 }
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});}
