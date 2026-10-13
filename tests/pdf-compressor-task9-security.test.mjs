import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {inspectPDFInput} from '../assets/js/pdf-compressor-v2/input-inspector.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
import {createIndependentTextReader} from '../assets/js/pdf-compressor-v2/independent-text-reader.mjs';
import {describeProcessingError} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
const reader=createIndependentInputReader(pdfjs),N=PDF.PDFName.of;
test('prototype-like and markup-shaped worker errors become bounded, actionable text',()=>{
  for(const code of ['constructor','toString','__proto__','<img onerror=alert(1)>','x'.repeat(10000),{}]){
    const error=describeProcessingError({code});
    assert.equal(typeof error.message,'string');assert.ok(error.message.length<200);
    assert.match(error.code,/^[a-z][a-z0-9-]{0,63}$/);assert.ok(!error.message.includes('<'));
  }
});
test('untrusted metadata remains opaque, while active actions are rejected before independent parsing',async()=>{
  const doc=await PDF.PDFDocument.load((await buildFixture('digital')).bytes,{updateMetadata:false});
  const payload='<img src=https://invalid.example onerror=alert(1)>';
  doc.setTitle(payload);
  const inert=new Uint8Array(await doc.save());
  const report=await inspectPDFInput(inert,{PDF,readPages:reader});
  assert.equal(report.structures.metadata,true);assert.equal(JSON.stringify(report).includes(payload),false);
  doc.catalog.set(N('OpenAction'),doc.context.obj({S:'JavaScript',JS:PDF.PDFString.of(payload)}));
  let parsed=false;
  await assert.rejects(inspectPDFInput(new Uint8Array(await doc.save()),{PDF,readPages:async()=>{parsed=true;}}),e=>e.code==='unsupported-actions');
  assert.equal(parsed,false);
});
test('independent readers explicitly disable eval/XFA and destroy their tasks',async()=>{
  const options=[];let destroyed=0;
  const factory={getDocument:o=>{
    options.push(o);return {promise:Promise.resolve({numPages:1,getPage:async()=>({
      view:[0,0,100,100],rotate:0,cleanup:()=>{},
      streamTextContent:()=>new ReadableStream({start:c=>c.close()}),
      getOperatorList:async()=>({fnArray:[]}),getAnnotations:async()=>[]
    })}),destroy:async()=>{destroyed++;}};
  },OPS:{}};
  await createIndependentInputReader(factory)(new Uint8Array(30));
  await createIndependentTextReader(factory)(new Uint8Array(30));
  assert.equal(destroyed,2);
  for(const config of options){assert.equal(config.isEvalSupported,false);assert.equal(config.enableXfa,false);assert.equal(config.useSystemFonts,false);}
});
