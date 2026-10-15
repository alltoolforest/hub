import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {buildFixture,PDF} from './pdf-compressor-task1-fixtures.mjs';
import {createIndependentReaders} from '../assets/js/pdf-compressor-v2/independent-readers.mjs';
import {compressAndVerifyPDF} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';
import {optimizeLosslessly} from '../assets/js/pdf-compressor-v2/lossless-core.mjs';
import {recoveryCode,attemptOptionalStage} from '../assets/js/pdf-compressor-v2/recoverable-stage-policy.mjs';
if(!globalThis.crypto?.subtle)globalThis.crypto=webcrypto;
const readers=createIndependentReaders(pdfjs);
const source=(await buildFixture('digital')).bytes;

test('known lossless optimizer failure retains exact original with a fresh independent final receipt',async()=>{
 const unchanged=source.slice(),readText=readers.readText;
 let textCalls=0;
 const result=await compressAndVerifyPDF(source,{PDF,...readers,
  readText:async(...args)=>{textCalls++;return readText(...args);},
  mode:'lossless',optimize:async()=>{throw Error('provider-temporary-failure');}});
 assert.equal(result.status,'original-retained');
 assert.deepEqual(result.bytes,unchanged);
 assert.equal(result.stages.length,1);
 assert.equal(result.stages[0].status,'preserved-after-failure');
 assert.equal(result.stages[0].reason,'optimizer-failed');
 assert.equal(result.integrity.independentTextVerified,true);
 assert.equal(result.integrity.sourceDigest,result.integrity.outputDigest);
 assert.equal(result.outputBytes,result.inputBytes);
 assert.ok(textCalls>=2,'failure recovery must not skip final source/output text verification');
 assert.deepEqual(source,unchanged,'no fallback attempt may mutate user input');
});
test('allowlisted image-output verification failure discards that candidate and permits safe follow-up',async()=>{
 const events=[];
 const result=await attemptOptionalStage('embedded-images',async()=>{
  throw Error('image-output-integrity-failed');
 },{onFallback:record=>events.push(record)});
 assert.equal(result.status,'recovered');
 assert.equal(result.reason,'image-output-integrity-failed');
 assert.deepEqual(events,[{stage:'embedded-images',reason:'image-output-integrity-failed'}]);
 const another=await attemptOptionalStage('lossless',async()=>({verified:true}));
 assert.equal(another.status,'completed');
 assert.equal(another.value.verified,true);
});
test('unknown image or optimizer errors, input/restriction failures and unsafe memory cases never recover',async()=>{
 const cases=[
  ['embedded-images',Error('protected-document-structure-changed')],
  ['embedded-images',Error('signed-pdf')],
  ['lossless',Object.assign(Error('unsafe'),{code:'encrypted-pdf'})],
  ['lossless',Object.assign(Error('unsafe'),{code:'decoded-stream-limit'})],
  ['lossless',Object.assign(Error('unverified'),{code:'final-text-or-geometry-changed'})],
  ['lossless',RangeError('out of memory')],
  ['lossless',Error('unhandled-unknown-provider-error')],
  ['embedded-images',Error('independent-verification-required')],
 ];
 for(const [stage,sourceError] of cases){
  assert.equal(recoveryCode(stage,sourceError),null);
  await assert.rejects(attemptOptionalStage(stage,async()=>{throw sourceError;}),e=>e===sourceError);
 }
});
test('cancellation while an optional stage is failing never produces fallback output',async()=>{
 const controller=new AbortController(),error=Error('optimizer-failed');
 await assert.rejects(attemptOptionalStage('lossless',async()=>{
  controller.abort();throw error;
 },{signal:controller.signal}),e=>e===error);
 const pre=AbortSignal.abort();
 await assert.rejects(attemptOptionalStage('lossless',async()=>42,{signal:pre}),e=>e.code==='cancelled');
});
test('lossless core never downgrades memory exhaustion or cancellation to optimizer-failed',async()=>{
 const input=new Uint8Array(128).fill(2);
 const inspect=async()=>({valid:true,signed:false,encrypted:false,unknownSecurity:false,fingerprint:'exact'});
 await assert.rejects(optimizeLosslessly(input,{inspect,optimize:async()=>{throw RangeError('OOM');}}),
  e=>e instanceof RangeError);
 await assert.rejects(optimizeLosslessly(input,{inspect,optimize:async()=>{
  throw Object.assign(Error('unsafe'),{code:'decoded-stream-limit'});
 }}),e=>e.code==='decoded-stream-limit');
 const controller=new AbortController();
 await assert.rejects(optimizeLosslessly(input,{inspect,signal:controller.signal,optimize:async()=>{
  controller.abort();throw Error('native-module-aborted');
 }}),e=>e.code==='cancelled');
});
