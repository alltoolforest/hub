import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
test('workspace routes native PDF through copied engine with async history and validated export',async()=>{
  const html=await fs.readFile(new URL('../documents/document-editor-v2-lab/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://example.invalid/',pretendToBeVisual:true});
  for(const key of ['document','window','Option','HTMLElement','MutationObserver','Node','Event'])globalThis[key]=dom.window[key];
  globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
  globalThis.cancelAnimationFrame=clearTimeout;globalThis.innerHeight=900;globalThis.confirm=()=>true;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  globalThis.PDFLib=createRequire(import.meta.url)('../assets/vendor/pdf-lib.js');
  const base='../documents/document-editor-v2-lab/pdf-engine/fortress/src/';
  const {PDFDocument,StandardFonts}=await import(base+'core/pdf-lib.js');
  const {PdfRenderer}=await import(base+'rendering/renderer.js');
  PdfRenderer.prototype.render=async function(index,canvas,{scale=1}={}){const page=await this.getPage(index),viewport=page.getViewport({scale});return {viewport,matrix:[...viewport.transform],cssWidth:viewport.width,cssHeight:viewport.height};};
  const {extractPageText}=await import(base+'export/extraction-validator.js');
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612,792]).drawText('Original sample text',{x:60,y:700,size:12,font});
  const formField=pdf.getForm().createTextField('Customer');formField.setText('Preserved customer');formField.addToPage(pdf.getPage(0),{x:50,y:100,width:180,height:30});
  const file=new Blob([await pdf.save({useObjectStreams:false})]);Object.defineProperty(file,'name',{value:'sample.pdf'});
  let storedDraft=null;
  globalThis.indexedDB={open(){
    const request={};
    queueMicrotask(()=>{request.result={close(){},transaction(){
      const transaction={objectStore(){return {
        get(){return perform(()=>storedDraft);},
        put(value){return perform(()=>{storedDraft=structuredClone(value);storedDraft.file=value.file;return 'current';});},
        delete(){return perform(()=>{storedDraft=null;});}
      };}};
      function perform(operation){const result={};queueMicrotask(()=>{result.result=operation();result.onsuccess?.();queueMicrotask(()=>transaction.oncomplete?.());});return result;}
      return transaction;
    }};request.onsuccess();});return request;
  }};
  await import('../assets/js/document-editor-v2/workspace.js');
  const picker=document.querySelector('#document-v2-file');
  Object.defineProperty(picker,'files',{value:[file]});picker.dispatchEvent(new dom.window.Event('change'));
  const status=()=>document.querySelector('#document-v2-status').textContent;
  const wait=async check=>{for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error(status());};
  await wait(()=>!!document.querySelector('[aria-label="Edit text: Original sample text"]'));
  await wait(()=>!picker.disabled);
  document.querySelector('[aria-label="Edit text: Original sample text"]').click();
  const input=document.querySelector('[aria-label="Edit PDF text"]');input.value='Updated sample text';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  document.querySelector('.pdf-done').click();
  // Export in the same turn as Done, before validation/preview commit finishes.
  let immediateDownload;const createURL=URL.createObjectURL;
  URL.createObjectURL=blob=>{immediateDownload=blob;return 'blob:immediate-pdf-test';};
  dom.window.HTMLAnchorElement.prototype.click=function(){};
  document.querySelector('[data-action=export]').click();
  await wait(()=>!!immediateDownload);await wait(()=>!picker.disabled);
  assert.match(await extractPageText(new Uint8Array(await immediateDownload.arrayBuffer()),0),/Updated sample text/);
  const formExport=await PDFDocument.load(await immediateDownload.arrayBuffer());
  assert.equal(formExport.getForm().getTextField('Customer').getText(),'Preserved customer');
  assert.match(status(),/Export prepared/);
  await new Promise(resolve=>setTimeout(resolve,750));assert.match(status(),/Export prepared/,'autosave must not obscure export outcome');
  URL.createObjectURL=createURL;
  await wait(()=>!document.querySelector('[aria-label="Edit PDF text"]'));
  const undo=document.querySelector('[data-action=undo]'),redo=document.querySelector('[data-action=redo]');
  await wait(()=>!undo.disabled);
  await wait(()=>storedDraft?.snapshot?.state?.native?.transactions?.length===1);
  assert.equal(storedDraft.snapshot.state.native.transactions[0].replacementUnicode,'Updated sample text');
  undo.click();await wait(()=>!picker.disabled);
  assert.ok(document.querySelector('[aria-label="Edit text: Original sample text"]'));
  redo.click();await wait(()=>!picker.disabled);
  assert.ok(document.querySelector('[aria-label="Edit text: Updated sample text"]'));
  let downloaded;const originalURL=URL.createObjectURL;
  URL.createObjectURL=blob=>{downloaded=blob;return 'blob:pdf-test';};
  dom.window.HTMLAnchorElement.prototype.click=function(){};
  document.querySelector('[data-action=export]').click();await wait(()=>!!downloaded);
  assert.match(await extractPageText(new Uint8Array(await downloaded.arrayBuffer()),0),/Updated sample text/);
  await wait(()=>!picker.disabled);
  // The restore UI must recreate the engine from the stored draft.
  document.querySelector('#document-v2-restore').click();
  await wait(()=>status().includes('Recovered local draft'));
  assert.ok(document.querySelector('[aria-label="Edit text: Updated sample text"]'));
  const searchPanel=document.querySelector('.document-v2-search');
  const [find,replaceWith]=searchPanel.querySelectorAll('input[type=text]');
  find.value='Updated';find.dispatchEvent(new dom.window.Event('input'));
  const searchButton=label=>[...searchPanel.querySelectorAll('button')].find(button=>button.textContent===label);
  searchButton('Search').click();await wait(()=>searchPanel.textContent.includes('1 matches'));
  replaceWith.value='Edited';searchButton('Replace all').click();
  await wait(()=>searchPanel.textContent.includes('1 replacements applied'));
  assert.ok(document.querySelector('[aria-label="Edit text: Edited sample text"]'));
  await wait(()=>storedDraft?.snapshot?.state?.native?.transactions?.[0]?.replacementUnicode==='Edited sample text');
  find.value='Edited';find.dispatchEvent(new dom.window.Event('input'));
  searchButton('Search').click();await wait(()=>searchPanel.textContent.includes('1 matches'));
  replaceWith.value='Extremely long replacement '.repeat(100);
  searchButton('Replace all').click();await wait(()=>!searchButton('Replace all').disabled);
  assert.ok(document.querySelector('[aria-label="Edit text: Edited sample text"]'),'unsafe replacement must leave the existing text intact');
  assert.ok(!searchPanel.textContent.includes('replacements applied'));
  undo.click();await wait(()=>!picker.disabled);
  assert.ok(document.querySelector('[aria-label="Edit text: Updated sample text"]'));
  document.querySelector('[aria-label="Edit text: Updated sample text"]').click();
  const pending=document.querySelector('[aria-label="Edit PDF text"]');pending.value='Unfinished';
  pending.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  undo.click();await wait(()=>!picker.disabled);
  assert.equal(document.querySelector('[aria-label="Edit PDF text"]').value,'Unfinished');
  assert.match(status(),/finish|Finish/);
  URL.createObjectURL=originalURL;dom.window.close();
});
