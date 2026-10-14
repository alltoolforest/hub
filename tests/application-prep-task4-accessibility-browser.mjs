// Task 4 — real-browser guided workflow, keyboard accessibility, status/error announcements,
// size validation, output freshness, and narrow-viewport reflow.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {chromium,firefox,webkit} from 'playwright';
const kind=process.env.BROWSER||'chromium';
const browser=await ({chromium,firefox,webkit}[kind]).launch({headless:true});
const page=await browser.newPage({viewport:{width:375,height:812},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.SITE_URL||'http://127.0.0.1:8765';
const ready=(selector,text)=>page.waitForFunction(([s,v])=>
 document.querySelector(s)?.textContent?.includes(v),[selector,text],{timeout:20000});
try{
 await page.goto(base+'/documents/application-document-prep/',{waitUntil:'networkidle'});
 await page.locator('#app-workflow').waitFor();
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const checkA11y=async state=>{
  const audit=await page.evaluate(async()=>{
   return window.axe.run('#workspace',{
    runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}
   });
  });
  const severe=audit.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
  assert.equal(severe.length,0,state+' accessibility violations: '+severe.map(v=>
   v.id+': '+v.nodes.map(n=>n.target.join(' ')).join(', ')).join('; '));
 };
 await checkA11y('initial workspace');
 const steps=await page.locator('#workspace .app-step-title').allTextContents();
 assert.deepEqual(steps,[
  '1. Choose a preparation type','2. Select your photo, signature or image',
  '3. Enter your application requirements','5. Create and check the finished file'
 ]);
 assert.ok(await page.locator('#app-workflow').evaluate(n=>
  n.compareDocumentPosition(document.querySelector('#file-input')) & Node.DOCUMENT_POSITION_FOLLOWING));
 const mode=page.locator('#app-workflow');
 assert.equal(await mode.getAttribute('aria-describedby'),'app-mode-help');
 await mode.selectOption('signature');
 await ready('.app-guidance','Signature:');
 assert.match(await page.locator('.app-guidance').textContent(),/stroke|JPG/);
 await page.locator('#fit').selectOption('cover');
 await ready('#app-fit-help','may cut off faces');
 await page.locator('#fit').selectOption('contain');
 await ready('#app-fit-help','may add borders');
 await page.locator('#format').selectOption('image/webp');
 await ready('#app-format-help','may not be accepted');
 await page.locator('#format').selectOption('image/png');
 await ready('#app-format-help','transparency');

 // Inline contradictory KB message is discoverable, referenced and reversible.
 await page.locator('#min-kb').fill('60');
 await page.locator('#target').fill('30');
 assert.equal(await page.locator('#min-kb').getAttribute('aria-invalid'),'true');
 assert.equal(await page.locator('#target').getAttribute('aria-invalid'),'true');
 await ready('#app-size-error','Minimum KB must not exceed maximum KB');
 assert.equal(await page.locator('#app-size-error').isVisible(),true);
 await page.locator('#target').fill('0');
 assert.equal(await page.locator('#app-size-error').isVisible(),false);
 assert.equal(await page.locator('#min-kb').getAttribute('aria-invalid'),null);
 await page.locator('#min-kb').fill('0');

 const sample=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=140;c.height=80;
  const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,140,80);
  ctx.fillStyle='black';ctx.fillRect(35,18,70,40);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#file-input').setInputFiles({
  name:'example-signature.png',mimeType:'image/png',buffer:Buffer.from(sample,'base64')
 });
 await ready('.selected-files','Selected: example-signature.png');
 const crop=page.locator('.app-crop-panel');
 assert.equal(await crop.isVisible(),true);
 assert.match(await crop.locator('h2').textContent(),/4\. Crop the image/);
 for(const id of ['app-crop-x','app-crop-y','app-crop-w','app-crop-h']){
  assert.equal(await page.locator('#'+id).getAttribute('aria-describedby'),'app-crop-help');
  assert.ok(await page.locator('#'+id).evaluate(n=>Boolean(n.labels?.length)));
 }
 assert.match(await page.locator('.canvas-frame canvas').getAttribute('aria-label'),/keyboard alternative/);
 await page.locator('#app-crop-x').fill('25');
 await page.locator('#app-crop-w').fill('50');
 await page.getByRole('button',{name:'Apply crop values'}).press('Enter');
 await ready('.app-crop-help','Crop applied');
 assert.equal(await page.locator('#width').inputValue(),'70');
 assert.equal(await page.locator('#height').inputValue(),'80');

 // Existing mode changes never erase user's file, crop or dimensions.
 await mode.selectOption('photo');
 assert.equal(await page.locator('#width').inputValue(),'70');
 assert.equal(await page.locator('#app-crop-x').inputValue(),'25');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await ready('.app-review-help','facial features');
 assert.equal(await page.locator('#downloads').getAttribute('role'),'region');
 assert.equal(await page.locator('#downloads').getAttribute('aria-label'),'Generated file download');
 await checkA11y('generated output workspace');
 await page.locator('#height').fill('78');
 assert.equal(await page.locator('.app-output-status').getAttribute('data-output-state'),'outdated');
 await ready('.app-output-status','Outdated result');
 assert.match(await page.locator('#downloads a[download]').getAttribute('aria-label'),/previous result/);
 assert.equal(await page.locator('#downloads .download-row').getAttribute('data-output-state'),'outdated');
 assert.equal(await page.locator('#downloads a[download]').count(),1);

 // Shared action errors become focused role=alert only within this tool.
 await page.locator('#min-kb').fill('99');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await ready('#status','below the requested minimum');
 await page.waitForFunction(()=>document.activeElement?.id==='status');
 assert.equal(await page.locator('#status').getAttribute('role'),'alert');
 assert.equal(await page.locator('#downloads a[download]').count(),1);
 await page.locator('#min-kb').fill('0');
 await page.getByRole('button',{name:'Create image',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-output-status')?.dataset.outputState==='verified');
 assert.equal(await page.locator('#status').getAttribute('role'),'status');
 assert.equal(await page.locator('#downloads a[download]').count(),1);

 // Narrow-width and enlarged-text checks are scoped to the application workspace.
 for(const width of [320,375,768,1280]){
  await page.setViewportSize({width,height:812});
  const x=await page.evaluate(()=>{
   const workspace=document.querySelector('#workspace');
   const controls=[...workspace.querySelectorAll('button')].filter(b=>b.offsetParent!==null);
   return {overflow:Math.ceil(workspace.scrollWidth-workspace.clientWidth),
    clipped:controls.filter(b=>b.getBoundingClientRect().right>
      workspace.getBoundingClientRect().right+3).length};
  });
  assert.ok(x.overflow<=2,'Horizontal workspace overflow at '+width+': '+x.overflow);
  assert.equal(x.clipped,0,'Clipped buttons at '+width);
 }
 await page.setViewportSize({width:320,height:812});
 await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
 const extra=await page.evaluate(()=>Math.ceil(document.querySelector('#workspace').scrollWidth-
  document.querySelector('#workspace').clientWidth));
 assert.ok(extra<=2,'Narrow workspace overflow with enlarged root text: '+extra);
 // Show a clearly visible focus outline on keyboard navigable elements.
 await page.locator('#width').focus();
 const outline=await page.locator('#width').evaluate(n=>getComputedStyle(n).outlineStyle);
 assert.notEqual(outline,'none');
 assert.deepEqual(errors,[]);
 console.log('TASK4_ACCESSIBILITY_BROWSER_PASS '+kind+
  ': guided mode, contextual explanations, keyboard crop, range errors, verified/stale links, focus alerts, zoom/reflow');
}finally{await browser.close();}
