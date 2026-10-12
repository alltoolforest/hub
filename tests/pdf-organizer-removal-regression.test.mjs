// Regression for confirmed production defect: page deletion blocked by
// ordinary /Names and /AF attachment structures.
// Run: node --test tests/pdf-organizer-removal-regression.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');
const engine = readFileSync(new URL('../assets/js/pdf-organizer-integrity.js', import.meta.url), 'utf8');
const {initialPlan, buildOrganizedPdf} = await import(
  'data:text/javascript;base64,' + Buffer.from(engine).toString('base64')
);
const key = PDF.PDFName.of;

async function source(count = 3) {
  const doc = await PDF.PDFDocument.create({updateMetadata:false});
  for(let i = 0; i < count; i++) {
    const page = doc.addPage([320 + i * 40, 470 + i * 20]);
    if (i !== 1) page.drawText('Unique page ' + i + ' user information');
  }
  doc.setTitle('Removal regression');
  return doc;
}
async function remove(doc, indexes, options) {
  const bytes = await doc.save();
  const loaded = await PDF.PDFDocument.load(bytes, {updateMetadata:false});
  const plan = initialPlan(loaded);
  for (const index of indexes) plan[index].keep = false;
  const saved = await buildOrganizedPdf(bytes, plan, PDF, options);
  return {input:loaded, saved, result:await PDF.PDFDocument.load(saved,{updateMetadata:false})};
}

test('blank page removal creates a smaller page tree with original remaining page refs', async () => {
  const doc = await source();
  const {input,result} = await remove(doc,[1]);
  assert.equal(result.getPageCount(), 2);
  assert.deepEqual(result.getPages().map(page => String(page.ref)),[
    String(input.getPage(0).ref), String(input.getPage(2).ref)
  ]);
  assert.deepEqual(result.getPages().map(page => page.getWidth()),[320,400]);
  assert.equal(result.getTitle(),'Removal regression');
});

test('content-filled page is removed completely, not merely hidden from page list', async () => {
  const doc = await source();
  const {input,result,saved} = await remove(doc,[0]);
  assert.equal(result.getPageCount(),2);
  assert.equal(result.getPage(0).getWidth(),360);
  const removedPage = input.getPage(0);
  const refs = new Set(result.context.enumerateIndirectObjects().map(([ref]) => String(ref)));
  assert.equal(refs.has(String(removedPage.ref)),false);
  const removedContents = removedPage.node.Contents();
  if (removedContents instanceof PDF.PDFRef) {
    assert.equal(refs.has(String(removedContents)),false);
  }
  // Original content streams are compressed. The absence of the removed page
  // and stream references (not a text substring test) establishes reclamation.
  assert.ok(saved.length>100);
});

test('attached XML Names and document-level AF survive blank page removal', async () => {
  const doc = await source();
  await doc.attach(new Uint8Array([1,2,3,4]), 'associated.xml', {
    mimeType:'application/xml',description:'Document metadata'
  });
  const {result} = await remove(doc,[1]);
  assert.equal(result.getPageCount(),2);
  const names = result.context.lookup(result.catalog.get(key('Names')));
  assert.ok(names.get(key('EmbeddedFiles')));
  assert.equal(result.context.lookup(result.catalog.get(key('AF'))).size(),1);
});

test('attached file Names and AF survive content-filled page removal', async () => {
  const doc = await source();
  await doc.attach(new Uint8Array([5,6]),'scan-data.bin',{mimeType:'application/octet-stream'});
  const {result} = await remove(doc,[0,1]);
  assert.equal(result.getPageCount(),1);
  assert.ok(result.catalog.get(key('Names')));
  assert.ok(result.catalog.get(key('AF')));
});

test('form widget on removed page is removed from AcroForm field hierarchy', async () => {
  const doc = await source();
  const field = doc.getForm().createTextField('remove-me');
  field.addToPage(doc.getPage(0));
  field.setText('Sensitive');
  const {result} = await remove(doc,[0]);
  assert.equal(result.getPageCount(),2);
  assert.deepEqual(result.getForm().getFields().map(field=>field.getName()),[]);
});

test('form widget and entered value on kept page remain intact', async () => {
  const doc = await source();
  const field = doc.getForm().createTextField('keep-me');
  field.addToPage(doc.getPage(2));
  field.setText('Kept exactly');
  const {result} = await remove(doc,[0]);
  assert.equal(result.getForm().getTextField('keep-me').getText(),'Kept exactly');
});

