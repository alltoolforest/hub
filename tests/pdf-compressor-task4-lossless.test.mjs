import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeLosslessly,LosslessCompressionError} from '../assets/js/pdf-compressor-v2/lossless-core.mjs';
const source=new TextEncoder().encode('%PDF-1.7 original payload data');
const small=new TextEncoder().encode('%PDF-1.7 ok');
const safe=async()=>({valid:true,signed:false,encrypted:false,fingerprint:'same'});
test('lossless provider returns smaller verified output and factual savings',async()=>{
  const result=await optimizeLosslessly(source,{optimize:async()=>small,inspect:safe});
  assert.equal(result.status,'compressed');
  assert.equal(result.savedBytes,source.length-small.length);
});
test('same-size or larger results retain original bytes',async()=>{
  const result=await optimizeLosslessly(source,{optimize:async()=>new Uint8Array(source.length+40),inspect:safe});
  assert.equal(result.status,'original-retained');
  assert.deepEqual(result.bytes,source);
});
test('rejects preservation failures',async()=>{
  await assert.rejects(optimizeLosslessly(source,{
    optimize:async()=>small,inspect:async bytes=>({
      valid:true,fingerprint:bytes.length===source.length?'before':'after'
    })}),e=>e.code==='preservation-check-failed');
});
test('rejects unsafe documents and missing approved engine',async()=>{
  await assert.rejects(optimizeLosslessly(source,{}),e=>e.code==='unapproved-or-unavailable-engine');
  for(const key of ['signed','encrypted','unknownSecurity']){
    await assert.rejects(optimizeLosslessly(source,{
      inspect:async()=>({valid:true,fingerprint:'same',[key]:true}),
      optimize:async()=>small
    }),e=>e.code==='restricted-pdf');
  }
});
test('does not mutate input and fail-closed on optimizer exceptions',async()=>{
  const copy=source.slice();
  await assert.rejects(optimizeLosslessly(source,{inspect:safe,optimize:async()=>{throw Error('broken');}}),
    e=>e instanceof LosslessCompressionError&&e.code==='optimizer-failed');
  assert.deepEqual(source,copy);
});
