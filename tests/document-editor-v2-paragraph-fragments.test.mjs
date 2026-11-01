import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {fragmentWordParagraph} from '../assets/js/document-editor-v2/word-paragraph-fragments.js';
function fixture(text='Original words with bold formatting. '.repeat(20)){
 const dom=new JSDOM('<main><div><div data-word-source="0" data-word-part="0" contenteditable="true"><b></b></div></div></main>'),field=dom.window.document.querySelector('[data-word-source]');field.firstChild.textContent=text;
 dom.window.HTMLElement.prototype.getBoundingClientRect=function(){return {height:Math.ceil(this.textContent.length/(parseFloat(this.style.width)||20))*10};};
 return {dom,field,block:field.parentNode,text};
}
test('visual fragments retain one field and restoration retains edits and listeners',()=>{
 const {field,block,text}=fixture(),placements=[];let changes=0;field.addEventListener('input',()=>changes++);
 const result=fragmentWordParagraph(block,{columns:[20,40],height:30,remaining:20,advance(){},place(node){placements.push(node);}});
 assert.ok(result);assert.ok(placements.length>2);assert.equal(block.querySelectorAll('[data-word-source]').length,1);assert.equal(field.textContent,text);assert.ok(placements.every(node=>node.querySelector('b')));
 placements[1].querySelector('b').firstChild.insertData(0,'EDIT ');field.dispatchEvent(new field.ownerDocument.defaultView.Event('input'));const edited=field.textContent;result.restore();result.restore();
 assert.equal(field.textContent,edited);assert.equal(changes,1);assert.equal(field.querySelector('[data-word-layout-fragment]'),null);assert.equal(field.getAttribute('contenteditable'),'true');assert.equal(field.style.height,'');
});
test('paragraphs exceeding the measurement budget stay intact',()=>{
 const {field,block,text}=fixture('x'.repeat(1_000_001));const original=field.firstChild;
 assert.equal(fragmentWordParagraph(block,{columns:[20,40],height:30,remaining:20,advance(){throw Error('must not advance');},place(){throw Error('must not place');}}),null);
 assert.equal(field.textContent,text);assert.equal(field.firstChild,original);assert.equal(field.ownerDocument.querySelector('[aria-hidden]'),null);
});
