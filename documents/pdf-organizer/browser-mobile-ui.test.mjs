// Mobile-first interface regression. This checks presentation and touch
// affordances only; the existing engine/verified-output suites remain separate.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const modules=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(modules?pathToFileURL(modules+'/playwright/index.mjs').href:'playwright');
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const doc=await P.PDFDocument.create({updateMetadata:false});
for(let i=0;i<6;i++)doc.addPage([350+i*10,490]).drawText('MOBILE-ORGANIZER-PAGE-'+i,{x:32,y:350});
const input=Buffer.from(await doc.save());
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(root))throw Error('path traversal');
  const file=extname(path)?path:path+'/index.html';
  const b=await readFile(file);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');
  res.end(b);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port+'/';
let fail=0;
try{
for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
 if(process.env.BROWSER&&name!==process.env.BROWSER)continue;
 const browser=await engine.launch({headless:true,timeout:30000});
 try{
  for(const width of [390,320,1366]){
   const mobile=width<700;
   const context=await browser.newContext({viewport:{width,height:mobile?844:900},hasTouch:mobile,acceptDownloads:true});
   const page=await context.newPage(),errors=[],remote=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))remote.push(r.url());});
   try{
    await page.goto(new URL('documents/pdf-organizer/',base).href);
    await page.locator('#file').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:input});
    await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===6,null,{timeout:30000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow at '+width);
    const advanced=page.locator('#advancedTools'),options=page.locator('#exportOptions');
    if(mobile){
      assert.equal(await advanced.evaluate(el=>el.open),false);
      assert.equal(await options.evaluate(el=>el.open),false);
      assert.equal(await page.locator('#safetyDetails').evaluate(el=>el.open),false);
      assert.equal(await page.locator('#bar').evaluate(el=>getComputedStyle(el).position),'fixed');
      assert.equal(await page.locator('#grid .card').first().locator('[data-act=rotL]').isVisible(),false);
      assert.equal(await page.locator('#grid .card').first().locator('[data-act=more]').isVisible(),true);
      assert.equal(await page.locator('#mobileStat').isVisible(),true);
      const btn=page.locator('#grid .card').first().locator('[data-act=more]');
      await btn.tap();
      assert.equal(await btn.getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('#grid .card').first().locator('[data-act=rotL]').isVisible(),true);
      await btn.tap();
      assert.equal(await btn.getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('#grid .card').first().locator('[data-act=rotL]').isVisible(),false);
      await page.locator('#grid .card').first().locator('.thumb').tap();
      await page.waitForFunction(()=>document.querySelector('#pv')?.open&&document.querySelector('#pvCanvas').width>0,null,{timeout:20000});
      await page.locator('#pvClose').tap();
      await page.locator('#pv').waitFor({state:'hidden'});
      await page.locator('#advancedTools > summary').tap();
      assert.equal(await advanced.evaluate(el=>el.open),true);
      await page.locator('[data-bulk=selAll]').tap();
      assert.equal(await page.locator('#grid [data-act=sel]:checked').count(),6);
      await page.locator('.toolbar-primary [data-bulk=rotR]').tap();
      assert.equal(await page.locator('#grid [data-act=sel]:checked').count(),6);
      await page.locator('#range').fill('1-2');
      assert.equal(await page.locator('#grid [data-act=sel]:checked').count(),2);
      await page.locator('#range').fill('');
      await page.locator('#advancedTools > summary').tap();
      await page.locator('#exportOptions > summary').tap();
      assert.equal(await options.evaluate(el=>el.open),true);
      await page.locator('#outName').fill('simplified-mobile-test');
      await page.locator('#exportOptions > summary').tap();
      assert.equal(await options.evaluate(el=>el.open),false);
      // Export remains visible even while scrolling through the page list.
      await page.evaluate(()=>scrollTo(0,0));
      assert.equal(await page.locator('#create').isVisible(),true);
      const clickPoint=await page.locator('#create').boundingBox();
      assert(clickPoint&&clickPoint.y>=0&&clickPoint.y+clickPoint.height<=844,'Save button must stay onscreen');
    }else{
      assert.equal(await advanced.evaluate(el=>el.open),false);
      assert.equal(await options.evaluate(el=>el.open),false);
      await page.locator('#advancedTools > summary').click();
      assert.equal(await advanced.evaluate(el=>el.open),true);
      await page.locator('#advancedTools > summary').click();
      assert.equal(await page.locator('#grid .card').first().locator('[data-act=more]').isVisible(),false);
    }
    const download=page.waitForEvent('download',{timeout:60000});
    if(mobile)await page.locator('#create').tap();else await page.locator('#create').click();
    const d=await download;
    assert.equal(await d.failure(),null);
    const out=await P.PDFDocument.load(await readFile(await d.path()));
    assert.equal(out.getPageCount(),6);
    if(mobile){
      for(const pg of out.getPages())assert.equal(pg.getRotation().angle,90);
      assert.equal(await page.locator('#bar #verifiedDownload').count(),1,'Verified download fallback must be visible in mobile bar');
      await page.locator('#advancedTools > summary').tap();
      page.on('dialog',dialog=>dialog.accept());
      await page.locator('#clearMobileSession').tap();
      await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===0&&document.querySelector('#drop')?.hidden===false,null,{timeout:25000});
      assert.equal(await page.locator('#bar #verifiedDownload').count(),0);
    }
    assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
    console.log(JSON.stringify({audit:'organizer-simplified-ui',browser:name,width,mobile,result:'PASS',
      exportPages:out.getPageCount(),advancedInitiallyCollapsed:true,
      stickySave:mobile,pageErrors:errors.length,externalRequests:remote.length}));
   }catch(e){fail++;console.error('MOBILE_UI_FAIL',name,width,e.stack||e);
     try{console.error('STATUS',await page.locator('#status').innerText());}catch{}
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
}finally{await new Promise(done=>server.close(done));}
if(fail)process.exitCode=1;
