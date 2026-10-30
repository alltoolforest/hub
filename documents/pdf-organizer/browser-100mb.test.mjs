// End-to-end 100 MB PDF admission/export test through the real organizer UI.
// Synthetic document contains an actual PDF indirect stream just below 100 MiB;
// it is not trailing non-PDF padding or a forged File.size field.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, join} from 'node:path';
import {MAX_PDF_FILE_BYTES} from './limits.js';

const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const moduleDir=process.env.ORGANIZER_TEST_MODULES||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium,firefox,webkit}=await import(moduleDir?pathToFileURL(moduleDir+'/playwright/index.mjs').href:'playwright');
const browserName=process.env.BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[browserName];
assert(browserType,'Unsupported browser: '+browserName);
const root=fileURLToPath(new URL('../../',import.meta.url));
const doc=await P.PDFDocument.create({updateMetadata:false});
doc.addPage([400,600]).drawText('100 MB UI Acceptance Test',{x:50,y:470});
const filler=MAX_PDF_FILE_BYTES-256*1024;
doc.catalog.set(P.PDFName.of('SyntheticQAData'),
  doc.context.register(doc.context.stream(new Uint8Array(filler))));
const input=Buffer.from(await doc.save({useObjectStreams:false}));
assert(input.length>99*1024*1024&&input.length<=MAX_PDF_FILE_BYTES,
  'Synthetic PDF is not within the valid 99–100 MiB boundary');
const testDir=await mkdtemp(join(tmpdir(),'organizer-100mb-'));
const testFile=join(testDir,'synthetic-near-100mb.pdf');
await writeFile(testFile,input);
// Create sparse >100 MiB and 2 MiB files: the UI must reject these by
// file/session byte counts without attempting PDF parsing.
const overLimit=join(testDir,'above-100mb.pdf');
const combinedExcess=join(testDir,'combined-excess.pdf');
for(const [name,size] of [[overLimit,MAX_PDF_FILE_BYTES+1],[combinedExcess,2*1024*1024]]){
  const fh=await open(name,'w');
  try{await fh.truncate(size);}finally{await fh.close();}
}
const server=createServer(async(req,res)=>{
 try{
   const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
   if(!path.startsWith(root))throw Error('path traversal');
   const file=extname(path)?path:path+'/index.html';
   const bytes=await readFile(file);
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'})[extname(file)]||'application/octet-stream');
   res.end(bytes);
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const base='http://127.0.0.1:'+port+'/';
let browser;
try{
 browser=await browserType.launch({headless:true,timeout:30000});
 for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},
     hasTouch:mobile,acceptDownloads:true});
   try{
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'documents/pdf-organizer/',{waitUntil:'domcontentloaded'});
    assert.match(await page.locator('#pdf-organizer').innerText(),/100 MB/);
    const start=performance.now();
    await page.locator('#file').setInputFiles(testFile);
    await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===1,null,{timeout:120000});
    const uploadedMs=Math.round(performance.now()-start);
    const download=page.waitForEvent('download',{timeout:120000});
    const create=page.locator('#create');
    if(mobile)await create.tap();else await create.click();
    const artifact=await download;
    assert.equal(await artifact.failure(),null,'100 MB export download must succeed');
    const output=Buffer.from(await readFile(await artifact.path()));
    assert(output.length>99*1024*1024,'100 MB PDF output must preserve large resource');
    const verified=await P.PDFDocument.load(output);
    assert.equal(verified.getPageCount(),1);
    assert(verified.catalog.has(P.PDFName.of('SyntheticQAData')),
      'Document-level resource must survive same-source export');
    // While the near-100 MB PDF is still loaded, another 2 MB would exceed
    // the 100 MB session cap; this must not mutate the verified result.
    await page.locator('#file').setInputFiles(combinedExcess);
    await page.waitForFunction(()=>/combined PDF input limit is 100 MB/i.test(
      document.querySelector('#status')?.textContent||''),null,{timeout:15000});
    assert.equal(await page.locator('#grid .card').count(),1);
    assert.equal(await page.locator('#verifiedDownload').count(),1);
    await page.locator('#file').setInputFiles(overLimit);
    await page.waitForFunction(()=>/PDF cannot exceed 100 MB/i.test(
      document.querySelector('#status')?.textContent||''),null,{timeout:15000});
    assert.equal(await page.locator('#grid .card').count(),1);
    assert.equal(await page.locator('#verifiedDownload').count(),1);
    assert.deepEqual(errors,[],'No JavaScript errors expected');
    console.log(JSON.stringify({audit:'100mb-real-ui',browser:browserName,mobile,result:'PASS',
      inputBytes:input.length,outputBytes:output.length,uploadMs:uploadedMs,
      totalMs:Math.round(performance.now()-start),pageErrors:errors.length}));
   }finally{await ctx.close();}
 }
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await rm(testDir,{recursive:true,force:true});}
