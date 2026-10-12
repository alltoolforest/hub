// Organizer Task 4 hardening only.
// Run: node --test tests/pdf-organizer-task4.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const previews = await import('data:text/javascript;base64,' +
  Buffer.from(read('assets/js/pdf-organizer-thumbnails.js')).toString('base64'));
const {OrganizerThumbnails} = previews;

class Holder {
  constructor(width = 180) {
    this.width = width;
    this.children = [];
    this._text = '';
  }
  getBoundingClientRect() { return {width: this.width}; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text; }
  replaceChildren(...children) { this.children = children; this._text = ''; }
  querySelector(name) { return this.children.find(x => x.tag === name) || null; }
}
const observer = () => {
  let notify, disconnected = 0;
  return {
    factory(callback) {
      notify = callback;
      return {observe() {}, disconnect() { disconnected++; }};
    },
    trigger(entries) {
      notify(entries.map(([target, visible]) =>
        ({target, isIntersecting: visible})));
    },
    stats: () => ({disconnected})
  };
};
const setupDom = async action => {
  const previous = globalThis.document;
  const oldRatio = globalThis.devicePixelRatio;
  const canvases = [];
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw Error('Unexpected element: ' + tag);
      const canvas = {
        tag: 'canvas', width: 0, height: 0, style: {}, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        getContext() { return {}; }
      };
      canvases.push(canvas);
      return canvas;
    }
  };
  globalThis.devicePixelRatio = 3;
  try { await action(canvases); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    if (oldRatio === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = oldRatio;
  }
};
const previewDoc = (viewport = {width: 400, height: 600}) => {
  let destroyed = 0, pages = [];
  const doc = {
    async getPage(index) {
      pages.push(index);
      return {
        getViewport({scale}) {
          return {width: viewport.width * scale, height: viewport.height * scale};
        },
        render() { return {promise: Promise.resolve(), cancel() {}}; },
        cleanup() {}
      };
    },
    async destroy() { destroyed++; }
  };
  return {doc, stats: () => ({destroyed, pages})};
};
const drain = () => new Promise(done => setTimeout(done, 25));

test('extremely tall or wide PDFs never allocate an oversized preview canvas', async () =>
  setupDom(async canvases => {
    for (const viewport of [{width: 1, height: 100000000},
      {width: 100000000, height: 1}, {width: 900000, height: 900000}]) {
      const mock = previewDoc(viewport), obs = observer();
      const manager = new OrganizerThumbnails({
        openDocument: async () => mock.doc, observerFactory: obs.factory
      });
      await manager.open(new ArrayBuffer(1), 1);
      const holder = new Holder(250);
      manager.observe(0, 0, holder);
      obs.trigger([[holder, true]]);
      await drain();
      const image = holder.querySelector('canvas');
      assert.ok(image);
      assert.ok(image.width <= 2048 && image.height <= 2048);
      assert.ok(image.width * image.height <= 262500);
      manager.dispose();
    }
  }));

test('invalid PDF viewport values fail gracefully, without a huge allocation', async () =>
  setupDom(async canvases => {
    const mock = previewDoc({width: Infinity, height: 300}), obs = observer();
    const errors = [];
    const manager = new OrganizerThumbnails({
      openDocument: async () => mock.doc, observerFactory: obs.factory,
      onError: value => errors.push(value)
    });
    await manager.open(new ArrayBuffer(1), 1);
    const holder = new Holder();
    manager.observe(0, 0, holder);
    obs.trigger([[holder, true]]);
    await drain();
    assert.equal(holder.textContent, 'Preview unavailable');
    assert.equal(canvases.length, 0);
    assert.ok(errors.length > 0);
    manager.dispose();
  }));

test('visibility changes render the correct original page without scanning all slots', async () =>
  setupDom(async () => {
    const mock = previewDoc(), obs = observer();
    const manager = new OrganizerThumbnails({
      openDocument: async () => mock.doc, observerFactory: obs.factory
    });
    await manager.open(new ArrayBuffer(1), 1);
    const holders = Array.from({length: 120}, () => new Holder());
    holders.forEach((h, index) => manager.observe(index, 0, h));
    obs.trigger([[holders[119], true], [holders[22], true]]);
    await drain();
    assert.deepEqual(mock.stats().pages.sort((a, b) => a - b), [23, 120]);
    assert.equal(manager.slotByHolder.get(holders[119]).originalIndex, 119);
    manager.dispose();
  }));

