import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as csvModule from '../assets/js/csv-cleaning.js';

const editor=readFileSync(new URL('../assets/js/editor.js',import.meta.url),'utf8');

test('CSV post-import controls receive an actual boolean hidden value',()=>{
  const match=editor.match(/cleanActions\.hidden=([^;]+);if\(csvCleanActions\)/);
  assert.ok(match,'CSV post-import hidden assignment must be present');
  const calculate=new Function('csvClean','sheets','return ('+match[1]+');');
  // An ES-module namespace cannot be converted to a primitive in WebIDL,
  // reproducing the source of the HTML element setter failure on CSV upload.
  for(const [engine,data,wanted] of [
    [csvModule,[{rows:[['a']]}],true],
    [csvModule,[],true],
    [null,[{rows:[['a']]}],false],
    [null,[],true]
  ]){
    const actual=calculate(engine,data);
    assert.equal(typeof actual,'boolean','Never assign a module object to HTMLElement.hidden');
    assert.equal(actual,wanted);
    const element={set hidden(value){String(value);this.hiddenValue=value;}};
    assert.doesNotThrow(()=>{element.hidden=actual;});
  }
});
test('hidden assignment does not contain an uncoerced CSV module namespace',()=>{
  assert.doesNotMatch(editor,/cleanActions\.hidden=csvClean\|\|/);
  assert.match(editor,/cleanActions\.hidden=!!csvClean\|\|!sheets\.length/);
});
