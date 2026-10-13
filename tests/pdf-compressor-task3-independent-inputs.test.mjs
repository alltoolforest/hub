import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {PDF} from './pdf-compressor-task1-fixtures.mjs';
import {inspectPDFInput,createInputSession} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
const fixtureDirectory=process.env.PDF_COMPRESSOR_INDEPENDENT_FIXTURES;
if(!fixtureDirectory)throw new Error('Generate the independent fixtures and set PDF_COMPRESSOR_INDEPENDENT_FIXTURES; do not silently skip this gate.');
const pdfjs=await import(process.env.PDFJS_TEST_MODULE??'pdfjs-dist/legacy/build/pdf.mjs');
const options={PDF,readPages:createIndependentInputReader(pdfjs)};
const read=async name=>new Uint8Array(await readFile(resolve(fixtureDirectory,name)));
test('independent authoring stack: digital, color scan-like and grayscale scan-like PDFs',async()=>{
  for(const [name,type] of [['independent-text.pdf','digital'],['independent-scan-color.pdf','image-only'],['independent-scan-gray.pdf','image-only']]){
    const bytes=await read(name),before=bytes.slice();
    const report=await inspectPDFInput(bytes,options);
    assert.equal(report.classification,type);
    assert.deepEqual(bytes,before);
    if(type==='digital'){
      for(const structure of ['forms','bookmarks','links','annotations','metadata'])
        assert.equal(report.structures[structure],true,structure);
    }else assert.equal(report.images.length,1);
  }
});
test('genuinely encrypted and cryptographically signed PDFs are rejected without modifying original bytes',async()=>{
  const session=createInputSession((bytes)=>inspectPDFInput(bytes,options));
  const original=await read('independent-text.pdf');await session.replace(original);
  for(const [name,code] of [['encrypted.pdf','encrypted-pdf'],['signed.pdf','signed-pdf']]){
    const bytes=await read(name),before=bytes.slice();
    await assert.rejects(session.replace(bytes),e=>e.code===code);
    assert.deepEqual(bytes,before);assert.deepEqual(session.sourceBytes(),original);
  }
});
