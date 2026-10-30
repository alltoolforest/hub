// Read-only post-deployment smoke audit of the published GitHub Pages organizer.
// Tests use generated synthetic PDF content only; no real/user documents.
// Runs against deployed staging, never edits the server or repository.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {deflateSync} from 'node:zlib';
const BASE=process.env.ORGANIZER_DEPLOYED_URL||'https://alltoolforest.github.io/hub/';
const pageUrl=new URL('documents/pdf-organizer/',BASE).href;
const root=fileURLToPath(new URL('../../',import.meta.url));
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
const assetPaths=[
 'documents/pdf-organizer/index.html',
 'documents/pdf-organizer/organizer.css',
 'documents/pdf-organizer/organizer.js',
 'documents/pdf-organizer/engine.js',
 'documents/pdf-organizer/inspect-worker.js',
 'documents/pdf-organizer/export-worker.js',
 'documents/pdf-organizer/verify.js',
 'documents/pdf-organizer/vendor/sortable.js'
];
for(const path of assetPaths){
 const url=new URL(path,BASE);
 url.searchParams.set('audit','postdeploy-20261030');
 const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
 assert.equal(response.status,200,'HTTP '+response.status+' '+url.href);
 const served=Buffer.from(await response.arrayBuffer());
 const repoFile=await readFile(resolve(root,path));
 assert.equal(hash(served),hash(repoFile),'Deployed source differs from GitHub main: '+path);
 console.log(JSON.stringify({type:'deployed-asset',path,status:response.status,bytes:served.length,sha256:hash(served)}));
}
const doc=await P.PDFDocument.create({updateMetadata:false});
for(let i=0;i<3;i++){const p=doc.addPage([400+i*20,600]);p.drawText('POST DEPLOY QA PAGE '+(i+1),{x:40,y:450});}
const sample=Buffer.from(await doc.save({useObjectStreams:false}));
const bombDoc=await P.PDFDocument.create({updateMetadata:false});
bombDoc.addPage([400,600]);
const raw=Buffer.from('q\\nQ\\n'.repeat(40*1024*1024/4));
const zipped=deflateSync(raw,{level:9});
const stream=bombDoc.context.stream(Uint8Array.from(zipped),{Filter:'FlateDecode'});
bombDoc.getPage(0).node.set(P.PDFName.of('Contents'),bombDoc.context.register(stream));
const bomb=Buffer.from(await bombDoc.save({useObjectStreams:false}));
const {chromium,firefox,webkit}=await import('playwright');
const engines={chromium,firefox,webkit};
let failed=0;
for(const [name,engine] of Object.entries(engines)){
 if(process.env.BROWSER&&name!==process.env.BROWSER)continue;
 let browser;
 try {
  browser=await engine.launch({headless:true});
  for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},hasTouch:mobile,acceptDownloads:true});
   try{
    const page=await ctx.newPage(),errors=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(!r.url().startsWith(BASE)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
    const resp=await page.goto(pageUrl,{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(resp.status(),200,'Hosted route status');
    await page.locator('#file').setInputFiles({name:'postdeploy-synthetic.pdf',mimeType:'application/pdf',buffer:sample});
    await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===3,null,{timeout:30000});
    const activate=loc=>mobile?loc.tap():loc.click();
    await activate(page.locator('#grid .card').first().locator('[data-act="rotR"]'));
    const downloadP=page.waitForEvent('download',{timeout:45000});
    await activate(page.locator('#create'));const dl=await downloadP;
    assert.equal(await dl.failure(),null);
    const out=await P.PDFDocument.load(await readFile(await dl.path()));
    assert.equal(out.getPageCount(),3);
    assert.equal(out.getPage(0).getRotation().angle,90);
    assert.equal(await page.locator('#verifiedDownload').count(),1);
    page.on('dialog',d=>d.accept());
    await activate(page.locator('#clearSession'));
    await page.waitForFunction(()=>document.querySelectorAll('#grid .card').length===0&&!document.querySelector('#drop').hidden,null,{timeout:20000});
    await page.locator('#file').setInputFiles({name:'bomb.pdf',mimeType:'application/pdf',buffer:bomb});
    await page.waitForFunction(()=>/decompression memory budget exceeded/i.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
    assert.equal(await page.locator('#grid .card').count(),0);
    assert.equal(await page.locator('#verifiedDownload').count(),0);
    assert.equal(errors.length,0,'JavaScript errors: '+errors.join('; '));
    assert.deepEqual(external,[],'unexpected external requests');
    console.log(JSON.stringify({type:'hosted-e2e',browser:name,mobile,status:'PASS',
     outputPages:out.getPageCount(),page0Rotation:out.getPage(0).getRotation().angle,
     bombCompressedBytes:bomb.length,bombDecodedMiB:40,externalRequests:0,pageErrors:0}));
   }finally{await ctx.close();}
  }
 }catch(e){failed++;console.error('HOSTED_AUDIT_FAIL',name,e.stack||e);}
 finally{if(browser)await browser.close();}
}
if(failed)process.exitCode=1;
