// Audit remediation regression — organizer only (no frozen-tool modifications).
// node --test tests/pdf-organizer-postaudit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {OrganizerSession} from '../assets/js/pdf-organizer-lifecycle.js';
import {initialPlan, buildOrganizedPdf} from '../assets/js/pdf-organizer-integrity.js';

const require = createRequire(import.meta.url);
const PDF = require('../assets/vendor/pdf-lib.js');
const name = PDF.PDFName.of;
async function fixture({size=3, page=0, missingP=true, removeFromAnnots=false}={}) {
  const doc = await PDF.PDFDocument.create({updateMetadata: false});
  for (let i=0; i<size; i++) doc.addPage([310+i*24, 520]).drawText('Source page '+i);
  const field = doc.getForm().createTextField('contact.email');
  field.addToPage(doc.getPage(page));
  field.setText('sample@example.org');
  const widget = field.acroField.getWidgets()[0];
  if (missingP) widget.dict.delete(name('P'));
  if (removeFromAnnots) {
    const arr = doc.getPage(page).node.Annots();
    for (let i = arr.size()-1; i>=0; i--) arr.remove(i);
  }
  return doc;
}
async function remove(doc, deleted=0) {
  const bytes = await doc.save();
  const parsed = await PDF.PDFDocument.load(bytes, {updateMetadata: false});
  const plan = initialPlan(parsed); plan[deleted].keep=false;
  const saved = await buildOrganizedPdf(bytes, plan, PDF);
  return PDF.PDFDocument.load(saved, {updateMetadata: false});
}

test('form on kept page with absent optional /P is preserved after removing other page',async()=>{
  const result=await remove(await fixture({page:2}));
  assert.equal(result.getPageCount(),2);
  assert.equal(result.getForm().getTextField('contact.email').getText(),'sample@example.org');
});

test('form on removed page with absent optional /P is removed from document field tree',async()=>{
  const result=await remove(await fixture({page:0}));
  assert.equal(result.getPageCount(),2);
  assert.deepEqual(result.getForm().getFields().map(f=>f.getName()),[]);
});

test('normal explicit /P forms remain preserved',async()=>{
  const result=await remove(await fixture({page:1,missingP:false}));
  assert.equal(result.getForm().getTextField('contact.email').getText(),'sample@example.org');
});

test('unresolvable missing /P widget remains blocked, not silently lost',async()=>{
  await assert.rejects(remove(await fixture({page:2,removeFromAnnots:true})),
    /unresolved page reference/);
});

test('ambiguous annotation ownership on two pages remains blocked',async()=>{
  const doc=await fixture({page:2});
  const ref=doc.getPage(2).node.Annots().get(0);
  doc.getPage(1).node.set(name('Annots'),doc.context.obj([ref]));
  await assert.rejects(remove(doc),/belongs to multiple pages/);
});

test('last remaining page cannot be removed through OrganizerSession state',async()=>{
  const pdf=await PDF.PDFDocument.create();
  pdf.addPage([300,400]);pdf.addPage([300,400]);
  const bytes=await pdf.save();
  const file={
    name:'two-page.pdf',size:bytes.length,
    slice(start=0,end=bytes.length){return{arrayBuffer:async()=>bytes.slice(start,end).buffer};},
    async arrayBuffer(){return bytes.slice().buffer;}
  };
  const state=new OrganizerSession({loadPdfLibrary:async()=>PDF});
  assert.equal(await state.openFile(file),true);
  assert.equal(state.change('toggle',0),true);
  const before=state.snapshot();
  assert.equal(state.change('toggle',1),false);
  const after=state.snapshot();
  assert.equal(after.plan.filter(p=>p.keep).length,1);
  assert.equal(after.revision,before.revision);
  assert.match(after.message,/Keep at least one page/);
  assert.equal(state.change('toggle',0),true);
  assert.equal(state.change('toggle',1),true);
  assert.equal(state.snapshot().plan.filter(p=>p.keep).length,1);
  state.dispose();
});

test('single-page document has no allowed last-page removal but still exports',async()=>{
  const pdf=await PDF.PDFDocument.create();
  pdf.addPage([300,400]);
  const bytes=await pdf.save();
  const file={
    name:'single.pdf',size:bytes.length,
    slice(start=0,end=bytes.length){return{arrayBuffer:async()=>bytes.slice(start,end).buffer};},
    async arrayBuffer(){return bytes.slice().buffer;}
  };
  const state=new OrganizerSession({loadPdfLibrary:async()=>PDF});
  assert.equal(await state.openFile(file),true);
  assert.equal(state.change('toggle',0),false);
  assert.equal(state.snapshot().plan[0].keep,true);
  state.dispose();
});

test('pagehide is conditional on persisted and pageshow revokes stale downloads',()=>{
  const js=readFileSync(new URL('../assets/js/pdf-organizer.js',import.meta.url),'utf8');
  assert.match(js,/window\.addEventListener\('pagehide', event => \{\s*if \(event\.persisted\) return;/);
  assert.match(js,/window\.addEventListener\('pageshow', event => \{\s*if \(!event\.persisted\) return;\s*clearOutputs\(\);/);
  assert.match(js,/session\.emit\('Page restored\. Your PDF edits are intact/);
});

test('guarded UI disables the only included page and allows restore',()=>{
  const js=readFileSync(new URL('../assets/js/pdf-organizer.js',import.meta.url),'utf8');
  assert.match(js,/entry\.toggle\.disabled = view\.busy \|\| \(page\.keep && included === 1\)/);
  assert.match(js,/entry\.toggle\.disabled = view\.busy \|\| \(item\.keep && count === 1\)/);
});
