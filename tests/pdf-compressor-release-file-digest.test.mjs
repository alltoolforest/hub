import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompressionSession} from '../assets/js/pdf-compressor-v2/compression-session.mjs';
import {digestPDFBytes} from '../assets/js/pdf-compressor-v2/output-integrity.mjs';

const sourceBytes=new TextEncoder().encode('%PDF-1.7\nSelected file immutable source!\n%%EOF\n');
async function fakeReceipt(mode,source=sourceBytes){
 const sha=await digestPDFBytes(source);
 return {bytes:source.slice(),mode,status:'original-retained',inputBytes:source.length,
   outputBytes:source.length,savedBytes:0,integrity:{version:1,mode,sourceDigest:sha,
     outputDigest:sha,inputBytes:source.length,outputBytes:source.length,savedBytes:0,
     independentTextVerified:true}};
}
test('File owned selection never calls main-thread arrayBuffer and retains exact SHA-256 binding',async()=>{
 const file=new File([sourceBytes],'verified.pdf');
 let workerInspections=0,workerCompressions=0,created=0;
 // Worker receives a structured cloned immutable File. Main-thread full-read
 // is explicitly forbidden here, even if File is large.
 Object.defineProperty(file,'arrayBuffer',{value:()=>{throw Error('main-thread-file-read');}});
 const digest=await digestPDFBytes(sourceBytes);
 const session=createCompressionSession({engine:{
   inspect:async()=>{throw Error('wrong main-thread inspection');},
   compress:async()=>{throw Error('wrong main-thread compression');},
   inspectFile:async f=>{assert.equal(f,file);workerInspections++;return {valid:true,sourceBytes:file.size,sourceDigest:digest};},
   compressFile:async(f,{mode})=>{assert.equal(f,file);workerCompressions++;return fakeReceipt(mode);}
 },createURL:()=>{created++;return 'blob:verified';},revokeURL:()=>{}});
 assert.equal((await session.select(file)).status,'ready');
 for(const mode of ['lossless','balanced','strong','maximum']){
   assert.equal((await session.compress(mode)).status,'completed');
   assert.equal(session.snapshot().result.integrity.sourceDigest,digest);
 }
 assert.equal(workerInspections,1);assert.equal(workerCompressions,4);assert.equal(created,4);
 session.dispose();
});
test('A missing, malformed or mismatched worker digest cannot release output',async()=>{
 for(const digest of [undefined,'a'.repeat(64),'F'.repeat(64)]){
   let outputs=0,compressions=0;
   const file=new File([sourceBytes],'untrusted.pdf');
   Object.defineProperty(file,'arrayBuffer',{value:()=>{throw Error('unexpected full read');}});
   const session=createCompressionSession({engine:{
     inspect:async()=>{},compress:async()=>{},
     inspectFile:async()=>({valid:true,sourceBytes:file.size,sourceDigest:digest}),
     compressFile:async()=>{compressions++;return fakeReceipt('lossless');}
   },createURL:()=>{outputs++;return 'blob:unsafe';}});
   if(digest==='a'.repeat(64)){
     // 64 lowercase hexadecimal but does NOT describe the selected source.
     assert.equal((await session.select(file)).status,'ready');
     assert.equal((await session.compress('lossless')).status,'failed');
   }else assert.equal((await session.select(file)).status,'failed');
   assert.equal(outputs,0);assert.equal(session.snapshot().canDownload,false);
   if(digest!=='a'.repeat(64))assert.equal(compressions,0);
   session.dispose();
 }
});
