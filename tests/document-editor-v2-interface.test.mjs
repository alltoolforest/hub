import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
test('optional PDF panels retain their controls and handlers when grouped',async()=>{
 const dom=new JSDOM('<div id="stage"><div><p role="status">Ready</p><div><div class="hybrid-pdf-editor"><button>Edit</button></div></div><details><summary>Images</summary><button>Apply</button></details></div></div>');
 globalThis.document=dom.window.document;globalThis.MutationObserver=dom.window.MutationObserver;
 try{const {simplifyDocumentInterface}=await import('../assets/js/document-editor-v2/interface.js');const stage=document.querySelector('#stage'),panel=stage.querySelector('details'),button=panel.querySelector('button');let clicks=0;button.onclick=()=>clicks++;
 const stop=simplifyDocumentInterface(stage);assert.equal(stage.querySelectorAll('[data-editor-more]').length,1);assert.equal(panel.parentElement.dataset.editorMore,'');assert.equal(panel.querySelector('button'),button);button.click();assert.equal(clicks,1);assert.equal(stage.querySelector('.hybrid-pdf-editor button').textContent,'Edit');
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(stage.querySelectorAll('[data-editor-more]').length,1);assert.equal(stage.querySelector('[role=status]').textContent,'Ready');stop();
 }finally{delete globalThis.document;delete globalThis.MutationObserver;dom.window.close();}
});
test('Word, text and spreadsheet menus preserve editors, values and actions through rerenders',async()=>{
 const dom=new JSDOM('<div id="stage"></div>');globalThis.document=dom.window.document;
 try{const {simplifyDocumentInterface}=await import('../assets/js/document-editor-v2/interface.js');const stage=document.querySelector('#stage'),stop=simplifyDocumentInterface(stage);
 for(const [html,key,editor]of [
 ['<div aria-label="Word paragraph formatting"><input value="Calibri"><button>Apply</button></div><p role="status">Select text</p><details><summary>Paragraph layout</summary></details><div contenteditable="true">Original</div>','format','[contenteditable]'],
 ['<div class="document-v2-actions"><input value="16"><button>Go</button></div><textarea class="document-v2-text">Original</textarea><details><summary>Find and replace</summary></details>','view','textarea'],
 ['<div class="document-v2-tabs">Sheet 1</div><form><input aria-label="Go to cell" value="B12"><button>Go</button></form><div class="document-v2-grid"><input data-cell="A1" value="Original"></div>','jump','.document-v2-grid']]){
 stage.innerHTML=html;const original=stage.querySelector(editor),button=stage.querySelector('button'),input=stage.querySelector('input'),value=input.value;let calls=0;button.onclick=event=>{event.preventDefault();calls++;};
 await new Promise(resolve=>setTimeout(resolve,0));assert.ok(stage.querySelector(`[data-editor-menu="${key}"]`));assert.equal(stage.querySelector(editor),original);assert.equal(input.value,value);assert.equal(original.closest('[data-editor-menu]'),null);button.click();assert.equal(calls,1);
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(stage.querySelectorAll(`[data-editor-menu="${key}"]`).length,1);
 }stop();
 }finally{delete globalThis.document;dom.window.close();}
});
