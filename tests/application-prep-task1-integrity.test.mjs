import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 checkApplicationSizeRange,validateApplicationFileSize,sniffExportType,
 validateExportSignature,validateDecodedImageDimensions
} from '../assets/js/application-prep-checks.js';

test('minimum/maximum KB can be specified independently and exact range is preserved',()=>{
 assert.deepEqual(checkApplicationSizeRange(0,0),{minimumKB:0,maximumKB:0});
 assert.deepEqual(checkApplicationSizeRange(10,0),{minimumKB:10,maximumKB:0});
 assert.deepEqual(checkApplicationSizeRange(0,50),{minimumKB:0,maximumKB:50});
 assert.deepEqual(checkApplicationSizeRange(10,20),{minimumKB:10,maximumKB:20});
 for(const input of [[20,10],[-1,10],[1,-1],[NaN,2],[Infinity,3],[2,Infinity],[50001,0],[0,50001]])
  assert.throws(()=>checkApplicationSizeRange(...input),/file size|Minimum file size/);
});

test('size range checks are byte-exact at inclusive endpoints',()=>{
 for(const [minimum,maximum] of [[10,20],[10,0],[0,20]]){
  for(const kb of [10,15,20]){
   const shouldPass=(!minimum||kb>=minimum)&&(!maximum||kb<=maximum);
   if(shouldPass)assert.equal(validateApplicationFileSize({size:kb*1024},minimum,maximum).kb,kb);
   else assert.throws(()=>validateApplicationFileSize({size:kb*1024},minimum,maximum));
  }
 }
 assert.throws(()=>validateApplicationFileSize({size:10*1024-1},10,0),/below the requested minimum/);
 assert.throws(()=>validateApplicationFileSize({size:20*1024+1},0,20),/exceeding the requested maximum/);
 assert.throws(()=>validateApplicationFileSize({size:0},0,0),/empty or invalid/);
 assert.throws(()=>validateApplicationFileSize(null,0,0),/empty or invalid/);
 assert.throws(()=>validateApplicationFileSize({size:2048},20,10),/Minimum file size/);
});

test('true output formats are recognized by magic bytes, not MIME claims',()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 const jpg=new Uint8Array([255,216,255,224,0,1]);
 const webp=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80,0]);
 const pdf=new Uint8Array([37,80,68,70,45,49,46,55,10]);
 for(const [bytes,type] of [[png,'image/png'],[jpg,'image/jpeg'],[webp,'image/webp'],[pdf,'application/pdf']]){
  assert.equal(sniffExportType(bytes),type);
  assert.equal(validateExportSignature(bytes,type),type);
 }
 assert.equal(sniffExportType(new Uint8Array([71,73,70,56,57,97])),null);
 assert.throws(()=>validateExportSignature(png,'image/jpeg'),/does not match the requested format/);
 assert.throws(()=>validateExportSignature(new Uint8Array([1,2]),'application/pdf'),/does not match/);
});

test('independent decoded image dimensions must match requested output exactly',()=>{
 assert.deepEqual(validateDecodedImageDimensions(140,60,140,60),{width:140,height:60});
 for(const dims of [[141,60,140,60],[140,61,140,60],[0,60,140,60],[140.5,60,140,60]])
  assert.throws(()=>validateDecodedImageDimensions(...dims),/do not match/);
});

test('Task 1 wires checks into both export paths and retains prior download on errors',()=>{
 const app=readFileSync(new URL('../assets/js/application-prep.js',import.meta.url),'utf8');
 assert.match(app,/add\('min-kb','Minimum file size/);
 assert.match(app,/checkApplicationSizeRange\(num\('min-kb'/);
 assert.equal((app.match(/validateApplicationFileSize\(blob,minimumKB,target\)/g)||[]).length,2);
 assert.equal((app.match(/await verifyApplicationExport\(blob,/g)||[]).length,2);
 assert.match(app,/validateDecodedImageDimensions\(decoded.width,decoded.height,width,height\)/);
 assert.match(app,/const reopened=await p.PDFDocument.load\(await blob.arrayBuffer\(\)\)/);
 assert.match(app,/validatePdfPages\(reopened\)/);
 assert.match(app,/lastResult.outdated=true/);
 assert.match(app,/fingerprint:outputFingerprint\(\)/);
 assert.match(app,/if\(cropInputsDirty\)throw Error/);
 assert.match(app,/text:'Compress an existing PDF/);
 // Existing source/processing guards remain present.
 assert.match(app,/checkPixels\(candidate.width,candidate.height,limit/);
 assert.match(app,/finally\{if\(c\)c.width=c.height=0;\}/);
});
