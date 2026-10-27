import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modules=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(modules?pathToFileURL(modules+'/playwright/index.mjs').href:'playwright');
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const doc=await P.PDFDocument.create({updateMetadata:false});
for(let i=0;i<6;i++)doc.addPage([300+i*10,440]).drawText('PAGE '+i);
const buffer=Buffer.from(await doc.save());
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root))throw Error();const file=extname(path)?path:path+'/index.html';const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
let failed=0;
for(const [name,type] of Object.entries({chromium,firefox,webkit})) {
 if(process.env.BROWSER&&process.env.BROWSER!==name)continue;
 let browser;
 try {
  browser=await type.launch({headless:true,timeout:30000,executablePath:process.env.ORGANIZER_BROWSER_EXECUTABLE||undefined});
  for(const mobile of [false,true]) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
   const page=await context.newPage(),errors=[],remote=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8765/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
   await page.goto('http://127.0.0.1:8765/documents/pdf-organizer-v2-candidate/');
   await page.locator('#file').setInputFiles({name:'file\" onmouseover=\"window.INJECTED=1.pdf',mimeType:'application/pdf',buffer});
   await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===6);
   await page.locator('#grid .card').first().locator('[data-act=sel]').check();
   await page.locator('[data-bulk=dup]').click();assert.equal(await page.locator('#grid .card').count(),7);
   await page.locator('#undo').click();assert.equal(await page.locator('#grid .card').count(),6);
   await page.locator('#redo').click();assert.equal(await page.locator('#grid .card').count(),7);
   await page.locator('[data-bulk=blank]').click();assert.equal(await page.locator('#grid .card').count(),8);
   await page.locator('#grid .card').first().locator('[data-act=open]').last().click();
   await page.waitForFunction(()=>document.querySelector('#pvCanvas').width>0);await page.locator('#pvClose').click();
   const downloadPromise=page.waitForEvent('download');await page.locator('#create').click();
   const download=await downloadPromise;assert.equal(await download.failure(),null);
   const output=await P.PDFDocument.load(await (await import('node:fs/promises')).readFile(await download.path()));assert.equal(output.getPageCount(),8);
   assert.equal(await page.evaluate(()=>window.INJECTED),undefined);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
   if(process.env.ORGANIZER_AXE_PATH){await page.evaluate(await readFile(process.env.ORGANIZER_AXE_PATH,'utf8'));const audit=await page.evaluate(()=>axe.run());const serious=audit.violations.filter(v=>['serious','critical'].includes(v.impact));assert.deepEqual(serious.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);console.log(JSON.stringify({browser:name,mobile,axeViolations:audit.violations.map(v=>v.id)}));}
   await page.screenshot({path:'/tmp/organizer-'+name+(mobile?'-mobile':'-desktop')+'.png',fullPage:true});
   // Export cancellation prevents publication, and the following export recovers.
   await page.route('**/export-worker.js',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue();});
   await page.locator('#create').click();await page.locator('#cancel').click();
   await page.waitForFunction(()=>document.querySelector('#pdf-organizer').getAttribute('aria-busy')==='false');
   assert.match(await page.locator('#status').textContent(),/cancelled/i);
   await page.unroute('**/export-worker.js');
   // Combining changes the old filename into a displayed multi-source title.
   await page.locator('#file').setInputFiles({name:'second.pdf',mimeType:'application/pdf',buffer});
   await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===14);
   assert.equal(await page.evaluate(()=>document.querySelector('[onmouseover]')),null);
   await page.locator('#range').fill('2, 4');
   const extraction=page.waitForEvent('download');await page.locator('[data-bulk=extract]').click();
   const extracted=await extraction;const extractedPdf=await P.PDFDocument.load(await readFile(await extracted.path()));assert.equal(extractedPdf.getPageCount(),2);
   await page.locator('#range').fill('');
   const combinedPromise=page.waitForEvent('download');await page.locator('#create').click();
   const combined=await combinedPromise;assert.equal((await P.PDFDocument.load(await readFile(await combined.path()))).getPageCount(),14);
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
   console.log(JSON.stringify({browser:name,mobile,result:'PASS',pages:output.getPageCount(),combinedPages:14,extractedPages:2,remoteRequests:remote.length}));
   await context.close();
  }
 }catch(e){failed++;console.error(name,e.stack);}
 finally{await browser?.close();}
}
server.close();if(failed)process.exitCode=1;
