// Synthetic-only regression for PDFs containing a complete DEFLATE payload
// but no Adler-32 trailer. This is a diagnostic test, NOT authorization to
// accept missing integrity data in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync, inflateRawSync, inflateSync} from 'node:zlib';
const payload=Buffer.from('BT /F1 12 Tf (synthetic fixture) Tj ET'.repeat(24));
const complete=deflateSync(payload);
const noTrailer=complete.subarray(0,-4);
const damaged=Buffer.from(noTrailer);
damaged[2]^=0xff;
function diagnose(bytes){
  if(bytes.length<6||bytes[0]!==0x78) return 'not-recognized-zlib';
  try {inflateSync(bytes);return 'verified-zlib';} catch {}
  try {
    const output=inflateRawSync(bytes.subarray(2),{info:true});
    if(output.engine.bytesWritten!==bytes.length-2) return 'trailing-unverified-data';
    return 'missing-adler32-unverifiable';
  }catch{return 'invalid-deflate';}
}
test('complete synthetic zlib verifies',()=>assert.equal(diagnose(complete),'verified-zlib'));
test('complete DEFLATE with absent checksum is NOT verified',()=>assert.equal(diagnose(noTrailer),'missing-adler32-unverifiable'));
test('damaged DEFLATE is rejected',()=>assert.equal(diagnose(damaged),'invalid-deflate'));
test('trailing bytes are not silently ignored',()=>assert.equal(diagnose(Buffer.concat([noTrailer,Buffer.from('junk')])),'trailing-unverified-data'));
