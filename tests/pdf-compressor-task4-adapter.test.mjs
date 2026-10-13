import test from 'node:test';
import assert from 'node:assert/strict';
import {createQpdfLosslessProvider,runVerifiedLossless} from '../assets/js/pdf-compressor-v2/qpdf-lossless-adapter.mjs';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {createIndependentInputReader} from '../assets/js/pdf-compressor-v2/independent-input-reader.mjs';
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const readPages=createIndependentInputReader(pdfjs);
test('adapter bounds inputs, requires clean exit and unlinks temporary files on success and failure',async()=>{
  for(const exitCode of [0,3]){
    const files=new Map(),removed=[],source=new Uint8Array(20).fill(42);
    const optimize=createQpdfLosslessProvider(async settings=>{
      assert.equal(settings.noInitialRun,true);
      return {FS:{writeFile:(name,bytes)=>files.set(name,bytes),readFile:name=>files.get(name),
        unlink:name=>{removed.push(name);files.delete(name);}},
        callMain:args=>{
          assert.ok(args.includes('--preserve-unreferenced'));
          assert.ok(args.includes('--remove-unreferenced-resources=no'));
          files.set('/compressor-output.pdf',source);return exitCode;
        }};
    });
    if(exitCode===0){const output=await optimize(source);assert.deepEqual(output,source);assert.notEqual(output,source);}
    else await assert.rejects(optimize(source),/unclean-exit/);
    assert.equal(files.size,0);assert.equal(removed.length,2);
  }
});
test('source restrictions run before the optimizer and an unchanged document returns honest zero savings',async()=>{
  let calls=0;
  const signed=(await buildFixture('signed-marker')).bytes;
  await assert.rejects(runVerifiedLossless(signed,{PDF,readPages,optimize:async bytes=>{calls++;return bytes;}}),e=>e.code==='signed-pdf');
  assert.equal(calls,0);
  const {bytes}=await buildFixture('digital');
  const result=await runVerifiedLossless(bytes,{PDF,readPages,optimize:async input=>input});
  assert.equal(result.status,'original-retained');assert.equal(result.savedBytes,0);
  assert.deepEqual(result.bytes,bytes);
});
