import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {inflateStreamBounded} from '../assets/js/pdf-compressor-v2/lossless-invariants.mjs';

const payload=Buffer.from('BT /F1 12 Tf (synthetic fixture) Tj ET'.repeat(24));
const complete=deflateSync(payload);
const noTrailer=complete.subarray(0,-4);
const partialTrailer=complete.subarray(0,-2);
const wrongChecksum=Buffer.from(complete);
wrongChecksum[wrongChecksum.length-1]^=0xff;
const damagedRaw=Buffer.from(noTrailer);
damagedRaw[Math.max(3,Math.floor(damagedRaw.length/2))]^=0xff;

test('normal zlib remains strict and decodes exactly',async()=>{
  const out=await inflateStreamBounded(new Uint8Array(complete),1_000_000);
  assert.deepEqual(Buffer.from(out),payload);
});

test('complete raw DEFLATE with wholly missing Adler trailer is recovered exactly',async()=>{
  const out=await inflateStreamBounded(new Uint8Array(noTrailer),1_000_000);
  assert.deepEqual(Buffer.from(out),payload);
});

test('partial Adler trailer is rejected',async()=>{
  await assert.rejects(()=>inflateStreamBounded(new Uint8Array(partialTrailer),1_000_000));
});

test('wrong Adler checksum is rejected rather than repaired',async()=>{
  await assert.rejects(()=>inflateStreamBounded(new Uint8Array(wrongChecksum),1_000_000));
});

test('damaged raw DEFLATE is rejected',async()=>{
  await assert.rejects(()=>inflateStreamBounded(new Uint8Array(damagedRaw),1_000_000));
});

test('decoded-byte budget remains enforced on recovery path',async()=>{
  await assert.rejects(
    ()=>inflateStreamBounded(new Uint8Array(noTrailer),32),
    error=>error?.code==='decoded-stream-limit'
  );
});
