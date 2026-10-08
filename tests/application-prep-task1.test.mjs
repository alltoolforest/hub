import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {A4_POINTS,sourcePixelLimit,outputPixelLimit,checkPixels,checkApplicationFit,
 validateEncodedBlob,sniffImageDimensions,validatePdfPages} from '../assets/js/application-prep-checks.js';

const require=createRequire(import.meta.url);
const PDFLib=require('../assets/vendor/pdf-lib.js');
const app=readFileSync(new URL('../assets/js/application-prep.js',import.meta.url),'utf8');
const images=readFileSync(new URL('../assets/js/images.js',import.meta.url),'utf8');

test('input/output pixel budgets are device-specific and bounded',()=>{
 assert.equal(sourcePixelLimit(true),16_000_000);
 assert.equal(sourcePixelLimit(false),30_000_000);
 assert.equal(outputPixelLimit(true),8_000_000);
 assert.equal(outputPixelLimit(false),24_000_000);
 assert.deepEqual(checkPixels(4000,3000,sourcePixelLimit(true)),{width:4000,height:3000});
 for(const [w,h] of [[0,10],[-1,10],[1.5,10],[16385,5],[9000,9000],[NaN,10]]){
   assert.throws(()=>checkPixels(w,h,8_000_000),/limit/);
 }
});
test('distorting stretch mode is rejected, contain and cover are permitted',()=>{
 assert.equal(checkApplicationFit('contain'),'contain');
 assert.equal(checkApplicationFit('cover'),'cover');
 assert.throws(()=>checkApplicationFit('stretch'),/Stretch/);
 assert.throws(()=>checkApplicationFit('invalid'),/valid fit/);
});
test('actual format and nonempty output are mandatory',()=>{
 assert.throws(()=>validateEncodedBlob({size:10,type:'image/png'},'image/webp',100,100),/did not produce/);
 assert.throws(()=>validateEncodedBlob({size:0,type:'image/png'},'image/png',100,100),/empty/);
 assert.deepEqual(validateEncodedBlob({size:2048,type:'image/jpeg'},'image/jpeg',100,70,2),
    {kb:2,width:100,height:70,type:'image/jpeg'});
});
test('unachievable image and PDF KB limits fail without false success',()=>{
 for(const type of ['image/png','image/jpeg','application/pdf']){
   assert.throws(()=>validateEncodedBlob({size:10241,type},type,300,400,10),/exceeding/);
   assert.equal(validateEncodedBlob({size:10240,type},type,300,400,10).kb,10);
 }
});
test('PNG and JPEG metadata can stop oversize files before decoding',()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10],0);
 png.set([73,72,68,82],12);
 new DataView(png.buffer).setUint32(16,8000);new DataView(png.buffer).setUint32(20,8000);
 assert.deepEqual(sniffImageDimensions(png,'png'),{width:8000,height:8000});
 assert.throws(()=>checkPixels(8000,8000,sourcePixelLimit(true)),/limit/);
 const jpeg=new Uint8Array([255,216,255,192,0,17,8,0,100,0,200,3,1,17,0,2,17,0,3,17,0,255,217]);
 assert.deepEqual(sniffImageDimensions(jpeg,'jpg'),{width:200,height:100});
 assert.equal(sniffImageDimensions(new Uint8Array([1,2,3]),'heic'),null);
});
test('WebP extended and VP8 headers can be preflighted',()=>{
 const vp8x=new Uint8Array(30);vp8x.set([...Buffer.from('RIFF'),0,0,0,0,...Buffer.from('WEBP'),...Buffer.from('VP8X')]);
 vp8x[24]=15;vp8x[27]=31;
 assert.deepEqual(sniffImageDimensions(vp8x,'webp'),{width:16,height:32});
 const vp8=new Uint8Array(30);vp8.set([...Buffer.from('RIFF'),0,0,0,0,...Buffer.from('WEBP'),...Buffer.from('VP8 ')]);
 vp8[23]=157;vp8[24]=1;vp8[25]=42;vp8[26]=200;vp8[27]=0;vp8[28]=100;vp8[29]=0;
 assert.deepEqual(sniffImageDimensions(vp8,'webp'),{width:200,height:100});
});
test('real PDF A4 page dimensions and one page are validated',async()=>{
 const doc=await PDFLib.PDFDocument.create();
 doc.addPage(A4_POINTS);
 assert.deepEqual(validatePdfPages(doc),{width:A4_POINTS[0],height:A4_POINTS[1],pages:1});
 const bytes=await doc.save();
 const reloaded=await PDFLib.PDFDocument.load(bytes);
 assert.equal(validatePdfPages(reloaded).pages,1);
 const blob={size:bytes.length,type:'application/pdf'};
 assert.ok(validateEncodedBlob(blob,'application/pdf',500,300).kb>0);
 reloaded.addPage([300,300]);
 assert.throws(()=>validatePdfPages(reloaded),/page count/);
});
test('PDF wrong page size is rejected',async()=>{
 const doc=await PDFLib.PDFDocument.create();doc.addPage([400,500]);
 assert.throws(()=>validatePdfPages(doc),/not A4/);
});
test('application uploads commit only after successful decode and validation',()=>{
 const beforeCommit=app.slice(app.indexOf('bindFile(input,async files=>'),app.indexOf('const point=e=>'));
 assert.ok(beforeCommit.indexOf('await decodeImage(candidateFile)')<beforeCommit.indexOf('image=candidate'));
 assert.ok(beforeCommit.indexOf('checkPixels(candidate.width')<beforeCommit.indexOf('image=candidate'));
 assert.match(beforeCommit,/const old=\{image,file,crop,drag,manual\}/);
 assert.match(beforeCommit,/image=old.image;file=old.file/);
 assert.match(beforeCommit,/if\(candidate!==image\)candidate\?\.close\?\.\(\)/);
 assert.match(beforeCommit,/const header=new Uint8Array\(await candidateFile.slice/);
});
test('render/encode and PDF action clean up canvases even after failure',()=>{
 assert.match(app,/finally\{if\(temp\)temp.width=temp.height=0;\}/);
 assert.equal((app.match(/finally\{if\(c\)c.width=c.height=0;\}/g)||[]).length,2);
 assert.match(app,/validateEncodedBlob\(blob,type,c.width,c.height,target\)/);
 assert.match(app,/validateEncodedBlob\(blob,'application\/pdf',c.width,c.height,target\)/);
 assert.match(app,/validatePdfPages\(doc\)/);
});
test('prior output is retained until successful image or PDF export',()=>{
 for(const label of ['Create image','Create supporting-image PDF']){
   const i=app.indexOf("action('"+label+"'");
   const end=app.indexOf('finally{if(c)c.width=c.height=0;}',i);
   const action=app.slice(i,end);
   assert.ok(i>=0&&end>i);
   assert.ok(action.indexOf('validateEncodedBlob(blob')>=0);
   assert.ok(action.indexOf('validateEncodedBlob(blob')<action.indexOf('clearOutputs()'));
 }
});
test('PDF retains A4 and uses JPEG for JPEG inputs without mandatory PNG expansion',()=>{
 assert.match(app,/const jpeg=read\('format'\)==='image\/jpeg'/);
 assert.match(app,/jpeg\?await doc.embedJpg/);
 assert.match(app,/doc.addPage\(A4_POINTS\)/);
});
test('frozen image tool entrypoints and processing remain untouched',()=>{
 const mount=images.match(/export async function mount\(root,slug\)\{[^\n]+/);
 assert.ok(mount,'image mount should remain intact');
 assert.match(mount[0],/if\(slug==='application-document-prep'\)return \(await import\('\.\/application-prep\.js'\)\)\.mount\(root\);/);
 assert.match(mount[0],/if\(slug==='batch'\)return batch\(root\)/);
 assert.match(mount[0],/if\(slug==='background-remover'\)return background\(root\)/);
 assert.match(images,/export async function encodeTarget\(/);
});
