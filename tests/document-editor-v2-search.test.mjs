import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';
import {findMatches, mountFindReplace} from '../assets/js/document-editor-v2/find-replace.js';
import {replaceRunRange} from '../assets/js/document-editor-v2/docx-package.js';

test('literal search handles punctuation, Unicode word boundaries and protected text', () => {
  const entries = [{id:0,text:'Cat cat cats [cat] café décafé 😀cat'}, {id:1,text:'cat',protected:true}];
  assert.equal(findMatches(entries,'cat').length,5);
  assert.equal(findMatches(entries,'cat',{wholeWord:true}).length,4);
  assert.equal(findMatches(entries,'cat',{matchCase:true,wholeWord:true}).length,3);
  assert.equal(findMatches(entries,'[cat]').length,1);
  assert.equal(findMatches(entries,'café',{wholeWord:true}).length,1);
  assert.deepEqual(findMatches(entries,''),[]);
});
test('explicit replacement retains the selected repeated run and surrounding styles', () => {
  assert.deepEqual(replaceRunRange(['cat ', 'cat', ' cat'],4,7,'dog'),['cat ','dog',' cat']);
  assert.deepEqual(replaceRunRange(['abc','def','ghi'],2,7,'X'),['abX','','hi']);
  assert.throws(() => replaceRunRange(['abc'],2,9,'x'), /range/);
});
test('find controls navigate, replace literal dollars, and batch replace as one history change', () => {
  const dom = new JSDOM('<main></main>'); globalThis.document = dom.window.document;
  let value = 'cat cat cat', changes = 0, selected;
  const host = document.querySelector('main');
  mountFindReplace(host, {
    entries: () => [{id:0,text:value}],
    replace: ({start,end}, text) => { value = value.slice(0,start) + text + value.slice(end); },
    reveal: match => { selected = match; }
  }, () => changes++);
  const [query,replacement] = host.querySelectorAll('input[type=text]');
  query.value = 'cat'; query.dispatchEvent(new dom.window.Event('input'));
  const [previous,next,replace,all] = host.querySelectorAll('button');
  previous.click(); assert.equal(selected.start,8);
  next.click(); assert.equal(selected.start,0);
  replacement.value = '$&'; replace.click();
  assert.equal(value,'$& cat cat'); assert.equal(changes,1);
  replacement.value = 'dog'; all.click();
  assert.equal(value,'$& dog dog'); assert.equal(changes,2);
  assert.equal(all.disabled,true);
  dom.window.close();
});
