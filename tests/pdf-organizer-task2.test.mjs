// Task 2 regression. Run: node --test tests/pdf-organizer-task2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  OrganizerSession, organizerBudget, browserDeviceHints,
  validatePdfSelection, validatePdfSignature, readPdfFile
} from '../assets/js/pdf-organizer-lifecycle.js';
import {buildOrganizedPdf} from '../assets/js/pdf-organizer-integrity.js';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');

const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const bytesOf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const fakeFile = (name, bytes, declaredSize = bytes.length) => ({
  name, size: declaredSize,
  slice(from = 0, to = bytes.length) {
    return {arrayBuffer: async () => bytesOf(bytes.slice(from, to))};
  },
  async arrayBuffer() { return bytesOf(bytes); }
});
async function fixture(count = 3) {
  const doc = await PDF.PDFDocument.create({updateMetadata: false});
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([320 + i * 30, 460 + i * 25]);
    page.drawText('Page ' + i);
  }
  doc.setTitle('Task 2');
  return fakeFile('input.pdf', await doc.save());
}
const makeSession = (extra = {}) => new OrganizerSession({
  loadPdfLibrary: async () => PDF,
  device: {mobile: true, deviceMemory: 4},
  ...extra
});

test('uses device memory and mobile hint, not viewport width', () => {
  assert.deepEqual(organizerBudget({mobile: true, deviceMemory: 1}).maxPages, 150);
  assert.equal(organizerBudget({mobile: true, deviceMemory: 4}).maxPages, 300);
  assert.equal(organizerBudget({mobile: false, deviceMemory: 8}).maxPages, 1000);
  assert.equal(browserDeviceHints({userAgent: 'Mozilla/5.0 iPhone'}).mobile, true);
  assert.equal(browserDeviceHints({userAgentData: {mobile: true}}).mobile, true);
});

test('rejects empty, oversized and unsupported file names', () => {
  const budget = organizerBudget({mobile: true, deviceMemory: 2});
  assert.throws(() => validatePdfSelection(fakeFile('x.pdf', new Uint8Array([])), budget), /empty/);
  assert.throws(() => validatePdfSelection(fakeFile('x.txt', new Uint8Array([1])), budget), /Unsupported/);
  assert.throws(() => validatePdfSelection(fakeFile('x.pdf', new Uint8Array([1]), budget.maxBytes + 1), budget), /limit/);
});

test('rejects a non-PDF signature even with .pdf extension', async () => {
  const session = makeSession();
  const ok = await session.openFile(fakeFile('fake.pdf', new Uint8Array([37, 73, 79, 79])));
  assert.equal(ok, false);
  assert.equal(session.snapshot().phase, 'error');
  assert.match(session.snapshot().message, /valid PDF header/);
  assert.equal(session.snapshot().filename, null);
});

test('opens a valid PDF, releases parsed document reference and reports ready', async () => {
  const updates = [];
  const session = makeSession({onChange: state => updates.push(state)});
  assert.equal(await session.openFile(await fixture(3)), true);
  const state = session.snapshot();
  assert.equal(state.filename, 'input.pdf');
  assert.equal(state.pageCount, 3);
  assert.equal(state.phase, 'ready');
  assert.equal(state.percent, 100);
  assert.equal(session.record.doc, undefined);
  assert.ok(updates.some(u => u.message.includes('Checking PDF page structure')));
});

test('atomic failed replacement preserves last successfully loaded document', async () => {
  const session = makeSession();
  await session.openFile(await fixture(3));
  session.change('down', 0);
  const old = session.snapshot();
  assert.equal(await session.openFile(fakeFile('broken.pdf', new Uint8Array([1, 2, 3]))), false);
  assert.equal(session.snapshot().filename, old.filename);
  assert.deepEqual(session.snapshot().plan, old.plan);
  assert.equal(session.snapshot().phase, 'error');
  assert.equal(session.change('rotate', 0), true);
});

test('new selection wins over earlier in-progress file selection', async () => {
  const queue = [];
  const readFile = () => { const d = defer(); queue.push(d); return d.promise; };
  const session = makeSession({readFile});
  const file1 = await fixture(2), file2 = await fixture(4);
  const oldPromise = session.openFile(file1);
  assert.equal(queue.length, 1);
  const newPromise = session.openFile(file2);
  queue[0].resolve(await file1.arrayBuffer());
  assert.equal(await oldPromise, false);
  // Only the newest selection is allowed to commit.
  await Promise.resolve();
  assert.equal(queue.length, 2);
  queue[1].resolve(await file2.arrayBuffer());
  assert.equal(await newPromise, true);
  assert.equal(session.snapshot().pageCount, 4);
});

test('cancellation during file read retains the prior document', async () => {
  const pending = defer();
  let block = false;
  const session = makeSession({
    readFile: (file) => block ? pending.promise : file.arrayBuffer()
  });
  await session.openFile(await fixture(2));
  block = true;
  const attempt = session.openFile(await fixture(3));
  assert.equal(session.cancel(), true);
  pending.resolve(await (await fixture(3)).arrayBuffer());
  assert.equal(await attempt, false);
  assert.equal(session.snapshot().pageCount, 2);
  assert.equal(session.snapshot().busy, false);
});

test('reset invalidates a pending PDF parse and leaves no document', async () => {
  const pending = defer();
  let loading = false;
  const session = makeSession({
    loadPdfLibrary: async () => {
      if (loading) await pending.promise;
      return PDF;
    }
  });
  await session.openFile(await fixture(2));
  loading = true;
  const opening = session.openFile(await fixture(3));
  session.reset();
  pending.resolve();
  assert.equal(await opening, false);
  assert.equal(session.snapshot().filename, null);
  assert.equal(session.snapshot().pageCount, 0);
});

