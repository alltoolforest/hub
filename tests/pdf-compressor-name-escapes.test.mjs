import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import PDF from '../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js';
import {losslessFingerprint} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';
test('case variants of PDF name escapes preserve semantics without decoding escaped hashes twice',async()=>{
  const doc=await PDF.PDFDocument.create();doc.addPage();
  doc.catalog.set(PDF.PDFName.of('Test'),PDF.PDFName.of('text/csv'));
  const upper=new Uint8Array(await doc.save({useObjectStreams:false}));
  const raw=Buffer.from(upper).toString('latin1'),lower=new Uint8Array(Buffer.from(raw.replaceAll('#2F','#2f'),'latin1'));
  // Change name spelling only; preserve binary header bytes and xref offsets.
  assert.equal(upper.length,lower.length);assert.notDeepEqual(upper,lower);
  assert.equal(await losslessFingerprint(upper,{PDF}),await losslessFingerprint(lower,{PDF}));
  assert.equal(PDF.PDFName.of('text#2fcsv').decodeText(),'text/csv');
  assert.equal(PDF.PDFName.of('text#232fcsv').decodeText(),'text#2fcsv');
  assert.notEqual(PDF.PDFName.of('text#232fcsv'),PDF.PDFName.of('text#2fcsv'));
});
test('isolated parser patch and unchanged shared parser match provenance',()=>{
  const base=new URL('../assets/js/pdf-compressor-v2/vendor/pdf-lib/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('provenance.json',base)));
  const source=readFileSync(new URL('../assets/vendor/pdf-lib.js',import.meta.url));
  const patched=readFileSync(new URL('pdf-lib.js',base));
  const digest=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(digest(source),manifest.sourceSha256);assert.equal(digest(patched),manifest.patchedSha256);
  assert.deepEqual(patched,Buffer.from(source.toString().replace('/#([\\dABCDEF]{2})/g','/#([\\dA-Fa-f]{2})/g')));
});
