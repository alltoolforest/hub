// Task 1 scope only. Run: node --test tests/pdf-organizer-task1.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');
const engineSource = readFileSync(new URL('../assets/js/pdf-organizer-integrity.js', import.meta.url), 'utf8');
const {initialPlan, changePlan, validatePlan, buildOrganizedPdf} =
  await import('data:text/javascript;base64,' + Buffer.from(engineSource).toString('base64'));

async function fixture(count = 4) {
  const doc = await PDF.PDFDocument.create({updateMetadata: false});
  for (let i = 0; i < count; i++) {
    const page = doc.addPage([320 + i * 40, 440 + i * 25]);
    page.drawText('Source page ' + i, {x: 35, y: 70, size: 18});
    page.drawRectangle({x: 20, y: 20, width: 30 + i, height: 35 + i});
  }
  doc.setTitle('Task 1 fixture');
  doc.setAuthor('AllToolForest');
  doc.setSubject('PDF Organizer test');
  return doc;
}

async function exported(doc, plan) {
  return PDF.PDFDocument.load(
    await buildOrganizedPdf(await doc.save(), plan, PDF),
    {updateMetadata: false}
  );
}

test('identity round-trip keeps page references, dimensions and metadata', async () => {
  const source = await fixture();
  const result = await exported(source, initialPlan(source));
  assert.equal(result.getPageCount(), source.getPageCount());
  assert.deepEqual(result.getPages().map(p => String(p.ref)),
    source.getPages().map(p => String(p.ref)));
  assert.deepEqual(result.getPages().map(p => p.getSize()),
    source.getPages().map(p => p.getSize()));
  assert.equal(result.getTitle(), 'Task 1 fixture');
  assert.equal(result.getAuthor(), 'AllToolForest');
  assert.equal(result.getSubject(), 'PDF Organizer test');
});

test('reorder preserves original page references in requested sequence', async () => {
  const doc = await fixture();
  let plan = changePlan(initialPlan(doc), 'down', 0);
  plan = changePlan(plan, 'up', 3);
  const result = await exported(doc, plan);
  assert.deepEqual(result.getPages().map(p => String(p.ref)),
    plan.map(item => String(doc.getPage(item.index).ref)));
});

test('remove and restore keep exactly one copy of each retained page', async () => {
  const doc = await fixture();
  let plan = changePlan(initialPlan(doc), 'toggle', 1);
  plan = changePlan(plan, 'toggle', 1);
  plan = changePlan(plan, 'toggle', 2);
  const kept = validatePlan(plan, doc.getPageCount());
  const result = await exported(doc, plan);
  assert.equal(result.getPageCount(), kept.length);
  assert.deepEqual(result.getPages().map(p => String(p.ref)),
    kept.map(item => String(doc.getPage(item.index).ref)));
});

test('rotations preserve page geometry and combine with existing rotation', async () => {
  const doc = await fixture(2);
  doc.getPage(0).setRotation(PDF.degrees(90));
  const plan = changePlan(initialPlan(doc), 'rotate', 0);
  const result = await exported(doc, plan);
  assert.equal(result.getPage(0).getRotation().angle, 180);
  assert.deepEqual(result.getPage(0).getSize(), doc.getPage(0).getSize());
});

test('normalizes equivalent negative source rotations', async () => {
  const doc = await fixture(1);
  doc.getPage(0).setRotation(PDF.degrees(-90));
  const plan = initialPlan(doc);
  assert.equal(plan[0].rotation, 270);
  const result = await exported(doc, plan);
  assert.equal(result.getPage(0).getRotation().angle, 270);
});

test('one-page output works; no-page export is rejected', async () => {
  const doc = await fixture(1);
  assert.equal((await exported(doc, initialPlan(doc))).getPageCount(), 1);
  await assert.rejects(exported(doc, changePlan(initialPlan(doc), 'toggle', 0)),
    /Keep at least one page/);
});

test('invalid or duplicated source indexes are rejected', async () => {
  const doc = await fixture(3);
  const plan = initialPlan(doc);
  plan[1].index = 0;
  await assert.rejects(exported(doc, plan), /Invalid page arrangement/);
});

test('invalid rotation values and missing records are rejected', async () => {
  const doc = await fixture(3);
  const plan = initialPlan(doc);
  plan[1].rotation = 45;
  await assert.rejects(exported(doc, plan), /Invalid page arrangement/);
  await assert.rejects(exported(doc, plan.slice(1)), /incomplete/);
});

test('digital-signature permission structures fail closed', async () => {
  const doc = await fixture(2);
  doc.catalog.set(PDF.PDFName.of('Perms'), doc.context.obj({}));
  await assert.rejects(exported(doc, initialPlan(doc)), /digital signature/);
});

