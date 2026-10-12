// Task 3 only. Run: node --test tests/pdf-organizer-task3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');
const fromSource = async (path, replace = s => s) =>
  import('data:text/javascript;base64,' + Buffer.from(replace(
    readFileSync(new URL(path, import.meta.url), 'utf8'))).toString('base64'));
const integrityUrl = 'data:text/javascript;base64,' +
  Buffer.from(readFileSync(new URL('../assets/js/pdf-organizer-integrity.js', import.meta.url))).toString('base64');
const {OrganizerSession} = await fromSource('../assets/js/pdf-organizer-lifecycle.js',
  s => s.replace("'./pdf-organizer-integrity.js'", "'" + integrityUrl + "'"));
const {OrganizerThumbnails} = await fromSource('../assets/js/pdf-organizer-thumbnails.js');

async function fixture(count = 5) {
  const pdf = await PDF.PDFDocument.create();
  for (let i = 0; i < count; i++) {
    pdf.addPage([320 + i * 20, 450]).drawText('PAGE ' + (i + 1));
  }
  pdf.setTitle('Visual regression');
  const raw = await pdf.save();
  return {
    name: 'visual.pdf', size: raw.length,
    async arrayBuffer() { return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); },
    slice(from = 0, to = raw.length) {
      return {arrayBuffer: async () => raw.slice(from, to).buffer};
    }
  };
}
const session = (overrides = {}) => new OrganizerSession({
  loadPdfLibrary: async () => PDF,
  device: {mobile: true, deviceMemory: 4}, ...overrides
});

test('move-to-position preserves exactly the authoritative source index ordering', async () => {
  const state = session();
  await state.openFile(await fixture());
  assert.equal(state.moveTo(0, 3), true);
  assert.deepEqual(state.snapshot().plan.map(x => x.index), [1, 2, 3, 0, 4]);
  assert.equal(state.moveTo(4, 0), true);
  assert.deepEqual(state.snapshot().plan.map(x => x.index), [4, 1, 2, 3, 0]);
});

test('direct movement increments revision once and preserves page metadata', async () => {
  const state = session();
  await state.openFile(await fixture());
  state.change('rotate', 2);
  state.change('toggle', 2);
  const before = state.snapshot();
  assert.equal(state.moveTo(2, 0), true);
  const after = state.snapshot();
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.plan[0].index, 2);
  assert.equal(after.plan[0].rotation, 90);
  assert.equal(after.plan[0].keep, false);
});

test('invalid or noop visual moves have no effect', async () => {
  const state = session();
  await state.openFile(await fixture());
  const before = state.snapshot();
  for (const [from, to] of [[0, 0], [-1, 2], [0, 99], [0.5, 1]]) {
    assert.equal(state.moveTo(from, to), false);
  }
  assert.deepEqual(state.snapshot().plan, before.plan);
  assert.equal(state.snapshot().revision, before.revision);
});

test('export after direct move matches the current page arrangement', async () => {
  let output;
  const state = session({onResult: blob => output = blob});
  await state.openFile(await fixture());
  state.moveTo(0, 4);
  state.change('toggle', 1);
  const plan = state.snapshot().plan.filter(x => x.keep);
  assert.equal(await state.exportPdf(), true);
  const saved = await PDF.PDFDocument.load(await output.arrayBuffer());
  assert.equal(saved.getPageCount(), plan.length);
  assert.equal(saved.getPage(0).getWidth(), 340);
  assert.equal(saved.getPage(saved.getPageCount() - 1).getWidth(), 320);
});

test('PDF preview bytes are copied and never expose authoritative mutable bytes', async () => {
  const state = session();
  await state.openFile(await fixture());
  const id = state.snapshot().documentId;
  const first = state.previewSource();
  assert.ok(first instanceof ArrayBuffer);
  new Uint8Array(first)[0] = 0;
  assert.equal(new Uint8Array(state.previewSource())[0], 37); // %
  state.moveTo(0, 3);
  assert.equal(state.snapshot().documentId, id);
  await state.openFile(await fixture(2));
  assert.ok(state.snapshot().documentId > id);
  state.reset();
  assert.equal(state.previewSource(), null);
});

test('visual moves do not operate during an active export', async () => {
  let release;
  const gate = new Promise(done => { release = done; });
  const state = session({exporter: async (...args) => {
    await gate;
    const {buildOrganizedPdf} = await import(integrityUrl);
    return buildOrganizedPdf(...args);
  }});
  await state.openFile(await fixture());
  const pending = state.exportPdf();
  assert.equal(state.moveTo(0, 2), false);
  release();
  await pending;
});

class FakeCanvas {
  constructor() { this.style = {}; this.attrs = {}; this.width = 0; this.height = 0; this.tagName = 'CANVAS'; }
  setAttribute(name, value) { this.attrs[name] = value; }
  getContext() { return {}; }
}
class FakeHolder {
  constructor() { this.children = []; this._textContent = ''; this.listeners = {}; }
  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return this._textContent; }
  getBoundingClientRect() { return {width: 200}; }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
  querySelector(selector) { return selector === 'canvas' ? this.children.find(x => x.tagName === 'CANVAS') : null; }
}
const fakePdf = (options = {}) => {
  let active = 0, maxActive = 0, calls = 0, destroyed = 0;
  const read = async index => ({
    getViewport: ({scale, rotation}) => ({
      width: (rotation % 180 ? 600 : 420) * scale,
      height: (rotation % 180 ? 420 : 600) * scale
    }),
    render() {
      calls++; active++; maxActive = Math.max(maxActive, active);
      const task = {cancel() {}, promise: (async () => {
        if (options.block) await options.block;
        active--;
      })()};
      return task;
    },
    cleanup() {}
  });
  return {
    instance: {getPage: read, async destroy() { destroyed++; }},
    stats: () => ({maxActive, calls, destroyed})
  };
};
const fakeObserver = () => {
  let callback, disconnected = 0;
  return {
    factory(fn) { callback = fn; return {observe() {}, disconnect() { disconnected++; }}; },
    show(holders, visible = true) {
      callback(holders.map(target => ({target, isIntersecting: visible})));
    },
    stats: () => ({disconnected})
  };
};
const withCanvas = async fn => {
  const previous = globalThis.document;
  const oldDensity = globalThis.devicePixelRatio;
  globalThis.document = {createElement: tag => tag === 'canvas' ? new FakeCanvas() :
    {tagName: tag.toUpperCase(), setAttribute() {}, addEventListener() {}}};
  globalThis.devicePixelRatio = 2;
  try { await fn(); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    if (oldDensity === undefined) delete globalThis.devicePixelRatio;
    else globalThis.devicePixelRatio = oldDensity;
  }
};
const settle = () => new Promise(done => setTimeout(done, 15));