test('form widgets on removed and retained separate fields are updated precisely', async () => {
  const doc = await source();
  const gone = doc.getForm().createTextField('deletedField');
  gone.addToPage(doc.getPage(1)); gone.setText('GONE');
  const kept = doc.getForm().createTextField('retainedField');
  kept.addToPage(doc.getPage(2)); kept.setText('PRESENT');
  const {result} = await remove(doc,[1]);
  assert.deepEqual(result.getForm().getFields().map(x=>x.getName()),['retainedField']);
  assert.equal(result.getForm().getTextField('retainedField').getText(),'PRESENT');
});

test('all-page deletion remains blocked', async () => {
  await assert.rejects(remove(await source(2),[0,1]),/Keep at least one page/);
});

test('signed documents remain blocked because removing pages invalidates signatures', async () => {
  const doc=await source();
  doc.catalog.set(key('Perms'),doc.context.obj({}));
  await assert.rejects(remove(doc,[1]),/digital signature/);
});

test('outline navigation pointing to removed pages is not silently destroyed', async () => {
  const doc=await source();
  doc.catalog.set(key('Outlines'),doc.context.obj({Count:1}));
  await assert.rejects(remove(doc,[1]),/Outlines/);
});

test('named destinations still require safe link repair before deletion', async () => {
  const doc=await source();
  doc.catalog.set(key('Names'),doc.context.obj({Dests: {Names:[]}}));
  await assert.rejects(remove(doc,[0]),/named destinations/);
});

test('internal links to other pages still block unsafe removal', async () => {
  const doc=await source();
  const link=doc.context.obj({Dest:doc.getPage(0).ref});
  const ref=doc.context.register(link);
  doc.getPage(2).node.set(key('Annots'),doc.context.obj([ref]));
  await assert.rejects(remove(doc,[0]),/internal page links/);
});

test('kept-page internal link to another kept page survives a deletion', async () => {
  const doc = await source();
  const target = doc.context.obj([doc.getPage(2).ref, key('Fit')]);
  const link = doc.context.obj({Type: key('Annot'), Subtype: key('Link'), Dest: target});
  const ref = doc.context.register(link);
  doc.getPage(0).node.set(key('Annots'), doc.context.obj([ref]));
  const {result} = await remove(doc,[1]);
  assert.equal(result.getPageCount(),2);
  assert.equal(result.getPage(0).node.Annots().size(),1);
});

test('internal link on a page being deleted cannot block deletion', async () => {
  const doc=await source();
  const link=doc.context.obj({Dest:doc.context.obj([doc.getPage(2).ref,key('Fit')])});
  const ref=doc.context.register(link);
  doc.getPage(1).node.set(key('Annots'),doc.context.obj([ref]));
  const {result}=await remove(doc,[1]);
  assert.equal(result.getPageCount(),2);
});

test('page removal and reorder/rotation work in the same export', async () => {
  const doc=await source();
  const bytes=await doc.save();
  const plan=initialPlan(await PDF.PDFDocument.load(bytes));
  plan[1].keep=false;
  plan[2].rotation=90;
  [plan[0],plan[2]]=[plan[2],plan[0]];
  const saved=await buildOrganizedPdf(bytes,plan,PDF);
  const result=await PDF.PDFDocument.load(saved);
  assert.deepEqual(result.getPages().map(page=>page.getWidth()),[400,320]);
  assert.equal(result.getPage(0).getRotation().angle,90);
});

test('original source bytes remain unchanged after sanitizing removed pages', async () => {
  const doc=await source();
  const bytes=await doc.save();
  const before=bytes.slice();
  const plan=initialPlan(await PDF.PDFDocument.load(bytes));
  plan[0].keep=false;
  await buildOrganizedPdf(bytes,plan,PDF);
  assert.deepEqual(bytes,before);
});

test('cancellation is respected during deleted-page export', async () => {
  const doc=await source();
  const bytes=await doc.save();
  const plan=initialPlan(await PDF.PDFDocument.load(bytes));
  plan[0].keep=false;
  const controller=new AbortController();
  await assert.rejects(buildOrganizedPdf(bytes,plan,PDF,{
    signal: controller.signal,
    onProgress(value){if(value >= 70)controller.abort();}
  }),error=>error.name==='AbortError');
});
