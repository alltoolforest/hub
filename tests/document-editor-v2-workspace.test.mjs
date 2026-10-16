import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from '../hybrid-build/node_modules/jsdom/lib/api.js';

test('lab workspace opens TXT, edits, undoes and keeps failed replacements intact', async () => {
  const html = await fs.readFile(new URL('../documents/document-editor-v2-lab/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {url:'https://example.invalid/documents/document-editor-v2-lab/'});
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.confirm = () => true;
  await import('../assets/js/document-editor-v2/workspace.js');
  const pick = document.querySelector('#document-v2-file');
  const choose = async (name, value) => {
    const file = new Blob([value]);
    Object.defineProperty(file, 'name', {value:name});
    Object.defineProperty(pick, 'files', {configurable:true,value:[file]});
    pick.dispatchEvent(new dom.window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 30));
  };
  await choose('notes.txt', 'Original');
  let field = document.querySelector('.document-v2-text');
  assert.equal(field?.value, 'Original');
  field.value = 'Expanded text';
  field.dispatchEvent(new dom.window.Event('input'));
  document.querySelector('[data-action=undo]').click();
  await new Promise(resolve => setTimeout(resolve, 10));
  field = document.querySelector('.document-v2-text');
  assert.equal(field.value, 'Original');
  await choose('wrong.txt', new Uint8Array([0, 1, 2]));
  assert.equal(document.querySelector('.document-v2-text').value, 'Original');
  assert.match(document.querySelector('#document-v2-status').textContent, /binary/);
  let downloaded;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = blob => { downloaded = blob; return 'blob:test-export'; };
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    document.querySelector('[data-action=export]').click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(await downloaded.text(), 'Original');
    assert.match(document.querySelector('#document-v2-status').textContent, /Export prepared/);
  } finally { URL.createObjectURL = originalCreate; }
  dom.window.close();
});
