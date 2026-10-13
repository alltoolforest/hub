// Private input stays local. Exercise the actual downloadable candidate, not a substitute worker.
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:412,height:915}}),remote=[];
 await page.route('**/*',route=>{if(/^(file:|blob:)/.test(route.request().url()))return route.continue();remote.push(route.request().url());return route.abort();});
 await page.goto(pathToFileURL(process.env.PDF_COMPRESSOR_MOBILE_QA_OUTPUT).href);
 const rate=Number(process.env.PDF_COMPRESSOR_CPU_RATE??1);
 if(rate!==1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});}
 await page.evaluate(()=>{globalThis.QA_PHASES=[];const el=document.querySelector('[data-status]');new MutationObserver(()=>QA_PHASES.push({message:el.textContent,ms:Math.round(performance.now())})).observe(el,{childList:true,subtree:true,characterData:true});});
 const start=Date.now();await page.locator('#compressor-file').setInputFiles(process.env.PDF_COMPRESSOR_PRIVATE_SOURCE);
 await page.waitForFunction(()=>['ready','failed'].includes(RC_UI.session.snapshot().state),{},{timeout:130000});
 assert.equal(await page.evaluate(()=>RC_UI.session.snapshot().state),'ready');const inspectMs=Date.now()-start;
 await page.locator('#compressor-mode').selectOption('strong');const compressionStart=Date.now();await page.locator('[data-run]').click();
 await page.waitForFunction(()=>['completed','failed'].includes(RC_UI.session.snapshot().state),{},{timeout:130000});
 const evidence=await page.evaluate(()=>{const s=RC_UI.session.snapshot(),r=s.result;return {state:s.state,error:s.error,inputBytes:r?.inputBytes,outputBytes:r?.outputBytes,engineMs:r?.engineMs,verified:r?.integrity?.independentTextVerified,phases:QA_PHASES,workers:RC_RESOURCES};});
 Object.assign(evidence,{inspectMs,compressMs:Date.now()-compressionStart,pageCpuThrottleRate:rate,noRemoteRequests:remote.length===0});
 console.log(JSON.stringify(evidence));if(process.env.PDF_COMPRESSOR_LARGE_EVIDENCE)writeFileSync(process.env.PDF_COMPRESSOR_LARGE_EVIDENCE,JSON.stringify(evidence,null,2));
 assert.equal(evidence.state,'completed');assert.equal(evidence.verified,true);assert.equal(evidence.workers.started,evidence.workers.terminated);assert.deepEqual(remote,[]);
}finally{await browser.close();}
