// Isolated proof-of-compatibility for LGPL-licensed heic-to/csp, not used by production.
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const name=process.env.BROWSER||'chromium';
const type={chromium,firefox,webkit}[name];
if(!type)throw Error('Unknown browser');
const browser=await type.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[],external=[],cspViolations=[];
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const u=r.url();if(u.startsWith('http')&&!u.startsWith(base+'/'))external.push(u)});
try{
 await page.goto(base+'/security/application-prep/experiments/csp-test.html',{waitUntil:'networkidle'});
 assert.ok(!(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).includes("'unsafe-eval'"));
 await page.evaluate(()=>{
  window.securityViolations=[];
  document.addEventListener('securitypolicyviolation',e=>window.securityViolations.push({
   name:e.violatedDirective, blocked:e.blockedURI
  }));
 });
 // Fixture is provided through test harness and never uploaded by a site request.
 const upstream='https://raw.githubusercontent.com/alexcorvi/heic2any/169513b18329dbcb4dd5f86550aac6e975f0acf9/demo/1.heic';
 const raw=await fetch(upstream,{signal:AbortSignal.timeout(30000)});
 assert.equal(raw.status,200,'Pinned HEIC sample unavailable');
 const buffer=Buffer.from(await raw.arrayBuffer());
 assert.ok(buffer.length>3000);
 await page.locator('#candidate').setInputFiles({name:'camera.heic',mimeType:'image/heic',buffer});
 const outcome=await page.evaluate(async()=>{
  const {heicTo}=await import('/node_modules/heic-to/dist/csp/heic-to.js');
  const original=document.querySelector('#candidate').files[0];
  const png=await heicTo({blob:original,type:'image/png'});
  const bitmap=await createImageBitmap(png);
  const pixels={width:bitmap.width,height:bitmap.height};
  bitmap.close();
  const jpeg=await heicTo({blob:original,type:'image/jpeg',quality:0.91});
  const header=new Uint8Array(await jpeg.slice(0,4).arrayBuffer());
  return {pixels,pngSize:png.size,jpgSize:jpeg.size,
   pngType:png.type,jpgType:jpeg.type,jpgHeader:[...header],
   cspViolations:window.securityViolations};
 });
 assert.ok(outcome.pixels.width>0&&outcome.pixels.height>0);
 assert.equal(outcome.pngType,'image/png');
 assert.equal(outcome.jpgType,'image/jpeg');
 assert.deepEqual(outcome.jpgHeader.slice(0,2),[255,216]);
 assert.equal(outcome.cspViolations.filter(v=>/eval|script-src/.test(v.name)).length,0,
  'The replacement requested eval, which must remain forbidden');
 assert.deepEqual(external,[],'Page must not send data to any off-origin endpoint');
 assert.deepEqual(errors,[],'No uncaught browser exceptions');
 console.log('HEIC_CSP_EXPERIMENT_PASS '+JSON.stringify({
  browser:name,version:'1.6.6',license:'LGPL-3.0',
  pixels:outcome.pixels,pngBytes:outcome.pngSize,jpgBytes:outcome.jpgSize,
  evalDisabled:true,externalRequests:external.length,violations:outcome.cspViolations
 }));
}finally{await browser.close();}
