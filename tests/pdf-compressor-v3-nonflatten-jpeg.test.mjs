import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {recompressJpegXObjects,V3ImageRecodeError,RECODE_PROFILES}
  from '../assets/js/pdf-compressor-v3/nonflatten-jpeg-recode.mjs';
const require=createRequire(import.meta.url);
const PDF=require('../assets/js/pdf-compressor-v2/vendor/pdf-lib/pdf-lib.js');
const bytes=await (async()=>{const doc=await PDF.PDFDocument.create();
 doc.addPage([612,792]).drawText('Selectable text must survive any nonflattening operation.');
 return new Uint8Array(await doc.save());})();
const fail=code=>error=>error instanceof V3ImageRecodeError&&error.code===code;
test('non-flattening mode requires independent security inspection and verifier',async()=>{
 await assert.rejects(recompressJpegXObjects(bytes,{PDF}),fail('security-inspection-required'));
 await assert.rejects(recompressJpegXObjects(bytes,{PDF,
   inspectRestrictions:async()=>({allowed:true})}),fail('independent-verification-required'));
});
test('non-flattening mode rejects restricted sources without touching them',async()=>{
 let verified=0;
 await assert.rejects(recompressJpegXObjects(bytes,{PDF,
  inspectRestrictions:async()=>({allowed:false,code:'signed-pdf'}),
  verifyOutput:async()=>{verified++;return true;}}),fail('signed-pdf'));
 assert.equal(verified,0);
});
test('digital text pages with no eligible images remain unmodified; no false savings',async()=>{
 const orig=bytes.slice();
 const result=await recompressJpegXObjects(bytes,{PDF,mode:'maximum',
  inspectRestrictions:async()=>({allowed:true}),verifyOutput:async()=>true});
 assert.equal(result.status,'no-eligible-images');
 assert.equal(result.bytes,null);
 assert.deepEqual(bytes,orig);
});
test('profile size and quality reduce from Balanced to Maximum',()=>{
 assert.ok(RECODE_PROFILES.balanced.maxDimension>RECODE_PROFILES.strong.maxDimension);
 assert.ok(RECODE_PROFILES.strong.maxDimension>RECODE_PROFILES.maximum.maxDimension);
 assert.ok(RECODE_PROFILES.balanced.quality>RECODE_PROFILES.maximum.quality);
});
test('bad mode, cancel and invalid input fail before document rewriting',async()=>{
 await assert.rejects(recompressJpegXObjects(bytes,{PDF,mode:'ultra',
  inspectRestrictions:async()=>({allowed:true}),verifyOutput:async()=>true}),fail('invalid-mode'));
 await assert.rejects(recompressJpegXObjects(bytes,{PDF,
  inspectRestrictions:async()=>({allowed:true}),verifyOutput:async()=>true,
  signal:AbortSignal.abort()}),fail('cancelled'));
 await assert.rejects(recompressJpegXObjects(new Uint8Array(4),{PDF}),fail('invalid-input'));
});