test('lazy rendering waits for visibility and uses source page IDs', async () => withCanvas(async () => {
  const mock = fakePdf(), observer = fakeObserver();
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => mock.instance, observerFactory: observer.factory
  });
  await thumbnails.open(new ArrayBuffer(8), 1);
  const a = new FakeHolder(), b = new FakeHolder();
  thumbnails.observe(0, 0, a);
  thumbnails.observe(3, 90, b);
  assert.equal(mock.stats().calls, 0);
  observer.show([b]);
  await settle();
  assert.equal(mock.stats().calls, 1);
  assert.ok(b.querySelector('canvas'));
  assert.ok(!a.querySelector('canvas'));
  thumbnails.dispose();
}));

test('preview concurrency is bounded and can be cancelled on reset', async () => withCanvas(async () => {
  let release;
  const gate = new Promise(done => release = done);
  const mock = fakePdf({block: gate}), observer = fakeObserver();
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => mock.instance, observerFactory: observer.factory,
    maxConcurrent: 2, maxCached: 3
  });
  await thumbnails.open(new ArrayBuffer(8), 1);
  const holders = Array.from({length: 8}, () => new FakeHolder());
  holders.forEach((h, i) => thumbnails.observe(i, 0, h));
  observer.show(holders);
  await settle();
  assert.ok(mock.stats().maxActive <= 2);
  thumbnails.close();
  release();
  await settle();
  assert.ok(mock.stats().destroyed >= 1);
}));

test('rotation invalidates an old thumbnail without altering source state', async () => withCanvas(async () => {
  const mock = fakePdf(), observer = fakeObserver();
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => mock.instance, observerFactory: observer.factory
  });
  await thumbnails.open(new ArrayBuffer(8), 5);
  const holder = new FakeHolder();
  thumbnails.observe(2, 0, holder);
  observer.show([holder]);
  await settle();
  const old = holder.querySelector('canvas');
  assert.ok(old);
  thumbnails.update(2, 90);
  await settle();
  const rotated = holder.querySelector('canvas');
  assert.ok(rotated);
  assert.notEqual(rotated, old);
  thumbnails.dispose();
}));

test('old asynchronous PDF previews cannot replace a newly opened document', async () => withCanvas(async () => {
  let resolveOld;
  const delayed = new Promise(done => resolveOld = done);
  const first = fakePdf(), second = fakePdf(), observer = fakeObserver();
  let count = 0;
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => (++count === 1 ? delayed : second.instance),
    observerFactory: observer.factory
  });
  const openingOld = thumbnails.open(new ArrayBuffer(8), 7);
  const openingNew = thumbnails.open(new ArrayBuffer(8), 8);
  resolveOld(first.instance);
  await Promise.all([openingOld, openingNew]);
  assert.equal(thumbnails.documentId, 8);
  assert.equal(thumbnails.document, second.instance);
  assert.equal(first.stats().destroyed, 1);
  thumbnails.dispose();
}));

test('thumbnail errors never block page actions and export', async () => withCanvas(async () => {
  const errors = [];
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => { throw Error('Worker unavailable'); },
    onError: message => errors.push(message)
  });
  await thumbnails.open(new ArrayBuffer(8), 1);
  assert.ok(errors.some(message => message.includes('Page controls')));
  const s = session();
  assert.equal(await s.openFile(await fixture()), true);
  assert.equal(s.moveTo(0, 2), true);
  thumbnails.dispose();
}));

test('thumbnail cache evicts older canvases to limit memory', async () => withCanvas(async () => {
  const mock = fakePdf(), observer = fakeObserver();
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => mock.instance, observerFactory: observer.factory,
    maxConcurrent: 2, maxCached: 2
  });
  await thumbnails.open(new ArrayBuffer(8), 1);
  const holders = Array.from({length: 4}, () => new FakeHolder());
  holders.forEach((h, i) => thumbnails.observe(i, 0, h));
  observer.show(holders);
  await settle();
  assert.ok(holders.filter(h => h.querySelector('canvas')).length <= 2);
  thumbnails.dispose();
}));

test('document disposal removes preview references and observers', async () => withCanvas(async () => {
  const mock = fakePdf(), observer = fakeObserver();
  const thumbnails = new OrganizerThumbnails({
    openDocument: async () => mock.instance, observerFactory: observer.factory
  });
  await thumbnails.open(new ArrayBuffer(8), 1);
  const holder = new FakeHolder();
  thumbnails.observe(0, 0, holder);
  thumbnails.dispose();
  assert.equal(thumbnails.slots.size, 0);
  assert.equal(thumbnails.document, null);
  assert.ok(observer.stats().disconnected >= 1);
}));
