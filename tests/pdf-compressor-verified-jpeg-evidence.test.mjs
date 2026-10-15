import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createVerifiedJpegEvidenceCache} from '../assets/js/pdf-compressor-v2/verified-jpeg-evidence.mjs';
if(!globalThis.crypto?.subtle)globalThis.crypto=webcrypto;
const original=new Uint8Array([10,20,30,40,50]),candidate=new Uint8Array([255,216,1,2,255,217]);
const base=()=>({bytes:candidate.slice(),originalStream:{contents:original.slice()},
  descriptor:{width:20,height:20,bitsPerComponent:8,filter:'/DCTDecode',colorSpace:'/DeviceCMYK'},
  width:10,height:10,mode:'maximum'});
test('only byte-identical source and JPEG candidate can reuse a previously verified quality approval',async()=>{
 let checks=0;
 const cache=createVerifiedJpegEvidenceCache(async()=>{checks++;return true;});
 const data=base();
 assert.equal(await cache(data),true);
 assert.equal(await cache({...data,bytes:data.bytes.slice(),originalStream:{contents:data.originalStream.contents.slice()}}),true);
 assert.equal(checks,1,'identical decoded candidate quality must not be recomputed twice');
 for(const change of [
  x=>{x.bytes[3]^=1;},
  x=>{x.originalStream.contents[0]^=1;},
  x=>{x.descriptor.colorSpace='/DeviceRGB';},
  x=>{x.descriptor.width++;},
  x=>{x.width++;},
  x=>{x.mode='strong';}
 ]){const next=base();change(next);assert.equal(await cache(next),true);}
 assert.equal(checks,7,'each meaningful difference must trigger independent quality verification');
});
test('a failed image quality check is never cached as successful',async()=>{
 let checks=0;
 const cache=createVerifiedJpegEvidenceCache(async()=>{checks++;return false;});
 assert.equal(await cache(base()),false);
 assert.equal(await cache(base()),false);
 assert.equal(checks,2);
});
test('abort never reuses approval and malformed evidence is never approved',async()=>{
 const controller=new AbortController();
 let checks=0;
 const cache=createVerifiedJpegEvidenceCache(async()=>{checks++;return true;},{signal:controller.signal});
 assert.equal(await cache(base()),true);
 controller.abort();
 await assert.rejects(cache(base()),/cancelled/);
 assert.equal(checks,1);
 const malformed=createVerifiedJpegEvidenceCache(async()=>true);
 assert.equal(await malformed({bytes:new Uint8Array(),descriptor:{}}),false);
});
test('verification failures cannot be converted to approvals',async()=>{
 const cache=createVerifiedJpegEvidenceCache(async()=>{throw Error('decoder-failed');});
 await assert.rejects(cache(base()),/decoder-failed/);
 assert.throws(()=>createVerifiedJpegEvidenceCache(async()=>true,{maxEntries:2000}),/invalid-jpeg-verification-budget/);
});
