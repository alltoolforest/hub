import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const editor=readFileSync(new URL('../assets/js/editor.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/csv-cleaner.css',import.meta.url),'utf8');
const page=readFileSync(new URL('../documents/csv-cleaner/index.html',import.meta.url),'utf8');
test('CSV-only stylesheet and scoped selectors',()=>{
 assert.match(page,/assets\/css\/csv-cleaner\.css/);
 assert.match(css,/body\[data-tool="csv-cleaner"\]/);
 assert.match(css,/overflow:auto/);
 assert.match(css,/position:sticky/);
});
test('CSV table provides labelled region and live navigation updates',()=>{
 assert.match(editor,/Scrollable CSV data table/);
 assert.match(editor,/aria-live':'polite'/);
 assert.match(editor,/scope:'col'/);
 assert.match(editor,/scope:'row'/);
});
test('user receives edit guidance and unsaved state warnings',()=>{
 assert.match(editor,/Swipe or scroll sideways/);
 assert.match(editor,/markCsvDirty\(\)/);
 assert.match(editor,/beforeunload/);
 assert.match(editor,/Open another file and discard them/);
 assert.match(editor,/Changing import settings reloads/);
 assert.match(editor,/Discard unsaved CSV edits and clear the workspace/);
});
test('styles cannot accidentally target unrelated tools',()=>{
 for(const selector of css.split('\n').filter(s=>s.trim()&&s.includes('{'))){
  assert.match(selector,/body\[data-tool="csv-cleaner"\]/);
 }
});
