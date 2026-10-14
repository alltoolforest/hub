// Audit the actually published GitHub Pages review build; no production mutations.
// LIVE_SITE_URL may override review Pages origin for a separately approved deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
const kind=process.env.BROWSER||'chromium';
const browser=await ({chromium,firefox,webkit}[kind]).launch({headless:true});
const site=process.env.LIVE_SITE_URL||'https://alltoolforest.github.io/hub/';
const base=new URL(site),toolURL=new URL('documents/application-document-prep/',base);
const pageURL=toolURL.toString();
const page=await browser.newPage({acceptDownloads:true,viewport:{width:375,height:812}});
const unexpected=[],requests=[],postMethods=[],cspEvents=[];
page.on('pageerror',e=>unexpected.push(e.message));
page.on('request',r=>{
 if(!r.url().startsWith(base.origin+'/')&&!r.url().startsWith('blob:')&&
    !r.url().startsWith('data:')&&!r.url().startsWith('about:'))
    requests.push(r.url());
 if(!['GET','HEAD'].includes(r.method()))postMethods.push([r.method(),r.url()]);
});
page.on('console',m=>{if(m.type()==='error')cspEvents.push(m.text().slice(0,250));});
const details={browser:kind,url:pageURL,sha:process.env.EXPECTED_DEPLOY_SHA||'c5d82369191b0a9f7be5b6b0b804db659bed8672'};
const ready=(selector,text)=>page.waitForFunction(([s,v])=>
 document.querySelector(s)?.textContent?.includes(v),[selector,text],{timeout:30000});
async function httpProbe(url){
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(30000)});
 return {status:response.status,url:response.url,headers:Object.fromEntries(response.headers.entries()),text:await response.text()};
}
try{
 const response=await httpProbe(pageURL);
 details.response={status:response.status,contentType:response.headers['content-type'],
  csp:response.headers['content-security-policy']||null,
  xFrameOptions:response.headers['x-frame-options']||null,
  xContentTypeOptions:response.headers['x-content-type-options']||null,
  referrerPolicy:response.headers['referrer-policy']||null,
  permissionsPolicy:response.headers['permissions-policy']||null,
  cacheControl:response.headers['cache-control']||null};
 assert.equal(response.status,200,'Live tool URL must return HTTP 200');
 assert.match(response.text,/<title>Application Photo &amp; Signature Resizer/);
 assert.match(response.text,/name="robots" content="noindex,nofollow"/);
 assert.match(response.text,/http-equiv="Content-Security-Policy"/);
 for(const path of ['assets/js/application-prep.js','assets/js/application-prep-resources.js',
  'assets/js/application-prep-checks.js','assets/css/application-prep.css']){
  const data=await httpProbe(new URL(path,base));
  assert.equal(data.status,200,'Production asset missing '+path);
  assert.ok(data.text.length>600,'Asset suspiciously short '+path);
  const checkedIn=await fs.readFile(new URL('../'+path,import.meta.url),'utf8');
  assert.equal(data.text,checkedIn,'Published asset differs from deployed commit '+path);
 }
 const navigation=await page.goto(pageURL,{waitUntil:'networkidle',timeout:45000});
 assert.equal(navigation.status(),200);
 await page.locator('#app-workflow').waitFor({timeout:20000});
 assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'noindex,nofollow');
 assert.match(await page.locator('h1').first().textContent(),/Application Photo & Signature Resizer/);
 await page.locator('#app-workflow').selectOption('signature');
 assert.match(await page.locator('.app-guidance').textContent(),/Signature/);
 const pix=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=160;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,160,80);
  ctx.fillStyle='#101010';ctx.fillRect(32,16,96,48);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({
  name:'production-audit.png',mimeType:'image/png',buffer:Buffer.from(pix,'base64')
 });
 await ready('.selected-files','Selected: production-audit.png');
 await page.locator('#app-crop-x').fill('25');
 await page.locator('#app-crop-w').fill('50');
 await page.getByRole('button',{name:'Apply crop values'}).click();
 await ready('.app-crop-help','Crop applied');
 assert.equal(await page.locator('#width').inputValue(),'80');
 assert.equal(await page.locator('#height').inputValue(),'80');
 await page.locator('#format').selectOption('image/png');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await ready('.app-output-status','Ready: 80 × 80 px');
 const imageDl=page.waitForEvent('download',{timeout:20000});
 await page.locator('#downloads a[download]').click();
 const imageFile=await imageDl,bytes=await fs.readFile(await imageFile.path());
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 details.image={name:imageFile.suggestedFilename(),bytes:bytes.length};
 await page.locator('#height').fill('77');
 await ready('.app-output-status','Outdated result');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#height').fill('80');
 await page.locator('#format').selectOption('image/jpeg');
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await ready('.app-output-status','Ready: single-page A4 PDF');
 const pdfDl=page.waitForEvent('download',{timeout:20000});
 await page.locator('#downloads a[download]').click();
 const pdf=await pdfDl,pdfBytes=await fs.readFile(await pdf.path());
 const doc=await PDFLib.PDFDocument.load(pdfBytes);
 assert.equal(doc.getPageCount(),1);
 const pageSize=doc.getPage(0).getSize();
 assert.ok(Math.abs(pageSize.width-595.28)<0.3&&Math.abs(pageSize.height-841.89)<0.3);
 details.pdf={name:pdf.suggestedFilename(),bytes:pdfBytes.length,pages:doc.getPageCount()};
 await page.locator('#target').fill('0.001');
 await page.getByRole('button',{name:'Create supporting-image PDF'}).click();
 await ready('#status','exceeding the requested');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 details.outdatedAndErrorRecovery=true;
 const priorFailureMessages=cspEvents.slice();
 // A handled invalid-size error is logged by the shared action controller.
 // It is expected; an uncaught browser exception would be reported separately.
 details.handledErrorConsoleLog=priorFailureMessages.length;
 const frozenSmoke=[];
 for(const path of ['documents/edit-pdf/','work/resume-studio/',
    'work/invoice/','calculators/loan/']){
  const check=await httpProbe(new URL(path,base));
  assert.equal(check.status,200,'Frozen tool unavailable after Application Prep deployment: '+path);
  assert.match(check.text,/<section class="workspace"/,'Frozen workspace missing: '+path);
  frozenSmoke.push({path,status:check.status});
 }
 details.unrelatedFrozenTools=frozenSmoke;
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:812});
  const overflow=await page.evaluate(()=>{
   const w=document.querySelector('#workspace');
   return Math.ceil(w.scrollWidth-w.clientWidth);
  });
  assert.ok(overflow<=2,'Live tool has horizontal overflow '+width+'px: '+overflow);
 }
 details.reflow=true;
 details.remoteRequests=requests;
 details.uploadRequests=postMethods;
 details.browserErrors=unexpected;
 details.consoleErrors=cspEvents;
 assert.deepEqual(requests,[],'Live tool makes off-site requests');
 assert.deepEqual(postMethods,[],'Live tool must not upload user files');
 assert.deepEqual(unexpected,[],'Live tool has unexpected JavaScript exceptions');
 console.log('APPLICATION_PREP_LIVE_AUDIT_PASS '+JSON.stringify(details));
 // Missing transport headers are a launch-security blocker, not a false claim
 // that static GitHub Pages applies repository _headers.
 if(!details.response.csp||!details.response.xFrameOptions){
  console.log('APPLICATION_PREP_PUBLIC_SECURITY_GATE_BLOCKED: anti-framing policy is not verified in actual HTTP response.');
 }
}finally{await browser.close();}