test('export generates an accurate PDF and publishes only the final result', async () => {
  let result = null;
  const progress = [];
  const session = makeSession({
    onResult: (blob, filename) => { result = {blob, filename}; },
    onChange: s => progress.push(s.percent)
  });
  await session.openFile(await fixture(3));
  session.change('down', 0);
  session.change('rotate', 1);
  assert.equal(await session.exportPdf(), true);
  assert.equal(result.filename, 'input.pdf');
  const bytes = await result.blob.arrayBuffer();
  const doc = await PDF.PDFDocument.load(bytes, {updateMetadata: false});
  assert.equal(doc.getPageCount(), 3);
  assert.equal(doc.getPage(1).getRotation().angle, 90);
  assert.equal(doc.getTitle(), 'Task 2');
  assert.ok(progress.some(p => p >= 70));
  assert.equal(session.snapshot().busy, false);
});

test('cancel during uninterruptible exporter suppresses late publication', async () => {
  const hold = defer();
  let published = 0;
  const session = makeSession({
    exporter: async (...args) => {
      await hold.promise;
      return buildOrganizedPdf(...args);
    },
    onResult: () => { published++; }
  });
  await session.openFile(await fixture(2));
  const running = session.exportPdf();
  assert.equal(session.cancel(), true);
  hold.resolve();
  assert.equal(await running, false);
  assert.equal(published, 0);
});

test('reset during export discards result and releases selected document', async () => {
  const hold = defer();
  let published = 0;
  const session = makeSession({
    exporter: async (...args) => { await hold.promise; return buildOrganizedPdf(...args); },
    onResult: () => published++
  });
  await session.openFile(await fixture(2));
  const running = session.exportPdf();
  session.reset();
  hold.resolve();
  assert.equal(await running, false);
  assert.equal(published, 0);
  assert.equal(session.snapshot().filename, null);
});

test('failed engine load is recoverable on next attempt', async () => {
  let attempts = 0;
  const session = makeSession({
    loadPdfLibrary: async () => {
      if (++attempts === 1) throw Error('PDF engine unavailable.');
      return PDF;
    }
  });
  const file = await fixture(2);
  assert.equal(await session.openFile(file), false);
  assert.equal(session.snapshot().phase, 'error');
  assert.equal(await session.openFile(file), true);
  assert.equal(session.snapshot().phase, 'ready');
});

test('export failure permits a new successful attempt', async () => {
  let tries = 0, saved = 0;
  const session = makeSession({
    exporter: async (...args) => {
      if (++tries === 1) throw Error('Simulated save interruption');
      return buildOrganizedPdf(...args);
    },
    onResult: () => saved++
  });
  await session.openFile(await fixture(2));
  assert.equal(await session.exportPdf(), false);
  assert.equal(session.snapshot().phase, 'error');
  assert.equal(await session.exportPdf(), true);
  assert.equal(saved, 1);
});

test('page-count limit rejected without disturbing previous document', async () => {
  const session = makeSession({device: {mobile: true, deviceMemory: 1}});
  await session.openFile(await fixture(2));
  assert.equal(await session.openFile(await fixture(151)), false);
  assert.match(session.snapshot().message, /150/);
  assert.equal(session.snapshot().pageCount, 2);
});

test('no-op boundary actions do not change revision', async () => {
  const session = makeSession();
  await session.openFile(await fixture(2));
  const revision = session.snapshot().revision;
  assert.equal(session.change('up', 0), false);
  assert.equal(session.change('down', 1), false);
  assert.equal(session.snapshot().revision, revision);
  assert.equal(session.change('toggle', 0), true);
  assert.equal(session.snapshot().revision, revision + 1);
});

test('document snapshots cannot mutate the authoritative page plan', async () => {
  const session = makeSession();
  await session.openFile(await fixture(2));
  const snap = session.snapshot();
  snap.plan[0].index = 123;
  assert.equal(session.snapshot().plan[0].index, 0);
});

test('disposal cancels operations, frees document references and prevents commits', async () => {
  const pending = defer();
  const session = makeSession({readFile: () => pending.promise});
  const running = session.openFile(await fixture(2));
  session.dispose();
  pending.resolve(await (await fixture(2)).arrayBuffer());
  assert.equal(await running, false);
  assert.equal(session.record, null);
  assert.equal(await session.openFile(await fixture(2)), false);
});

test('cooperative export checkpoints reject pre-cancelled operation', async () => {
  const pdf = await fixture(2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(buildOrganizedPdf(await pdf.arrayBuffer(),
    [{index: 0, keep: true, rotation: 0}, {index: 1, keep: true, rotation: 0}],
    PDF, {signal: controller.signal}), /cancelled/);
});

test('cancellation between export stages does not produce an output', async () => {
  const pdf = await fixture(20);
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(buildOrganizedPdf(await pdf.arrayBuffer(),
    Array.from({length: 20}, (_, index) => ({index, rotation: 0, keep: true})),
    PDF, {signal: controller.signal, onProgress: (p, msg) => {
      progress.push(p);
      if (p >= 44) controller.abort();
    }}), /cancelled/);
  assert.ok(progress.some(p => p >= 44));
});

test('cancel is inert while idle and reset clears a finished document', async () => {
  const session = makeSession();
  assert.equal(session.cancel(), false);
  await session.openFile(await fixture(2));
  session.reset();
  assert.equal(session.snapshot().phase, 'empty');
  assert.equal(session.snapshot().plan.length, 0);
});
