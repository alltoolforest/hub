import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {chromium,firefox,webkit} from 'playwright';

// Browser-level checksumless Flate regression. Uses synthetic bytes exclusively,
// tests the production source module at a local origin under all three engines.
const browserName=process.env.PDF_COMPRESSOR_BROWSER??'chromium';
const engine={chromium,firefox,webkit}[browserName];
if(!engine)throw Error('unrecognized-browser');
const source=new TextEncoder().encode('Original PDF content must remain intact. '.repeat(100));
const encoded=new Uint8Array(deflateSync(source));
const samples={
 complete:Array.from(encoded),
 missingAdler:Array.from(encoded.subarray(0,encoded.length-4)),
 truncatedData:Array.from(encoded.subarray(0,encoded.length-7)),
 corruptChecksum:Array.from((()=>{const c=encoded.slice();c[c.length-1]^=3;return c;})()),
 source:Array.from(source)
};
const browser=await engine.launch();
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async samples=>{
  const {inflateStreamBounded}=await import('/assets/js/pdf-compressor-v2/lossless-invariants.mjs');
  const inflate=async arr=>{
   try{return {ok:true,result:Array.from(await inflateStreamBounded(new Uint8Array(arr),samples.source.length))};}
   catch(e){return {ok:false,name:String(e?.name??''),code:String(e?.code??'')};}
  };
  return {complete:await inflate(samples.complete),missingAdler:await inflate(samples.missingAdler),
   truncatedData:await inflate(samples.truncatedData),corruptChecksum:await inflate(samples.corruptChecksum)};
 },samples);
 assert.equal(result.complete.ok,true,JSON.stringify({browserName,result}));
 assert.deepEqual(result.complete.result,samples.source);
 assert.equal(result.missingAdler.ok,true,JSON.stringify({browserName,result}));
 assert.deepEqual(result.missingAdler.result,samples.source);
 assert.equal(result.truncatedData.ok,false,'truncated compressed deflate must be rejected');
 assert.equal(result.corruptChecksum.ok,false,'wrong Adler checksum must be rejected');
 console.log(JSON.stringify({browser:browserName,nativeValid:true,missingAdlerRecovered:true,
  compressedTruncationRejected:true,invalidChecksumRejected:true}));
 await page.close();
}finally{await browser.close();}
