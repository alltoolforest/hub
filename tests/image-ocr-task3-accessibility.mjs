// Image-to-Text OCR Task 3: tool-scoped automated WCAG and keyboard audit.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import axe from 'axe-core';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:375,height:812}});
try{
 await page.goto('http://127.0.0.1:8765/documents/image-to-text/',{waitUntil:'networkidle'});
 await page.locator('#file-input').waitFor();
 await page.addScriptTag({content:axe.source});
 const rules=await page.evaluate(async()=>window.axe.run(document.querySelector('#workspace'),{
  runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']},
  resultTypes:['violations']
 }));
 for(const violation of rules.violations){
  console.log('WCAG_REPORT: '+violation.impact+' '+violation.id+' '+violation.nodes.map(n=>n.target.join(' ')).join('; '));
 }
 const serious=rules.violations.filter(v=>['serious','critical'].includes(v.impact));
 assert.equal(serious.length,0,'OCR workspace has serious WCAG violations: '+serious.map(v=>v.id).join(','));
 // Keyboard focus: OCR source chooser, preparation controls and text editor are reachable.
 const focus=[];
 for(let i=0;i<18;i++){
  await page.keyboard.press('Tab');
  focus.push(await page.evaluate(()=>document.activeElement?.id||document.activeElement?.textContent?.trim()?.slice(0,30)||''));
 }
 assert.ok(focus.includes('file-input'),'Keyboard focus must reach the upload input: '+JSON.stringify(focus));
 assert.ok(focus.includes('ocr-rotate'),'Keyboard focus must reach rotation selector: '+JSON.stringify(focus));
 assert.ok(focus.includes('ocr-prepare'),'Keyboard focus must reach contrast selector: '+JSON.stringify(focus));
 assert.ok(focus.includes('ocr-text'),'Keyboard focus must reach editable result: '+JSON.stringify(focus));
 console.log('IMAGE_OCR_TASK3_A11Y_PASS: no serious/critical WCAG workspace violations; keyboard reaches source and result controls');
}finally{await browser.close();}
