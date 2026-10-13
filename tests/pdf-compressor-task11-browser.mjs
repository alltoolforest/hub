import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {buildFixture} from './pdf-compressor-task1-fixtures.mjs';
import {readFileSync} from 'node:fs';
const selected=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const browser=await ({chromium,firefox,webkit}[selected]).launch();
try{
  const page=await browser.newPage({viewport:{width:320,height:740}}),remote=[];
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin==='http://127.0.0.1:8766')return route.continue();
    remote.push(route.request().url());return route.abort();
  });
  await page.goto('http://127.0.0.1:8766/');
  await page.evaluate(async()=>{
    document.body.innerHTML='<main id="app"></main>';
    const css=document.createElement('link');css.rel='stylesheet';css.href='/assets/js/pdf-compressor-v2/compressor-ui.css';document.head.append(css);
    const {mountCompressor}=await import('/assets/js/pdf-compressor-v2/compressor-ui.mjs');
    const {createWorkerBridge}=await import('/assets/js/pdf-compressor-v2/worker-bridge.mjs');
    const {INPUT_LIMITS}=await import('/assets/js/pdf-compressor-v2/input-inspector.mjs');
    globalThis.ui=mountCompressor(document.querySelector('#app'),{limits:INPUT_LIMITS,
      engine:createWorkerBridge({fileInput:true,workerFactory:()=>new Worker('/tests/pdf-compressor-task11-worker.mjs',{type:'module'}),
        onProgress:stage=>globalThis.ui?.progress(stage)})});
  });
  assert.equal(await page.locator('h1').textContent(),'PDF Compressor');
  await page.addScriptTag({content:readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url),'utf8')});
  const accessibility=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(accessibility.violations.map(v=>({id:v.id,impact:v.impact})),[]);
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.setViewportSize({width:320,height:740});
  const {bytes}=await buildFixture('mixed');
  await page.locator('#compressor-file').setInputFiles({name:'<script>alert(1)</script>.pdf',mimeType:'application/pdf',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>ui.session.snapshot().state==='ready');
  assert.match(await page.locator('[data-source]').textContent(),/<script>/);
  assert.equal(await page.locator('[data-source] script').count(),0);
  await page.locator('#compressor-mode').selectOption('lossless');
  assert.match(await page.locator('#compressor-quality').textContent(),/without reducing image quality/);
  await page.locator('[data-run]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>ui.session.snapshot().state==='completed',{},{timeout:60000});
  assert.equal(await page.locator('[data-result]').isVisible(),true);
  assert.equal(await page.locator('[data-download]').getAttribute('href').then(x=>x.startsWith('blob:')),true);
  assert.equal(await page.locator('[data-status]').getAttribute('aria-live'),'polite');
  assert.match(await page.locator('[data-output]').textContent(),/KB|MB/);
  await page.locator('[data-clear]').click();
  assert.equal(await page.locator('[data-result]').isVisible(),false);
  assert.equal(await page.locator('[data-download]').getAttribute('href'),null);
  await page.evaluate(()=>ui.dispose());assert.deepEqual(remote,[]);
  console.log('Task 11 '+selected+': verified worker flow, 4 viewport widths, keyboard activation, literal filename, result and reset PASS');
}finally{await browser.close();}
