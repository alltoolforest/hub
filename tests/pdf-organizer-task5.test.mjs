// Task 5 compatibility and release integration regression.
// Run: node --test tests/pdf-organizer-task5.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ensurePdfPreviewCompatibility} from '../assets/js/pdf-organizer-compat.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('guarded Map upsert compatibility does not override a native implementation', () => {
  const old = Object.getOwnPropertyDescriptor(Map.prototype, 'getOrInsertComputed');
  try {
    const native = function nativeShim() { return 123; };
    Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
      value: native, writable: true, configurable: true
    });
    assert.equal(ensurePdfPreviewCompatibility(), false);
    assert.equal(Map.prototype.getOrInsertComputed, native);
  } finally {
    if (old) Object.defineProperty(Map.prototype, 'getOrInsertComputed', old);
    else delete Map.prototype.getOrInsertComputed;
  }
});

test('Map upsert compatibility only computes on absent keys, including undefined', () => {
  const old = Object.getOwnPropertyDescriptor(Map.prototype, 'getOrInsertComputed');
  try {
    delete Map.prototype.getOrInsertComputed;
    assert.equal(ensurePdfPreviewCompatibility(), true);
    assert.equal(ensurePdfPreviewCompatibility(), false);
    const map = new Map();
    let called = 0;
    assert.equal(map.getOrInsertComputed('foo', key => { called++; return key.length; }), 3);
    assert.equal(map.getOrInsertComputed('foo', () => { called++; return -1; }), 3);
    assert.equal(called, 1);
    assert.equal(map.getOrInsertComputed('none', () => undefined), undefined);
    assert.equal(map.has('none'), true);
    assert.equal(map.getOrInsertComputed('none', () => 8), undefined);
    assert.throws(() => map.getOrInsertComputed('x', null), TypeError);
    assert.throws(() => Map.prototype.getOrInsertComputed.call({}, 'x', () => 1), TypeError);
    assert.equal(Object.keys(Map.prototype).includes('getOrInsertComputed'), false);
  } finally {
    if (old) Object.defineProperty(Map.prototype, 'getOrInsertComputed', old);
    else delete Map.prototype.getOrInsertComputed;
  }
});

test('PDF.js browser compatibility is loaded only by the organizer preview entry point', () => {
  const source = read('assets/js/pdf-organizer.js');
  const compatibility = read('assets/js/pdf-organizer-compat.js');
  assert.match(source, /import \{ensurePdfPreviewCompatibility\} from '\.\/pdf-organizer-compat\.js'/);
  assert.match(source, /openPreviewDocument\(bytes\) \{\s*ensurePdfPreviewCompatibility\(\);\s*const pdfjs/);
  assert.doesNotMatch(compatibility, /fetch\(|XMLHttpRequest|document\.cookie|innerHTML/);
  assert.match(compatibility, /typeof Map\.prototype\.getOrInsertComputed === 'function'/);
});

test('site PDF rendering remains linked to the unmodified vendor manifest', () => {
  const manifest = JSON.parse(read('assets/vendor/manifest.json'));
  assert.equal(manifest.pdfjs.module, 'assets/vendor/pdf.mjs');
  assert.equal(manifest.pdf.script, 'assets/vendor/pdf-lib.js');
  const source = read('assets/js/pdf-organizer.js');
  assert.match(source, /load\('pdfjs'\)/);
  assert.match(source, /assets\/vendor\/pdf\.worker\.mjs/);
  assert.match(source, /isEvalSupported: false/);
});
