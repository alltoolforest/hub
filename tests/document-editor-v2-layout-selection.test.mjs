import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {captureLayoutSelection} from '../assets/js/document-editor-v2/word-layout-selection.js';
test('reflow restores backward selection after moving original table cells',()=>{
 const dom=new JSDOM('<main><table><tbody><tr><td>Alpha</td></tr><tr><td>Bravo</td></tr></tbody></table><table></table></main>');
 const doc=dom.window.document,root=doc.querySelector('main'),[a,b]=[...doc.querySelectorAll('td')].map(n=>n.firstChild),selection=dom.window.getSelection();
 selection.setBaseAndExtent(b,4,a,1);const restore=captureLayoutSelection(root);doc.querySelectorAll('table')[1].append(b.parentNode.parentNode);restore();
 assert.equal(selection.anchorNode,b);assert.equal(selection.anchorOffset,4);assert.equal(selection.focusNode,a);assert.equal(selection.focusOffset,1);
});
test('reflow does not restore detached selection endpoints or outside selections',()=>{
 const dom=new JSDOM('<main>Alpha</main><aside>Other</aside>'),doc=dom.window.document,root=doc.querySelector('main'),s=dom.window.getSelection();
 s.setBaseAndExtent(root.firstChild,1,root.firstChild,3);const restore=captureLayoutSelection(root);root.replaceChildren();assert.doesNotThrow(restore);
 const outside=doc.querySelector('aside').firstChild;s.setBaseAndExtent(outside,0,outside,2);captureLayoutSelection(root)();assert.equal(s.anchorNode,outside);assert.equal(s.toString(),'Ot');
});
