// Historical Task 1 legacy algorithm characterization plus controlled route replacement.
// KNOWN-DEFECT assertions passing means the defect is reproduced, not fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixtureCases,buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
const N=PDF.PDFName.of;
const source=readFileSync(new URL('../assets/js/pdf.js',import.meta.url),'utf8');
const catalog=readFileSync(new URL('../assets/js/catalog.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../documents/pdf-compressor/index.html',import.meta.url),'utf8');
const core=readFileSync(new URL('../assets/js/core.js',import.meta.url),'utf8');
// Mirror of the existing, unmodified pdf.js branch. Contract test pins it.
async function legacyOptimize(input){
  const doc=await PDF.PDFDocument.load(input),out=await PDF.PDFDocument.create();
  for(const page of await out.copyPages(doc,doc.getPageIndices()))out.addPage(page);
  return new Uint8Array(await out.save({useObjectStreams:true}));
}
async function compare(id){
  const original=(await buildFixture(id)).bytes;
  const before=await PDF.PDFDocument.load(original,{updateMetadata:false});
  const optimized=await legacyOptimize(original);
  const after=await PDF.PDFDocument.load(optimized,{updateMetadata:false});
  return {before,after,original,optimized};
}
test('legacy copier remains byte-for-byte testable but the staged page invokes only the v2 boot',()=>{
  assert.match(source,/else if\(slug==='pdf-compressor'\)/);
  const fragment=source.split("else if(slug==='pdf-compressor'){")[1]
    ?.split("else if(slug==='jpg-to-pdf')")[0];
  assert.ok(fragment);
  assert.match(fragment,/await out\.copyPages\(doc,doc\.getPageIndices\(\)\)/);
  assert.match(fragment,/out\.save\(\{useObjectStreams:true\}\)/);
  assert.doesNotMatch(fragment,/embedPng\(|embedJpg\(|canvasBlob\(|reencode\(/i);
  assert.match(fragment,/'-optimized','pdf'/);
  assert.match(page,/<h1>PDF Compressor<\/h1>/);
  assert.doesNotMatch(page,/data-tool="pdf-compressor"/);
  assert.match(page,/src="\.\.\/\.\.\/assets\/js\/pdf-compressor-v3\/site-entry\.mjs"/);
  assert.match(catalog,/'pdf-compressor','PDF Compressor'/);
  assert.match(core,/export function checkFile\(/);
  assert.match(core,/export function bindFile\(/);
});
test('fixture corpus includes the ten required synthetic document types',()=>{
  assert.deepEqual(new Set(fixtureCases.map(f=>f.id)),new Set(
    ['digital','scanned','image-heavy','mixed','form','bookmarks',
     'attachment','tagged','signed-marker','invalid']));
  assert.ok(fixtureCases.every(f=>f.source.startsWith('synthetic')));
  assert.equal(fixtureCases.find(f=>f.id==='signed-marker').source,
    'synthetic-marker-not-cryptographically-signed');
});
test('valid fixture PDFs open with expected page count and metadata',async()=>{
  for(const c of fixtureCases.filter(f=>f.pages>0)){
    const {bytes}=await buildFixture(c.id);
    const doc=await PDF.PDFDocument.load(bytes,{updateMetadata:false});
    assert.equal(doc.getPageCount(),c.pages,'pages in '+c.id);
    assert.equal(doc.getTitle(),'ATF Task 1 synthetic fixture');
    assert.equal(doc.getAuthor(),'AllToolForest Test Suite');
    assert.ok(bytes.byteLength>100,'bytes in '+c.id);
  }
});
test('fixture generation is byte-for-byte reproducible',async()=>{
  for(const id of ['digital','scanned','form','bookmarks','attachment','tagged']){
    assert.deepEqual((await buildFixture(id)).bytes,(await buildFixture(id)).bytes,
      'non-deterministic fixture '+id);
  }
});
test('legacy output remains parseable with correct page count and dimensions',async()=>{
  const {before,after,optimized}=await compare('digital');
  assert.equal(after.getPageCount(),3);
  assert.deepEqual(after.getPages().map(p=>p.getSize()),
    before.getPages().map(p=>p.getSize()));
  assert.ok(optimized.length>100);
});
test('KNOWN-DEFECT: document title and author are discarded',async()=>{
  const {before,after}=await compare('digital');
  assert.equal(before.getTitle(),'ATF Task 1 synthetic fixture');
  assert.equal(before.getAuthor(),'AllToolForest Test Suite');
  assert.notEqual(after.getTitle(),before.getTitle());
  assert.notEqual(after.getAuthor(),before.getAuthor());
});
test('KNOWN-DEFECT: fillable fields and values are discarded',async()=>{
  const {before,after}=await compare('form');
  assert.equal(before.getForm().getTextField('client.reference').getText(),
    'ATF-REFERENCE-123');
  assert.equal(after.getForm().getFields().length,0);
});
test('KNOWN-DEFECT: attachments and associated files are discarded',async()=>{
  const {before,after}=await compare('attachment');
  assert.ok(before.catalog.get(N('Names')));
  assert.ok(before.catalog.get(N('AF')));
  assert.equal(after.catalog.get(N('Names')),undefined);
  assert.equal(after.catalog.get(N('AF')),undefined);
});
test('KNOWN-DEFECT: bookmarks and navigation are discarded',async()=>{
  const {before,after}=await compare('bookmarks');
  assert.ok(before.catalog.get(N('Outlines')));
  assert.equal(after.catalog.get(N('Outlines')),undefined);
});
test('KNOWN-DEFECT: logical tagging is discarded',async()=>{
  const {before,after}=await compare('tagged');
  assert.ok(before.catalog.get(N('StructTreeRoot')));
  assert.ok(before.catalog.get(N('MarkInfo')));
  assert.equal(after.catalog.get(N('StructTreeRoot')),undefined);
  assert.equal(after.catalog.get(N('MarkInfo')),undefined);
});
test('KNOWN-RISK: a synthetic signature permission marker is lost',async()=>{
  const {before,after}=await compare('signed-marker');
  assert.ok(before.catalog.get(N('Perms')));
  assert.equal(after.catalog.get(N('Perms')),undefined);
  // This fixture is not a real cryptographically signed document.
});
test('raster-only and image-heavy PDFs retain embedded image resources',async()=>{
  for(const id of ['scanned','image-heavy']){
    const {before,after}=await compare(id);
    assert.equal(after.getPageCount(),before.getPageCount());
    for(const p of after.getPages()){
      const resources=p.node.Resources();
      assert.ok(resources,'missing resources for '+id);
      const images=resources.lookup(N('XObject'));
      assert.ok(images&&typeof images.keys==='function'&&images.keys().length>0,
        'missing raster image for '+id);
    }
  }
});
test('mixed-content output retains pages and page geometry',async()=>{
  const {before,after}=await compare('mixed');
  assert.equal(after.getPageCount(),before.getPageCount());
  assert.equal(after.getPage(1).getWidth(),before.getPage(1).getWidth());
});
test('KNOWN-DEFECT: malformed PDF may pass load then fail on first page access',async()=>{
  const pdf=await PDF.PDFDocument.load((await buildFixture('invalid')).bytes);
  assert.throws(()=>pdf.getPageCount(),/Pages|page/i);
});
test('the legacy baseline reports actual bytes rather than guaranteed savings',async()=>{
  const {original,optimized}=await compare('digital');
  assert.ok(original.length>0&&optimized.length>0);
  console.log('PDF COMPRESSOR TASK 1 original/output bytes:',
    original.length+'/'+optimized.length);
});
