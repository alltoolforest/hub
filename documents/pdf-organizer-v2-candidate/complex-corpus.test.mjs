import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {buildCandidate} from './engine.js';
const P=createRequire(import.meta.url)('../../assets/vendor/pdf-lib.js');
// Exact binary fixtures from the 23-file downloadable Organize PDF PR235 QA pack,
// deflate-compressed JSON of base64 PDFs. Store no real/confidential user documents.
const FIXTURES=JSON.parse(inflateSync(Buffer.from('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','base64')).toString());
const bytes=name=>Uint8Array.from(Buffer.from(FIXTURES[name],'base64'));
const source=(name,id=1)=>({id,bytes:bytes(name)});
const item=(src,page,rot=0)=>({src,page,rot,blank:false});
test('QA pack: embedded document attachment blocks potentially confidential page deletion',async()=>{
  await assert.rejects(buildCandidate([source('12_embedded_attachment_page_deletion.pdf')],[item(1,0)],P),/attachments|content|cannot/i);
});
test('QA pack: PDF JavaScript is rejected before processing',async()=>{
  await assert.rejects(buildCandidate([source('13_pdf_javascript_action.pdf')],[item(1,0)],P),/active|JavaScript|unsupported/i);
});
test('QA pack: fake PDF header is rejected before export',async()=>{
  await assert.rejects(buildCandidate([source('19_fake_pdf_header.pdf')],[item(1,0)],P));
});
test('QA pack: pathological page dimension rejected before export',async()=>{
  await assert.rejects(buildCandidate([source('20_extreme_page_dimensions.pdf')],[item(1,0)],P),/dimension/i);
});
test('QA pack: two metadata-free PDFs combine with exact output page count',async()=>{
  const one=source('14_simple_merge_source_1.pdf'),two=source('14_simple_merge_source_2.pdf',2);
  const items=[item(1,0),item(2,0),item(1,1),item(2,1),item(2,2)];
  const result=await buildCandidate([one,two],items,P);
  const doc=await P.PDFDocument.load(result,{updateMetadata:false});
  assert.equal(doc.getPageCount(),5);
});