test('visible thumbnails survive cache eviction before offscreen thumbnails', async () =>
  setupDom(async () => {
    const mock = previewDoc(), obs = observer();
    const manager = new OrganizerThumbnails({
      openDocument: async () => mock.doc, observerFactory: obs.factory,
      maxConcurrent: 1, maxCached: 2
    });
    await manager.open(new ArrayBuffer(1), 1);
    const holders = Array.from({length: 3}, () => new Holder());
    holders.forEach((h, i) => manager.observe(i, 0, h));
    for (const holder of holders) {
      obs.trigger([[holder, true]]);
      await drain();
    }
    // Page 2 is most recently visible; mark oldest page 1 offscreen.
    obs.trigger([[holders[0], false]]);
    manager.evict();
    assert.ok(holders[2].querySelector('canvas'));
    assert.ok(holders[1].querySelector('canvas'));
    manager.dispose();
  }));

test('rotation drops and releases the previous canvas allocation', async () =>
  setupDom(async canvases => {
    const mock = previewDoc(), obs = observer();
    const manager = new OrganizerThumbnails({
      openDocument: async () => mock.doc, observerFactory: obs.factory
    });
    await manager.open(new ArrayBuffer(1), 1);
    const holder = new Holder();
    manager.observe(0, 0, holder);
    obs.trigger([[holder, true]]);
    await drain();
    const old = holder.querySelector('canvas');
    assert.ok(old.width > 0);
    manager.update(0, 90);
    assert.equal(old.width, 0);
    assert.equal(old.height, 0);
    await drain();
    assert.notEqual(holder.querySelector('canvas'), old);
    manager.dispose();
  }));

test('reset releases visible canvas buffers, closes workers and observation references', async () =>
  setupDom(async () => {
    const mock = previewDoc(), obs = observer();
    const manager = new OrganizerThumbnails({
      openDocument: async () => mock.doc, observerFactory: obs.factory
    });
    await manager.open(new ArrayBuffer(1), 1);
    const holder = new Holder();
    manager.observe(0, 0, holder);
    obs.trigger([[holder, true]]);
    await drain();
    const canvas = holder.querySelector('canvas');
    manager.close();
    await drain();
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
    assert.equal(manager.slots.size, 0);
    assert.equal(manager.document, null);
    assert.equal(manager.slotByHolder.get(holder), undefined);
    assert.ok(mock.stats().destroyed >= 1);
    assert.ok(obs.stats().disconnected >= 1);
  }));

test('rejected preview loading task releases worker transport', async () => {
  const source = read('assets/js/pdf-organizer.js');
  const expression = source.slice(source.indexOf('async function openPreviewDocument('),
    source.indexOf('export async function mount('));
  let destroyed = 0, usedLocalData = false;
  const loading = {
    promise: Promise.reject(Error('Broken PDF preview')),
    async destroy() { destroyed++; }
  };
  const load = async name => ({
    GlobalWorkerOptions: {},
    getDocument(options) {
      usedLocalData = options.data instanceof Uint8Array &&
        options.isEvalSupported === false &&
        !('url' in options);
      return loading;
    }
  });
  const open = new Function('load', 'url', expression +
    '; return openPreviewDocument;')(load, name => '/hub/' + name);
  await assert.rejects(open(new ArrayBuffer(8)), /Broken PDF preview/);
  assert.equal(destroyed, 1);
  assert.equal(usedLocalData, true);
});

test('organizer uses no remote PDF-processing services or HTML injection sinks', () => {
  const code = read('assets/js/pdf-organizer.js');
  const render = read('assets/js/pdf-organizer-thumbnails.js');
  const lifecycle = read('assets/js/pdf-organizer-lifecycle.js');
  assert.doesNotMatch(code + render + lifecycle, /fetch\(\s*['"]https?:|XMLHttpRequest|sendBeacon\(|\.innerHTML\s*=|eval\(/);
  assert.match(code, /isEvalSupported: false/);
  assert.match(code, /new Uint8Array\(bytes\)/);
  assert.match(lifecycle, /this\.record = null/);
});

test('static HTML contains accurate instructions, limitations and privacy information', () => {
  const html = read('documents/pdf-organizer/index.html');
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.match(html, /name="description" content="Organize PDF pages online/);
  assert.match(html, /id="pdf-organizer-guide"/);
  for (const phrase of ['Move earlier', 'Move later', 'Rotate', 'Privacy',
    'digital signatures', 'password-protected', 'does not upload']) {
    assert.ok(html.toLowerCase().includes(phrase.toLowerCase()), 'Missing: ' + phrase);
  }
  assert.doesNotMatch(html, /https:\/\/FINAL-DOMAIN/);
  assert.match(html, /assets\/css\/pdf-organizer\.css/);
});

test('site-wide SEO and security configuration remain untouched during organizer hardening', () => {
  const html = read('documents/pdf-organizer/index.html');
  assert.doesNotMatch(html, /<link rel="canonical" href="https:\/\/FINAL-DOMAIN/);
  assert.match(html, /href="\.\.\/\.\.\/privacy\/"/);
});