test('removing pages from outline-bearing PDFs fails closed', async () => {
  const doc = await fixture(2);
  doc.catalog.set(PDF.PDFName.of('Outlines'), doc.context.obj({Count: 0}));
  await assert.rejects(exported(doc, changePlan(initialPlan(doc), 'toggle', 1)),
    /Outlines/);
});

test('removing pages from form-bearing PDFs fails closed', async () => {
  const doc = await fixture(2);
  doc.getForm().createTextField('person.name');
  await assert.rejects(exported(doc, changePlan(initialPlan(doc), 'toggle', 1)),
    /AcroForm/);
});

test('custom page labels cannot be silently mismatched by reordering', async () => {
  const doc = await fixture(2);
  doc.catalog.set(PDF.PDFName.of('PageLabels'), doc.context.obj({Nums: []}));
  await assert.rejects(exported(doc, changePlan(initialPlan(doc), 'down', 0)),
    /custom page labels/);
});

test('internal page destination links prevent unsafe deletion', async () => {
  const doc = await fixture(2);
  const annotation = doc.context.obj({Dest: doc.getPage(1).ref});
  const ref = doc.context.register(annotation);
  doc.getPage(0).node.set(PDF.PDFName.of('Annots'), doc.context.obj([ref]));
  await assert.rejects(exported(doc, changePlan(initialPlan(doc), 'toggle', 1)),
    /internal page links/);
});

test('nested page-tree inherited rotation remains intact after reordering', async () => {
  const doc = await fixture(3);
  const key = PDF.PDFName.of;
  const root = doc.catalog.Pages();
  const rootRef = doc.catalog.get(key('Pages'));
  const subtree = PDF.PDFPageTree.withContext(doc.context, rootRef);
  const subtreeRef = doc.context.register(subtree);
  const first = root.Kids().get(0);
  root.Kids().remove(0);
  subtree.Kids().push(first);
  subtree.set(key('Count'), PDF.PDFNumber.of(1));
  subtree.set(key('Rotate'), PDF.PDFNumber.of(270));
  root.Kids().insert(0, subtreeRef);
  doc.getPage(0).node.setParent(subtreeRef);
  const nested = await PDF.PDFDocument.load(await doc.save(), {updateMetadata: false});
  const result = await exported(nested, changePlan(initialPlan(nested), 'down', 0));
  assert.equal(result.getPage(1).getRotation().angle, 270);
  assert.deepEqual(result.getPage(1).getSize(), nested.getPage(0).getSize());
  assert.equal(String(result.getPage(1).ref), String(nested.getPage(0).ref));
});

test('boundary operations do not alter page state', async () => {
  const doc = await fixture(2);
  const plan = initialPlan(doc);
  assert.equal(changePlan(plan, 'up', 0), plan);
  assert.equal(changePlan(plan, 'down', 1), plan);
});

test('original input bytes remain unchanged through export', async () => {
  const doc = await fixture(2);
  const bytes = await doc.save();
  const before = bytes.slice();
  await buildOrganizedPdf(bytes, changePlan(initialPlan(doc), 'down', 0), PDF);
  assert.deepEqual(bytes, before);
});

test('existing interactive form value survives page reorder', async () => {
  const doc = await fixture(2);
  const field = doc.getForm().createTextField('customer');
  field.addToPage(doc.getPage(0));
  field.setText('Kept value');
  const loaded = await PDF.PDFDocument.load(await doc.save(), {updateMetadata: false});
  const result = await exported(loaded, changePlan(initialPlan(loaded), 'down', 0));
  assert.equal(result.getForm().getTextField('customer').getText(), 'Kept value');
});

test('external link annotation survives page reorder', async () => {
  const doc = await fixture(2);
  const annotation = doc.context.obj({
    Type: PDF.PDFName.of('Annot'),
    Subtype: PDF.PDFName.of('Link'),
    A: doc.context.obj({
      S: PDF.PDFName.of('URI'),
      URI: PDF.PDFString.of('https://example.org')
    })
  });
  const ref = doc.context.register(annotation);
  doc.getPage(0).node.set(PDF.PDFName.of('Annots'), doc.context.obj([ref]));
  const loaded = await PDF.PDFDocument.load(await doc.save(), {updateMetadata: false});
  const result = await exported(loaded, changePlan(initialPlan(loaded), 'down', 0));
  assert.ok(result.getPage(1).node.Annots()?.size());
});

test('document-level file attachments survive reordering', async () => {
  const doc = await fixture(2);
  await doc.attach(new Uint8Array([1, 2, 3, 4]), 'test.bin',
    {mimeType: 'application/octet-stream', description: 'Fixture'});
  const loaded = await PDF.PDFDocument.load(await doc.save(), {updateMetadata: false});
  const result = await exported(loaded, changePlan(initialPlan(loaded), 'down', 0));
  assert.ok(result.catalog.get(PDF.PDFName.of('Names')));
});
