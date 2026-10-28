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
const PRODUCTION_BASE=process.env.PDF_ORGANIZER_BASE_URL;
const server=PRODUCTION_BASE?null:createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root))throw Error();const file=extname(path)?path:path+'/index.html';const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(bytes);}catch{res.statusCode=404;res.end();}});
if(server)await new Promise(r=>server.listen(8765,'127.0.0.1',r));
let failed=0;
for(const [name,type] of Object.entries({chromium,firefox,webkit})) {
 if(process.env.BROWSER&&process.env.BROWSER!==name)continue;
 let browser,lastPage;
 try {
  browser=await type.launch({headless:true,timeout:30000,executablePath:process.env.ORGANIZER_BROWSER_EXECUTABLE||undefined});
  for(const mobile of [false,true]) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
   const page=lastPage=await context.newPage(),errors=[],remote=[];
   await page.addInitScript(()=>{
     window.__organizerTestClicks=[];
     for(const type of ['touchstart','touchend','pointerdown','pointerup','click']) {
       document.addEventListener(type,event=>{
         const target=event.target;
         const touch=event.changedTouches?.[0];
         const x=touch?.clientX??event.clientX,y=touch?.clientY??event.clientY;
         const hit=Number.isFinite(x)&&Number.isFinite(y)?document.elementFromPoint(x,y):null;
         const row={type,tag:target?.tagName,id:target?.id||'',
           hit:hit?.id||hit?.tagName||'',
           x,y,scrollY:window.scrollY,visualOffset:window.visualViewport?.offsetTop,
           trusted:event.isTrusted};
         window.__organizerTestClicks.push(row);
         if(window.__organizerTestClicks.length>35)window.__organizerTestClicks.shift();
       },true);
     }
   });
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const allowed=PRODUCTION_BASE?new URL(PRODUCTION_BASE).origin+'/':'http://127.0.0.1:8765/';if(!r.url().startsWith(allowed)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
   const activate=locator=>mobile?locator.tap():locator.click();
   async function downloadAfter(action){
    let saved=null;const onDownload=d=>{saved=d;};page.on('download',onDownload);
    try{
      await action();
      // A very fast export may already be finished before observing busy.
      // A missed mobile tap must not be mistaken for a successful idle state.
      await page.waitForFunction(()=>document.querySelector('#pdf-organizer').getAttribute('aria-busy')==='true' ||
        !!document.querySelector('#verifiedDownload') ||
        /^Export (stopped|cancelled)/.test(document.querySelector('#status').textContent),null,{timeout:15000});
      await page.waitForFunction(()=>document.querySelector('#pdf-organizer').getAttribute('aria-busy')==='false');
      if(!saved&&await page.locator('#verifiedDownload').count())await activate(page.locator('#verifiedDownload'));
      for(let i=0;i<50&&!saved;i++)await new Promise(r=>setTimeout(r,100));
      assert(saved,'No download: '+await page.locator('#status').textContent());return saved;
    }finally{page.off('download',onDownload);}
   }
   const target=PRODUCTION_BASE?new URL('documents/pdf-organizer/',PRODUCTION_BASE).href:'http://127.0.0.1:8765/documents/pdf-organizer-v2-candidate/';
   const response=await page.goto(target,{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200,'Published organizer URL must be HTTP 200');
   if(PRODUCTION_BASE){assert.equal(await page.locator('h1').count(),1,'Published tool requires exactly one H1');assert.equal(await page.locator('.site-header').count(),1,'Published tool must retain site navigation');}
   await page.locator('#file').setInputFiles({name:'file\" onmouseover=\"window.INJECTED=1.pdf',mimeType:'application/pdf',buffer});
   await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===6);
   await page.locator('#grid .card').first().locator('[data-act=sel]').check();
   await activate(page.locator('[data-bulk=dup]'));assert.equal(await page.locator('#grid .card').count(),7);
   await activate(page.locator('#undo'));assert.equal(await page.locator('#grid .card').count(),6);
   await activate(page.locator('#redo'));assert.equal(await page.locator('#grid .card').count(),7);
   await activate(page.locator('[data-bulk=blank]'));assert.equal(await page.locator('#grid .card').count(),8);
   await activate(page.locator('#grid .card').first().locator('[data-act=open]').last());
   await page.waitForFunction(()=>document.querySelector('#pvCanvas').width>0);await page.evaluate(()=>{for(let i=0;i<5;i++)document.querySelector('#pvNext').click();});await activate(page.locator('#pvClose'));await page.locator('#pv').waitFor({state:'hidden'});
   const download=await downloadAfter(()=>activate(page.locator('#create')));assert.equal(await download.failure(),null);
   const output=await P.PDFDocument.load(await (await import('node:fs/promises')).readFile(await download.path()));assert.equal(output.getPageCount(),8);
   assert.equal(await page.evaluate(()=>window.INJECTED),undefined);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
   if(process.env.ORGANIZER_AXE_PATH){await page.evaluate(await readFile(process.env.ORGANIZER_AXE_PATH,'utf8'));const audit=await page.evaluate(()=>axe.run());const serious=audit.violations.filter(v=>['serious','critical'].includes(v.impact));assert.deepEqual(serious.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);console.log(JSON.stringify({browser:name,mobile,axeViolations:audit.violations.map(v=>v.id)}));}
   await page.screenshot({path:'/tmp/organizer-'+name+(mobile?'-mobile':'-desktop')+'.png',fullPage:true});
   // Export cancellation prevents publication, and the following export recovers.
   await page.route('**/export-worker.js',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue();});
   await activate(page.locator('#create'));await activate(page.locator('#cancel'));
   await page.waitForFunction(()=>document.querySelector('#pdf-organizer').getAttribute('aria-busy')==='false');
   assert.match(await page.locator('#status').textContent(),/cancelled/i);
   await page.unrouteAll({behavior:'wait'});
   // Combining changes the old filename into a displayed multi-source title.
   await page.locator('#file').setInputFiles({name:'second.pdf',mimeType:'application/pdf',buffer});
   await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===14);
   assert.equal(await page.evaluate(()=>document.querySelector('[onmouseover]')),null);
   const selectedBefore=await page.locator('#grid [data-act=sel]:checked').count();
   await page.locator('#range').fill('2, not-a-range');
   assert.equal(await page.locator('#range').getAttribute('aria-invalid'),'true');
   assert.equal(await page.locator('#grid [data-act=sel]:checked').count(),selectedBefore);
   const destination=page.locator('#grid .card').first().locator('[data-act=goto]');
   await destination.fill('9999');await destination.press('Enter');
   assert.match(await page.locator('#status').textContent(),/destination between/);
   assert.equal(await page.locator('#grid .card').count(),14);
   await page.locator('#range').fill('2, 4');
   assert.equal(await page.locator('#range').getAttribute('aria-invalid'),null);
   const extracted=await downloadAfter(()=>activate(page.locator('[data-bulk=extract]')));const extractedPdf=await P.PDFDocument.load(await readFile(await extracted.path()));assert.equal(extractedPdf.getPageCount(),2);
   await page.locator('#range').fill('');
   const combined=await downloadAfter(()=>activate(page.locator('#create')));assert.equal((await P.PDFDocument.load(await readFile(await combined.path()))).getPageCount(),14);
   // Source removal must stay reversible, without losing the associated PDF.
   await activate(page.locator('#files [data-rmsrc]').last());
   assert.equal(await page.locator('#grid .card').count(),8);
   await activate(page.locator('#undo'));
   assert.equal(await page.locator('#grid .card').count(),14);
   await activate(page.locator('#redo'));
   assert.equal(await page.locator('#grid .card').count(),8);
   await activate(page.locator('#undo'));
   assert.equal(await page.locator('#grid .card').count(),14);
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
   console.log(JSON.stringify({browser:name,mobile,result:'PASS',pages:output.getPageCount(),combinedPages:14,extractedPages:2,remoteRequests:remote.length}));
   await context.close();
  }
 }catch(e){
  failed++;console.error(name,e.stack);
  try {
    console.error('UI status:',await lastPage.locator('#status').textContent());
    console.error('Export control diagnostics:',await lastPage.evaluate(()=>({
      clicks:window.__organizerTestClicks,
      disabled:document.querySelector('#create')?.disabled,
      barHidden:document.querySelector('#bar')?.hidden,
      busy:document.querySelector('#pdf-organizer')?.getAttribute('aria-busy'),
      downloadLink:!!document.querySelector('#verifiedDownload'),
      createRect:(()=>{const r=document.querySelector('#create')?.getBoundingClientRect();
        return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;})(),
      hit:(()=>{const r=document.querySelector('#create')?.getBoundingClientRect();
        if(!r)return null;const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return e?{id:e.id,tag:e.tagName,className:String(e.className).slice(0,100)}:null;})()
    })));
  }catch{}
 }
 finally{await browser?.close();}
}
server?.close();if(failed)process.exitCode=1;
