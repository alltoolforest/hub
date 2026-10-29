import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import assert from 'node:assert/strict';

const modules=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(modules?pathToFileURL(modules+'/playwright/index.mjs').href:'playwright');
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
async function fixture(pages=3,expandedMiB=0){
 const doc=await P.PDFDocument.create({updateMetadata:false});
 for(let i=0;i<pages;i++)doc.addPage([400+i%3*16,600]).drawText('SYNTHETIC_PAGE_'+i);
 if(expandedMiB){
   const encoded=deflateSync(Buffer.from('q\\nQ\\n'.repeat(expandedMiB*1024*1024/4)),{level:9});
   const stream=doc.context.stream(Uint8Array.from(encoded),{Filter:'FlateDecode'});
   doc.getPage(0).node.set(P.PDFName.of('Contents'),doc.context.register(stream));
 }
 return Buffer.from(await doc.save({useObjectStreams:false}));
}
const bomb=await fixture(1,40),normal=await fixture(3),long=await fixture(480);
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root))throw Error('path traversal');
  const file=extname(path)?path:path+'/index.html';const bytes=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(8766,'127.0.0.1',r));
let failures=0;
try {
 for(const [name,type] of Object.entries({chromium,firefox,webkit})){
  if(process.env.BROWSER&&process.env.BROWSER!==name)continue;
  const browser=await type.launch({headless:true,timeout:40000});
  try{
   for(const mobile of [false,true]){
    const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
    const page=await ctx.newPage(),errors=[],outside=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8766/')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))outside.push(r.url());});
    const click=loc=>mobile?loc.tap():loc.click();
    try{
      await page.goto('http://127.0.0.1:8766/documents/pdf-organizer/');
      const t=Date.now();
      await page.locator('#file').setInputFiles({name:'EXPANSION_BOMB.pdf',mimeType:'application/pdf',buffer:bomb});
      await page.waitForFunction(()=>/decompression memory budget exceeded/i.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
      assert.equal(await page.locator('#grid .card').count(),0,'refused bomb must not create pages');
      assert.equal(await page.locator('#verifiedDownload').count(),0,'refused bomb must not publish download');
      const rejectedMs=Date.now()-t;
      await page.locator('#file').setInputFiles({name:'RECOVERY_NORMAL.pdf',mimeType:'application/pdf',buffer:normal});
      await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===3,null,{timeout:30000});
      const downloadReady=page.waitForEvent('download',{timeout:45000});
      await click(page.locator('#create'));
      const dl=await downloadReady;assert.equal(await dl.failure(),null);
      const out=await P.PDFDocument.load(await readFile(await dl.path()));
      assert.equal(out.getPageCount(),3,'recovery export must contain 3 pages');
      page.on('dialog',d=>d.accept());
      await click(page.locator('#clearSession'));
      try{
        await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===0&&document.querySelector('#drop')?.hidden===false,null,{timeout:20000});
      }catch(error){
        console.error('Clear-session diagnostics',await page.evaluate(()=>({
          status:document.querySelector('#status')?.textContent,
          cards:document.querySelectorAll('#grid .card').length,
          dropHidden:document.querySelector('#drop')?.hidden,
          rootBusy:document.querySelector('#pdf-organizer')?.getAttribute('aria-busy'),
          dialogOpen:document.querySelector('#pv')?.open,
          clearButtonDisabled:document.querySelector('#clearSession')?.disabled
        })),errors);
        throw error;
      }
      const started=Date.now();
      await page.locator('#file').setInputFiles({name:'LONG_480.pdf',mimeType:'application/pdf',buffer:long});
      await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===480,null,{timeout:60000});
      const loadedMs=Date.now()-started;
      assert.equal(await page.locator('#grid .card').count(),480);
      assert.equal(await page.locator('#verifiedDownload').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
      console.log(JSON.stringify({browser:name,mobile,stress:'PASS',bombBytes:bomb.length,bombDecodedMiB:40,bombRejectMs:rejectedMs,
        recoveryExportPages:out.getPageCount(),largeTextPages:480,largeUploadMs:loadedMs,
        pageErrors:errors.length,outsideRequests:outside.length}));
    }finally{await ctx.close();}
   }
  }catch(e){failures++;console.error(name,'browser-stress',e.stack);}
  finally{await browser.close();}
 }
}finally{await new Promise(r=>server.close(r));}
if(failures)process.exitCode=1;
