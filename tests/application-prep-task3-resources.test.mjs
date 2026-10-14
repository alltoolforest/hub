import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applicationResourceProfile,sniffHeicDimensions,workingCanvasSize,deadline} from '../assets/js/application-prep-resources.js';

function fakeHeic(width,height){
 const b=new Uint8Array(60),v=new DataView(b.buffer);
 v.setUint32(0,24);b.set([...Buffer.from('ftypheic')],4);
 v.setUint32(28,20);b.set([...Buffer.from('ispe')],32);
 v.setUint32(40,width);v.setUint32(44,height);return b;
}
test('phone landscape, tablet, coarse pointer and device memory retain strict budgets',()=>{
 for(const profile of [
  {userAgent:'Mozilla/5.0 (Linux; Android 16; Mobile)',viewportWidth:1350},
  {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',touchPoints:5,viewportWidth:1190},
  {userAgent:'Mozilla/5.0',coarsePointer:true,touchPoints:10,viewportWidth:1024},
  {userAgent:'Mozilla/5.0 (Windows NT 10.0)',deviceMemory:4,viewportWidth:1440},
  {userAgent:'Mozilla/5.0',viewportWidth:375}
 ]){
  const r=applicationResourceProfile(profile);
  assert.equal(r.constrained,true);
  assert.equal(r.inputPixels,16_000_000);
  assert.equal(r.outputPixels,8_000_000);
  assert.equal(r.heicPixels,12_000_000);
  assert.equal(r.maxFileMB,20);
 }
 const desktop=applicationResourceProfile({userAgent:'Desktop Windows',deviceMemory:16,viewportWidth:1600});
 assert.equal(desktop.constrained,false);
 assert.equal(desktop.inputPixels,30_000_000);
 assert.equal(desktop.outputPixels,24_000_000);
 assert.ok(Object.isFrozen(desktop));
});
test('actual HEIC spatial extents are safely decoded from header before conversion',()=>{
 assert.deepEqual(sniffHeicDimensions(fakeHeic(4032,3024)),{width:4032,height:3024});
 assert.equal(sniffHeicDimensions(new Uint8Array(16)),null);
 const bad=fakeHeic(4032,3024);bad[7]=0;
 assert.equal(sniffHeicDimensions(bad),null);
 const badWidth=fakeHeic(0,3000);
 assert.equal(sniffHeicDimensions(badWidth),null);
 const truncated=fakeHeic(3200,2400).subarray(0,38);
 assert.equal(sniffHeicDimensions(truncated),null);
});
test('working canvas tracks output pixel budget without changing dimensions',()=>{
 const a=workingCanvasSize(4000,3000,200,230,0,'cover',8_000_000);
 assert.ok(a.width>=200&&a.height>=230);
 assert.ok(a.width*a.height<500_000);
 const b=workingCanvasSize(4000,3000,230,200,90,'cover',8_000_000);
 assert.ok(b.width*b.height<500_000);
 const c=workingCanvasSize(500,500,2000,2000,0,'contain',8_000_000);
 assert.deepEqual(c,{width:500,height:500});
 const d=workingCanvasSize(10000,10000,10000,10000,0,'cover',8_000_000);
 assert.ok(d.width*d.height<=8_100_000);
 assert.throws(()=>workingCanvasSize(0,100,20,20,0,'cover',8000000),/Invalid/);
});
test('late decoder completion is disposed after deadline',async()=>{
 let resolveDecode,disposed=0;
 const never=new Promise(resolve=>{resolveDecode=resolve;});
 await assert.rejects(deadline(never,10,'Image decoding',x=>x.close()),/too long/);
 resolveDecode({close:()=>disposed++});
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(disposed,1);
 const value=await deadline(Promise.resolve('decoded'),50,'Image decoding');
 assert.equal(value,'decoded');
 await assert.rejects(deadline(Promise.reject(Error('bad input')),50),/bad input/);
});
test('Task 3 resource checks belong only to Application Prep and preserve output safety',()=>{
 const src=readFileSync(new URL('../assets/js/application-prep.js',import.meta.url),'utf8');
 assert.match(src,/sourcePixelLimit\(mobile\(\)\)/);
 assert.match(src,/outputPixelLimit\(mobile\(\)\)/);
 assert.match(src,/sniffHeicDimensions\(header\)/);
 assert.match(src,/if\(!dimensions\)throw Error/);
 assert.match(src,/deadline\(decodeImage\(candidateFile\)/);
 assert.match(src,/workingCanvasSize\(sw,sh,w,h,rotation,fit,limit\)/);
 assert.match(src,/exportStarted=performance\.now\(\)/);
 assert.match(src,/validateApplicationFileSize\(blob,minimumKB,target\)/);
 assert.match(src,/validatePdfPages\(reopened\)/);
});
